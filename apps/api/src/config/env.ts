import { z } from 'zod';

const SEGREDOS_DE_EXEMPLO = new Set(['dev-change-me', 'dev-change-me-too', 'changeme', 'secret']);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

    // Lista separada por vírgula. Usada em CORS e na checagem de Origin (CSRF).
    WEB_ORIGIN: z.string().default('http://localhost:3000'),

    JWT_SECRET: z.string().min(1, 'JWT_SECRET é obrigatória'),
    JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET é obrigatória'),

    // Segredo (pepper) do HMAC do CPF. Sem ele o hash do CPF é revertível por força bruta.
    CPF_HASH_SECRET: z.string().optional(),

    // Chave que cifra os segredos TOTP do MFA no banco. Trocar depois que houver
    // MFA ativo invalida os autenticadores já configurados.
    MFA_CHAVE: z.string().optional(),
    // Perfis que só usam o sistema com MFA ativo (separados por vírgula). Vazio = opcional.
    MFA_OBRIGATORIO_PARA: z
      .string()
      .default('')
      .transform((v) => v.split(',').map((p) => p.trim().toUpperCase()).filter(Boolean))
      .pipe(z.array(z.enum(['ADMIN', 'ASSESSOR', 'COMPLIANCE', 'READONLY']), {
        errorMap: () => ({ message: 'Use perfis válidos: ADMIN, ASSESSOR, COMPLIANCE, READONLY' }),
      })),

    // Força cookie Secure fora de produção (ex.: staging atrás de HTTPS)
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),

    // Valor do "trust proxy" do Express (IP real do cliente atrás do proxy do Next/LB)
    TRUST_PROXY: z.string().default('loopback'),

    AI_ENGINE_URL: z.string().url().default('http://localhost:8000'),
    AI_ENGINE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
    // Token compartilhado com o AI Engine (header Authorization). Opcional em dev.
    AI_ENGINE_TOKEN: z.string().optional(),

    // --- Envio diário das oportunidades por e-mail (opcional) ---
    // Ex.: smtps://usuario:senha@smtp.gmail.com:465. Sem ela o envio fica desligado.
    SMTP_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
    EMAIL_REMETENTE: z.string().default('Capital Elite CRM <no-reply@capitalelite.com.br>'),
    // Token que o agendador (função agendada do Netlify, cron externo) manda em
    // Authorization: Bearer para disparar o envio. Sem ele o disparo agendado fica desligado.
    ENVIO_CRON_TOKEN: z.string().optional().or(z.literal('').transform(() => undefined)),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    for (const chave of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const valor = env[chave];
      if (valor.length < 32 || SEGREDOS_DE_EXEMPLO.has(valor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [chave],
          message: `${chave} precisa ter 32+ caracteres aleatórios em produção`,
        });
      }
    }
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET deve ser diferente de JWT_SECRET',
      });
    }
    if (!env.CPF_HASH_SECRET || env.CPF_HASH_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CPF_HASH_SECRET'],
        message: 'CPF_HASH_SECRET precisa ter 32+ caracteres em produção',
      });
    }
    if (!env.MFA_CHAVE || env.MFA_CHAVE.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MFA_CHAVE'],
        message: 'MFA_CHAVE precisa ter 32+ caracteres em produção',
      });
    }
    if (env.ENVIO_CRON_TOKEN && env.ENVIO_CRON_TOKEN.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENVIO_CRON_TOKEN'],
        message: 'ENVIO_CRON_TOKEN precisa ter 32+ caracteres em produção',
      });
    }
    if (!env.AI_ENGINE_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_ENGINE_TOKEN'],
        message: 'AI_ENGINE_TOKEN é obrigatório em produção',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Usado pelo ConfigModule.forRoot({ validate }). Falha o boot com mensagem
 * clara em vez de subir com segredo vazio/fraco. Nunca imprime os valores.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const detalhes = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${detalhes}`);
  }
  return result.data;
}

export function webOrigins(env: Pick<Env, 'WEB_ORIGIN'>): string[] {
  return env.WEB_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
