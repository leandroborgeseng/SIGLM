import type { ActType, UnitType } from '@prisma/client';
import { formatActCode, formatFormalTitle, SITUACAO_LABELS } from '../normative-acts/normative-acts.utils';
import {
  escapeHtml,
  formatacaoToCss,
  parseFormatacao,
  sanitizeUnitHtml,
  unitHtmlToPlainText,
  type UnitFormatacao,
} from '../common/rich-text.utils';

export interface ExportUnit {
  tipoUnidade: UnitType;
  identificacao: string | null;
  texto: string;
  formatacao?: UnitFormatacao | null;
  ordem: number;
  status: import('@prisma/client').UnitStatus;
  nota: string | null;
}

export interface ExportAct {
  tipo: ActType;
  numero: number;
  ano: number;
  ementa: string;
  situacao: import('@prisma/client').ActSituacao;
  assunto: string | null;
  orgaoOrigem: string | null;
  dataAto: Date | null;
  dataPublicacao: Date | null;
  units: ExportUnit[];
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

/** Ordem de exibição: ementa → preâmbulo → demais. */
export function sortUnitsForDisplay<T extends { tipoUnidade: string; ordem: number }>(
  units: T[],
): T[] {
  const weight = (tipo: string) => {
    if (tipo === 'ementa') return 0;
    if (tipo === 'preambulo' || tipo === 'considerando') return 1;
    return 2;
  };
  return [...units].sort((a, b) => {
    const wa = weight(a.tipoUnidade);
    const wb = weight(b.tipoUnidade);
    if (wa !== wb) return wa - wb;
    return a.ordem - b.ordem;
  });
}

function richText(html: string): string {
  return sanitizeUnitHtml(html);
}

function renderUnit(unit: ExportUnit): string {
  const isStructural = [
    'parte',
    'livro',
    'titulo',
    'subtitulo',
    'capitulo',
    'subcapitulo',
    'secao',
    'subsecao',
    'anexo',
  ].includes(unit.tipoUnidade);
  const isPreamble = unit.tipoUnidade === 'preambulo' || unit.tipoUnidade === 'considerando';
  const isEmenta = unit.tipoUnidade === 'ementa';
  const isSimple = unit.tipoUnidade === 'texto_simples';
  const isRevoked = unit.status === 'revogada';
  const revokedClass = isRevoked ? ' revoked' : '';
  const id = unit.identificacao?.replace(/\s+/g, '-').toLowerCase() ?? `unit-${unit.ordem}`;
  const texto = richText(unit.texto);

  if (isEmenta) {
    return `<p class="ementa">${texto}</p>`;
  }
  if (isSimple) {
    const fmt = parseFormatacao(unit.formatacao);
    const style = formatacaoToCss(fmt);
    return `<p class="texto-simples"${style ? ` style="${style}"` : ''}>${texto}</p>`;
  }
  if (isPreamble) {
    const parts = unit.texto
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length <= 1) {
      return `<div class="preamble">${texto}</div>`;
    }
    return `<div class="preamble">${parts
      .map((p) => `<p>${richText(p.replace(/\n/g, '<br/>'))}</p>`)
      .join('')}</div>`;
  }
  if (isStructural) {
    const ident = unit.identificacao
      ? `<span class="struct-id">${escapeHtml(unit.identificacao)}</span>`
      : '';
    return `<h3 class="structural">${ident}${texto}</h3>`;
  }
  if (unit.tipoUnidade === 'artigo') {
    const ident = unit.identificacao
      ? `<strong class="article-id${revokedClass}">${escapeHtml(unit.identificacao)}</strong> `
      : '';
    return `<p class="article" id="${id}">${ident}<span class="article-text${revokedClass}">${texto}</span></p>`;
  }
  return `<p class="indent">${texto}</p>`;
}

