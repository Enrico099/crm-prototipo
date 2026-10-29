/**
 * Função agendada do Netlify: dispara o e-mail das oportunidades do dia.
 * Só chama a API, que responde 202 e faz a varredura em segundo plano. Quem já
 * recebeu hoje não recebe de novo, então repetir a chamada é seguro.
 *
 * Horário em UTC: "0 11 * * 1-5" = 8h de Brasília, de segunda a sexta.
 */
export const config = { schedule: "0 11 * * 1-5" };

const TENTATIVAS = 3;

export default async function enviarOportunidades() {
  const api = process.env.API_URL;
  const token = process.env.ENVIO_CRON_TOKEN;
  if (!api || !token) {
    console.error("API_URL e ENVIO_CRON_TOKEN precisam estar configurados no Netlify");
    return new Response("não configurado", { status: 500 });
  }

  // A API em plano gratuito pode estar "dormindo": as primeiras tentativas a acordam
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      const res = await fetch(`${api.replace(/\/$/, "")}/api/envios/oportunidades-do-dia/agendado`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      });
      console.log(`Disparo das oportunidades: HTTP ${res.status} (tentativa ${i})`);
      if (res.status === 202) return new Response("ok");
      if (res.status === 401) return new Response("token recusado", { status: 500 });
    } catch (e) {
      console.warn(`Tentativa ${i} sem resposta: ${(e as Error).name}`);
    }
  }
  return new Response("API não respondeu", { status: 502 });
}
