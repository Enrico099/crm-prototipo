import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CategoriaProduto, PerfilInvestidor, Tributacao } from '@prisma/client';
import { z } from 'zod';

// ============================================================
// Contrato com o microsserviço Python (apps/ai-engine/src/models.py)
// ============================================================

export type AiEngineRequest = {
  cliente: {
    id: string;
    nome: string;
    perfil: PerfilInvestidor;
    patrimonio: number;
  };
  suitability: {
    perfilCalculado: PerfilInvestidor;
    horizonteAnos: number;
    toleranciaPerda: number;
  };
  posicoes: Array<{
    produtoId: string;
    categoria: CategoriaProduto;
    valor: number;
  }>;
  catalog: Array<{
    id: string;
    nome: string;
    emissor: string;
    categoria: CategoriaProduto;
    rentabilidadeAno: number;
    risco: number;
    tributacao: Tributacao;
    perfilMinimo: PerfilInvestidor;
    liquidez: string;
    taxaAdmin: number | null;
    ativo: boolean;
  }>;
  topN: number;
};

const FATORES = ['profileMatch', 'diversification', 'yield', 'liquidity', 'cost'] as const;
const MOTIVOS = [
  'perfil_incompativel',
  'concentracao_emissor',
  'risco_alem_tolerancia',
  'ja_sobrealocado',
] as const;
const ESPECIALISTAS = [
  'suitability',
  'risco',
  'concentracao',
  'liquidez',
  'custo',
  'dados',
  'conviccao',
] as const;

const parecerSchema = z.object({
  especialista: z.enum(ESPECIALISTAS),
  nome: z.string().max(80),
  aprovado: z.boolean(),
  parecer: z.string().max(500),
});

// A resposta do motor é validada antes de ir pro banco: é um serviço externo
// e o que ele devolve vira registro de auditoria.
const respostaSchema = z.object({
  recomendacoes: z
    .array(
      z.object({
        produtoId: z.string().min(1).max(64),
        produtoNome: z.string().max(200),
        score: z.number().min(0).max(1),
        justificativa: z.string().min(1).max(4000),
        fatores: z.record(z.enum(FATORES), z.number().min(0).max(1)),
        pesos: z.record(z.enum(FATORES), z.number().min(0).max(1)),
        contribs: z
          .array(z.object({ fator: z.enum(FATORES), contrib: z.number(), frase: z.string().max(500) }))
          .max(10),
        scoreRegras: z.number().min(0).max(1).optional(),
        scoreFonte: z.string().max(80).optional(),
        // Comitê de especialistas: o que sai precisa ter todos os pareceres favoráveis
        comite: z.array(parecerSchema).max(ESPECIALISTAS.length).default([]),
      }),
    )
    .max(10),
  descartados: z
    .array(
      z.object({
        motivo: z.enum(MOTIVOS),
        count: z.number().int().min(0),
        contexto: z
          .object({
            emissor: z.string().max(200).nullish(),
            pctPatrimonio: z.number().nullish(),
          })
          .nullish(),
      }),
    )
    .default([]),
  totalAnalisados: z.number().int().min(0),
  reprovadosComite: z
    .array(
      z.object({
        produtoId: z.string().min(1).max(64),
        produtoNome: z.string().max(200),
        pareceres: z.array(parecerSchema).max(ESPECIALISTAS.length),
      }),
    )
    .max(20)
    .default([]),
  engineVersion: z.string().min(1).max(80),
});

export type AiEngineResponse = z.infer<typeof respostaSchema>;
export type AiEngineRecomendacao = AiEngineResponse['recomendacoes'][number];
export type AiEngineDescarte = AiEngineResponse['descartados'][number];
export type AiEngineReprovacao = AiEngineResponse['reprovadosComite'][number];

export type AiEngineHealth = {
  ok: boolean;
  engine?: string;
  mlCarregado?: boolean;
  erro?: string;
};

// ============================================================
// Service
// ============================================================

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token?: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000').replace(/\/$/, '');
    this.timeoutMs = Number(config.get('AI_ENGINE_TIMEOUT_MS') ?? 15_000);
    this.token = config.get<string>('AI_ENGINE_TOKEN') || undefined;
  }

  async recommend(req: AiEngineRequest, requestId?: string | null): Promise<AiEngineResponse> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/recommend`, {
        method: 'POST',
        headers: this.headers(requestId),
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const err = e as Error;
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        this.logger.error(`[${requestId}] AI engine não respondeu em ${this.timeoutMs}ms`);
        throw new GatewayTimeoutException(
          'O motor de recomendação demorou demais para responder. Tente novamente.',
        );
      }
      this.logger.error(`[${requestId}] Falha ao conectar no AI engine: ${err.message}`);
      throw new ServiceUnavailableException(
        'Motor de recomendação indisponível no momento. Tente novamente em instantes.',
      );
    }

    if (!res.ok) {
      // Só o status vai pro log: o corpo de erro do FastAPI ecoa o input
      // (nome e patrimônio do cliente).
      await res.body?.cancel().catch(() => undefined);
      this.logger.error(`[${requestId}] AI engine respondeu HTTP ${res.status}`);
      throw new BadGatewayException('O motor de recomendação retornou um erro. Tente novamente.');
    }

    const json: unknown = await res.json().catch(() => null);
    const parsed = respostaSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.error(
        `[${requestId}] Resposta do AI engine fora do contrato: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
      throw new BadGatewayException('O motor de recomendação retornou uma resposta inválida.');
    }
    return parsed.data;
  }

  /** Health check com timeout curto — usado em GET /api/health */
  async health(): Promise<AiEngineHealth> {
    try {
      const r = await fetch(`${this.baseUrl}/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) return { ok: false, erro: `HTTP ${r.status}` };
      const body = (await r.json().catch(() => ({}))) as { engine?: string; ml_loaded?: boolean };
      return { ok: true, engine: body.engine, mlCarregado: body.ml_loaded };
    } catch (e) {
      return { ok: false, erro: (e as Error).name === 'TimeoutError' ? 'timeout' : 'indisponível' };
    }
  }

  private headers(requestId?: string | null): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(requestId && { 'X-Request-Id': requestId }),
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
    };
  }
}
