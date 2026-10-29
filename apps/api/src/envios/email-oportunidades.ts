import type { RecomendacoesService } from '../recomendacoes/recomendacoes.service';
import { AVISO_APOIO_DECISAO } from '../recomendacoes/regras';
import type { Email } from './email.service';

export type ResultadoOportunidades = Awaited<ReturnType<RecomendacoesService['oportunidadesDoDia']>>;

/** Quantas oportunidades entram no corpo do e-mail; o resto fica no link */
export const MAX_ITENS_EMAIL = 30;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function dataBrasilia(d = new Date()): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Resumo diário das oportunidades aprovadas pelo comitê, para um destinatário */
export function montarEmailOportunidades(
  destinatario: { email: string; nome: string },
  r: ResultadoOportunidades,
  linkApp: string,
): Email {
  const data = dataBrasilia(new Date(r.geradoEm));
  const itens = r.oportunidades.slice(0, MAX_ITENS_EMAIL);
  const restantes = r.oportunidades.length - itens.length;
  const link = `${linkApp.replace(/\/$/, '')}/oportunidades`;
  const primeiroNome = destinatario.nome.split(' ')[0];

  const linhas = itens
    .map(
      (o) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e5e5">${escapar(o.cliente.nome)}<br>
          <span style="color:#737373;font-size:12px">${escapar(o.cliente.perfil.toLowerCase())} · ${brl.format(o.cliente.patrimonio)}</span></td>
        <td style="padding:8px;border-bottom:1px solid #e5e5e5">${escapar(o.produtoNome)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e5e5;text-align:right">${Math.round(o.score * 100)}/100</td>
      </tr>`,
    )
    .join('');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#171717;max-width:640px">
  <p>Olá, ${escapar(primeiroNome)}.</p>
  <p>O motor analisou <strong>${r.clientesAnalisados}</strong> cliente(s) da sua carteira hoje (${data}).
    <strong>${r.oportunidades.length}</strong> oportunidade(s) passaram por todo o comitê de especialistas
    (suitability, risco, alocação, liquidez, custo, qualidade dos dados e convicção);
    ${r.reprovadosComite} sugestão(ões) foram barradas.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="text-align:left;color:#737373;font-size:12px">
      <th style="padding:8px">Cliente</th><th style="padding:8px">Produto</th><th style="padding:8px;text-align:right">Score</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table>
  ${restantes > 0 ? `<p>E mais ${restantes} oportunidade(s) no sistema.</p>` : ''}
  ${r.pendencias.length > 0 ? `<p>${r.pendencias.length} cliente(s) ficaram sem oportunidade; os motivos estão no sistema.</p>` : ''}
  <p><a href="${escapar(link)}" style="color:#1d4ed8">Ver pareceres e gerar as recomendações formais</a></p>
  <p style="color:#737373;font-size:12px">${escapar(AVISO_APOIO_DECISAO)}</p>
</div>`;

  const texto = [
    `Olá, ${primeiroNome}.`,
    '',
    `Oportunidades do dia (${data}): ${r.oportunidades.length} aprovada(s) pelo comitê de especialistas, ` +
      `${r.clientesAnalisados} cliente(s) analisado(s), ${r.reprovadosComite} sugestão(ões) barrada(s).`,
    '',
    ...itens.map(
      (o) => `- ${o.cliente.nome} (${o.cliente.perfil.toLowerCase()}): ${o.produtoNome} · ${Math.round(o.score * 100)}/100`,
    ),
    ...(restantes > 0 ? [`E mais ${restantes} no sistema.`] : []),
    '',
    `Pareceres e recomendações formais: ${link}`,
    '',
    AVISO_APOIO_DECISAO,
  ].join('\n');

  return {
    para: destinatario.email,
    assunto: `Oportunidades do dia ${data}: ${r.oportunidades.length} aprovada(s) pelo comitê`,
    html,
    texto,
  };
}
