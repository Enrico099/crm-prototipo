/**
 * Função agendada do Netlify: mantém a API e o motor acordados no horário comercial.
 *
 * No plano gratuito do Render cada serviço hiberna depois de 15 min sem uso e leva
 * de 40 s a 4 min para voltar; nesse meio-tempo o assessor vê erro ao gerar
 * recomendação. Um /health a cada 10 min evita isso.
 *
 * Horário em UTC: a cada 10 min das 7h às 20h50 de Brasília, de segunda a sexta.
 * Fica dentro das 750 h/mês grátis do Render (~13 h × 22 dias × 2 serviços ≈ 570 h).
 */
export const config = { schedule: "*/10 10-23 * * 1-5" };

export default async function manterAtivo() {
  const alvos = [
    process.env.API_URL && `${process.env.API_URL.replace(/\/$/, "")}/api/health/live`,
    process.env.AI_ENGINE_URL && `${process.env.AI_ENGINE_URL.replace(/\/$/, "")}/health`,
  ].filter((u): u is string => Boolean(u));

  const resultados = await Promise.all(
    alvos.map(async (url) => {
      try {
        // Não espera o serviço subir: a chamada já o acorda, e a função tem só 30 s
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        return `${url} → HTTP ${res.status}`;
      } catch (e) {
        return `${url} → acordando (${(e as Error).name})`;
      }
    }),
  );
  console.log(resultados.join(" | "));
  return new Response("ok");
}
