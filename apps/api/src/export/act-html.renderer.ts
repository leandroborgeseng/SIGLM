import { formatActCode, SITUACAO_LABELS } from '../normative-acts/normative-acts.utils';
import type { ActSituacao, ActType, UnitStatus, UnitType } from '@prisma/client';

export interface ExportUnit {
  tipoUnidade: UnitType;
  identificacao: string | null;
  texto: string;
  ordem: number;
  status: UnitStatus;
  nota: string | null;
}

export interface ExportAct {
  tipo: ActType;
  numero: number;
  ano: number;
  ementa: string;
  situacao: ActSituacao;
  assunto: string | null;
  orgaoOrigem: string | null;
  dataAto: Date | null;
  dataPublicacao: Date | null;
  units: ExportUnit[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateBr(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function noteClass(nota: string | null): string {
  if (!nota) return 'note';
  if (nota.toLowerCase().includes('revogado')) return 'note note-danger';
  if (nota.toLowerCase().includes('incluído')) return 'note note-ok';
  return 'note note-warn';
}

function renderUnit(unit: ExportUnit): string {
  const isStructural = ['titulo', 'capitulo', 'livro', 'secao', 'subsecao'].includes(unit.tipoUnidade);
  const isPreamble = unit.tipoUnidade === 'preambulo';
  const isRevoked = unit.status === 'revogada';
  const revokedClass = isRevoked ? ' revoked' : '';
  const id = unit.identificacao?.replace(/\s+/g, '-').toLowerCase() ?? `unit-${unit.ordem}`;
  const texto = escapeHtml(unit.texto);

  if (isPreamble) {
    return `<p class="preamble">${texto}</p>`;
  }
  if (isStructural) {
    const ident = unit.identificacao ? `<span class="struct-id">${escapeHtml(unit.identificacao)}</span>` : '';
    return `<h3 class="structural">${ident}${texto}</h3>`;
  }
  if (unit.tipoUnidade === 'artigo') {
    const ident = unit.identificacao
      ? `<strong class="article-id${revokedClass}">${escapeHtml(unit.identificacao)}</strong> `
      : '';
    return `<p class="article" id="${id}">${ident}<span class="article-text${revokedClass}">${texto}</span></p>`;
  }
  if (unit.tipoUnidade === 'ementa') {
    return `<p class="ementa-block">${texto}</p>`;
  }
  return `<p class="indent">${texto}</p>`;
}

export function renderConsolidatedHtml(act: ExportAct): string {
  const codigo = formatActCode(act.tipo, act.numero, act.ano);
  const situacao = SITUACAO_LABELS[act.situacao] ?? act.situacao;
  const unitsHtml = act.units
    .map((unit) => {
      const body = renderUnit(unit);
      const nota = unit.nota
        ? `<p class="${noteClass(unit.nota)}">${escapeHtml(unit.nota)}</p>`
        : '';
      return `<article class="unit">${body}${nota}</article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(codigo)} — LeisMunicipais</title>
  <style>
    :root { --ink:#0f1b2d; --ink-2:#36465b; --ink-3:#647389; --ink-4:#97a3b6; --brand:#0066cc; --warn:#b5680a; --danger:#d62b2b; --ok:#15924e; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 2rem 1.5rem 3rem; font-family: Georgia, "Times New Roman", serif; color: var(--ink); background: #fff; line-height: 1.75; font-size: 15px; }
    .header { max-width: 720px; margin: 0 auto 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #e5eaf1; }
    .meta { font-family: system-ui, sans-serif; font-size: 12px; color: var(--ink-3); margin-bottom: .5rem; }
    .codigo { font-family: ui-monospace, monospace; font-size: 14px; font-weight: 600; color: var(--brand); }
    .situacao { display: inline-block; margin-left: .5rem; padding: 2px 8px; border-radius: 999px; font-family: system-ui, sans-serif; font-size: 11px; font-weight: 600; background: #edf1f6; color: #5b6b82; }
    h1.ementa { font-size: 22px; font-weight: 600; line-height: 1.35; margin: 1rem 0; }
    dl.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem 1.5rem; font-family: system-ui, sans-serif; font-size: 13px; margin: 1rem 0 0; }
    dl.meta-grid dt { color: var(--ink-4); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
    dl.meta-grid dd { margin: 0; color: var(--ink-2); }
    .content { max-width: 720px; margin: 0 auto; }
    .preamble { text-align: center; font-style: italic; color: var(--ink-2); margin: 0 0 1.5rem; }
    .structural { text-align: center; font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin: 1.5rem 0 1rem; }
    .struct-id { display: block; margin-bottom: .25rem; }
    .article { margin: 0 0 1rem; }
    .article-id { font-weight: 700; }
    .indent { margin: 0 0 .75rem; padding-left: 1.5rem; }
    .revoked { text-decoration: line-through; color: var(--ink-4); }
    .note { font-family: system-ui, sans-serif; font-size: 12px; margin: .35rem 0 1rem; padding: 4px 10px; border-radius: 999px; display: inline-block; }
    .note-warn { background: #fbf0dd; color: var(--warn); }
    .note-danger { background: #fbe9e9; color: var(--danger); }
    .note-ok { background: #e5f4eb; color: var(--ok); }
    .footer { max-width: 720px; margin: 2.5rem auto 0; padding-top: 1rem; border-top: 1px solid #e5eaf1; font-family: system-ui, sans-serif; font-size: 11px; color: var(--ink-4); }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <header class="header">
    <p class="meta">Portal de Legislação · Prefeitura de Franca/SP</p>
    <p><span class="codigo">${escapeHtml(codigo)}</span><span class="situacao">${escapeHtml(situacao)}</span></p>
    <h1 class="ementa">${escapeHtml(act.ementa)}</h1>
    <dl class="meta-grid">
      <div><dt>Data do ato</dt><dd>${formatDateBr(act.dataAto)}</dd></div>
      <div><dt>Publicação</dt><dd>${formatDateBr(act.dataPublicacao)}</dd></div>
      ${act.orgaoOrigem ? `<div><dt>Órgão</dt><dd>${escapeHtml(act.orgaoOrigem)}</dd></div>` : ''}
      ${act.assunto ? `<div><dt>Assunto</dt><dd>${escapeHtml(act.assunto)}</dd></div>` : ''}
    </dl>
  </header>
  <main class="content">
    <p class="meta" style="margin-bottom:1.5rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Texto consolidado</p>
    ${unitsHtml}
  </main>
  <footer class="footer">
    Exportado em ${new Date().toLocaleString('pt-BR')} · LeisMunicipais — Prefeitura de Franca/SP
  </footer>
</body>
</html>`;
}