export function renderConsolidatedHtml(act: ExportAct): string {
  const codigo = formatActCode(act.tipo, act.numero, act.ano);
  const tituloFormal = formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto);
  const situacao = SITUACAO_LABELS[act.situacao] ?? act.situacao;
  const sorted = sortUnitsForDisplay(act.units);
  const hasEmentaUnit = sorted.some((u) => u.tipoUnidade === 'ementa');
  const unitsHtml = sorted
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
  <title>${escapeHtml(tituloFormal)} — LeisMunicipais</title>
  <style>
    :root { --ink:#0f1b2d; --ink-2:#36465b; --ink-3:#647389; --ink-4:#97a3b6; --brand:#0066cc; --warn:#b5680a; --danger:#d62b2b; --ok:#15924e; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 2rem 1.25rem 3rem; font-family: Georgia, "Times New Roman", serif; color: var(--ink); background: #fff; line-height: 1.75; font-size: 15px; }
    a { color: var(--brand); text-decoration: underline; }
    .brand-lockup { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1.5rem; text-align: left; }
    .brand-lockup img { height: 72px; width: auto; }
    .brand-lockup .prefeitura { font-family: system-ui, sans-serif; font-size: 15px; font-weight: 600; color: var(--ink); margin: 0; }
    .brand-lockup .orgao { font-family: system-ui, sans-serif; font-size: 13px; font-weight: 500; color: var(--ink-2); margin: .15rem 0 0; }
    .header { max-width: 900px; margin: 0 auto 1.75rem; }
    .titulo-formal { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; margin: 0 0 1rem; }
    .ementa { text-align: left; font-size: 14px; font-weight: 400; line-height: 1.55; margin: 0 0 1.25rem; max-width: 50%; margin-left: auto; white-space: pre-wrap; }
    .preamble, .article, .indent, .texto-simples { white-space: pre-wrap; }
    .meta-line { font-family: system-ui, sans-serif; font-size: 12px; color: var(--ink-3); text-align: center; margin: 0 0 1.5rem; }
    .content { max-width: 900px; margin: 0 auto; }
    .preamble { text-align: justify; color: var(--ink); margin: 1rem 0 1.5rem; }
    .preamble p { margin: 0 0 .75rem; }
    .texto-simples { margin: 0 0 1rem; }
    .structural { text-align: center; font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin: 1.5rem 0 1rem; }
    .struct-id { display: block; margin-bottom: .25rem; }
    .article { margin: 0 0 1rem; text-align: justify; }
    .article-id { font-weight: 700; }
    .indent { margin: 0 0 .75rem; padding-left: 1.5rem; text-align: justify; }
    .revoked { text-decoration: line-through; color: var(--ink-4); }
    .note { font-family: system-ui, sans-serif; font-size: 12px; margin: .35rem 0 1rem; }
    .note-warn { color: var(--warn); }
    .note-danger { color: var(--danger); }
    .note-ok { color: var(--ok); }
    .footer { max-width: 900px; margin: 2.5rem auto 0; padding-top: 1rem; border-top: 1px solid #e5eaf1; font-family: system-ui, sans-serif; font-size: 11px; color: var(--ink-4); }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <header class="header">
    <p class="meta-line">${escapeHtml(codigo)} · ${escapeHtml(situacao)}</p>
    <div class="brand-lockup">
      <img src="/brand/franca-brasao.png" alt="Brasão da Prefeitura Municipal de Franca" />
      <div>
        <p class="prefeitura">Prefeitura Municipal de Franca/SP</p>
        ${act.orgaoOrigem ? `<p class="orgao">${escapeHtml(act.orgaoOrigem)}</p>` : ''}
      </div>
    </div>
    <h1 class="titulo-formal">${escapeHtml(tituloFormal)}</h1>
    ${hasEmentaUnit ? '' : `<p class="ementa">${escapeHtml(act.ementa).replace(/\n/g, '<br>\n')}</p>`}
  </header>
  <main class="content">
${unitsHtml}
  </main>
  <footer class="footer">Exportado do SIGLM — ${escapeHtml(codigo)}</footer>
</body>
</html>`;
}

export { unitHtmlToPlainText };
