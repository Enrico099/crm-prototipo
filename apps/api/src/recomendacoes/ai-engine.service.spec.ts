import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiEngineService, type AiEngineRequest } from './ai-engine.service';

const request: AiEngineRequest = {
  cliente: { id: 'c1', nome: 'Cliente Sigiloso', perfil: 'MODERADO', patrimonio: 1_000_000 },
  suitability: { perfilCalculado: 'MODERADO', horizonteAnos: 5, toleranciaPerda: 10 },
  posicoes: [],
  catalog: [],
  topN: 3,
};

const respostaValida = {
  recomendacoes: [
    {
      produtoId: 'p1',
      produtoNome: 'CDB',
      score: 0.8,
      justificativa: 'Texto',
      fatores: { profileMatch: 1, diversification: 0.5, yield: 0.5, liquidity: 0.5, cost: 1 },
      pesos: { profileMatch: 0.2, diversification: 0.3, yield: 0.2, liquidity: 0.15, cost: 0.15 },
      contribs: [{ fator: 'cost', contrib: 0.15, frase: 'Sem taxa' }],
    },
  ],
  descartados: [{ motivo: 'perfil_incompativel', count: 2, contexto: null }],
  totalAnalisados: 3,
  engineVersion: 'rule-engine-py-v1.4',
};

// ConfigService prioriza process.env — remove o valor do setup global pra
// que a config passada no construtor valha neste arquivo.
delete process.env.AI_ENGINE_URL;

function service(extra: Record<string, unknown> = {}) {
  const config = new ConfigService({
    AI_ENGINE_URL: 'http://motor:8000/',
    AI_ENGINE_TIMEOUT_MS: 1000,
    ...extra,
  });
  return new AiEngineService(config);
}

describe('AiEngineService', () => {
  const fetchOriginal = global.fetch;
  let logs: string[];

  beforeEach(() => {
    logs = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it('envia token, request id e timeout; valida a resposta', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify(respostaValida), { status: 200 }));
    global.fetch = fetchMock;
    const r = await service({ AI_ENGINE_TOKEN: 'tok' }).recommend(request, 'req-1');

    expect(r.recomendacoes[0].produtoId).toBe('p1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://motor:8000/recommend');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Request-Id': 'req-1' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('timeout vira 504', async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(service().recommend(request)).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('motor fora do ar vira 503', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(service().recommend(request)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('erro HTTP vira 502 e o corpo (que ecoa dados do cliente) não vai pro log', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: [{ input: { nome: 'Cliente Sigiloso', patrimonio: 1e6 } }] }), {
        status: 422,
      }),
    );
    await expect(service().recommend(request)).rejects.toBeInstanceOf(BadGatewayException);
    expect(logs.join('\n')).not.toContain('Sigiloso');
    expect(logs.join('\n')).toContain('422');
  });

  it.each([
    ['score fora de [0,1]', { ...respostaValida, recomendacoes: [{ ...respostaValida.recomendacoes[0], score: 1.7 }] }],
    ['sem engineVersion', { ...respostaValida, engineVersion: undefined }],
    ['motivo de descarte desconhecido', { ...respostaValida, descartados: [{ motivo: 'outro', count: 1 }] }],
    ['corpo não-JSON', 'oops'],
  ])('resposta fora do contrato (%s) vira 502', async (_n, corpo) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status: 200 }));
    await expect(service().recommend(request)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('health devolve ok=false sem lançar quando o motor está fora', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(service().health()).resolves.toEqual({ ok: false, erro: 'indisponível' });
  });

  it('aguardarDisponivel insiste enquanto o motor acorda (502) e desiste no limite', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    await expect(service().aguardarDisponivel(1_000, 1)).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);

    global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 502 }));
    await expect(service().aguardarDisponivel(20, 5)).resolves.toBe(false);
  });
});
