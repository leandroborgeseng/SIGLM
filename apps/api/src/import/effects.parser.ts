import type { StructureBlock } from './structure.parser';

export interface SuggestedLegislativeEffect {
  id: string;
  sourceBlockOrdem: number;
  sourceTag: string;
  normaTipo: string | null;
  normaNumero: number | null;
  normaAno: number | null;
  normaCodigo: string | null;
  targetIdentificacao: string | null;
  tipoEfeito:
    | 'alteracao_redacao'
    | 'inclusao'
    | 'revogacao_total'
    | 'revogacao_parcial'
    | 'renumeracao';
  textoNovo: string | null;
  posicionamento: 'antes_de' | 'apos' | 'dentro_de' | null;
  referenciaIdentificacao: string | null;
  novaIdentificacao: string | null;
  confianca: number;
  trecho: string;
  aceito: boolean;
}

const NORMA_REF_RE =
  /\b(Lei\s+Complementar|Lei|Decreto|Portaria|Resolução|Resolucao|Instrução\s+Normativa|Instrucao\s+Normativa)\s+(?:n[º°oO.]?\s*)?([\d.]+)\s*(?:\/|\s*,?\s*de\s+)?(\d{4})?/gi;

const ALTERACAO_RE =
  /\b(?:Fica(?:m)?\s+alterad[oa]s?|Altera(?:-se)?)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)\s+(?:da|do|de)\s+/i;

const REVOGACAO_RE =
  /\b(?:Fica(?:m)?\s+revogad[oa]s?|Revoga(?:-se)?)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)\s+(?:da|do|de)\s+/i;

const INCLUSAO_RE =
  /\b(?:Fica(?:m)?\s+incluíd[oa]s?|Acrescenta(?:-se)?|Inclui(?:-se)?)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)\s+(?:na|no|da|do|de)\s+/i;

const REDACAO_QUOTE_RE =
  /passa\s+a\s+vigorar\s+com\s+a\s+seguinte\s+reda[çc][ãa]o\s*:?\s*["“]?([\s\S]+?)["”]?\s*$/i;

const ART_REF_RE = /(?:art(?:igo)?\.?\s*)((?:\d+[A-Za-z-]*)(?:\s*[,e]\s*(?:\d+[A-Za-z-]*))*)/gi;

function parseNumero(raw: string): number | null {
  const digits = raw.replace(/\./g, '').replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function normaTipoFromKeyword(kw: string): string {
  const u = kw.toUpperCase();
  if (u.includes('COMPLEMENTAR')) return 'lei_complementar';
  if (u.includes('DECRETO')) return 'decreto';
  if (u.includes('PORTARIA')) return 'portaria';
  if (u.includes('RESOLU')) return 'resolucao';
  if (u.includes('INSTRU')) return 'instrucao_normativa';
  return 'lei';
}

function extractNormaRef(text: string): {
  normaTipo: string | null;
  normaNumero: number | null;
  normaAno: number | null;
  normaCodigo: string | null;
} {
  NORMA_REF_RE.lastIndex = 0;
  const m = NORMA_REF_RE.exec(text);
  if (!m) {
    return { normaTipo: null, normaNumero: null, normaAno: null, normaCodigo: null };
  }
  const normaTipo = normaTipoFromKeyword(m[1]);
  const normaNumero = parseNumero(m[2]);
  const normaAno = m[3] ? parseInt(m[3], 10) : null;
  const normaCodigo = `${m[1]} nº ${m[2]}${normaAno ? `/${normaAno}` : ''}`;
  return { normaTipo, normaNumero, normaAno, normaCodigo };
}

function extractArtRefs(fragment: string): string[] {
  const refs: string[] = [];
  ART_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ART_REF_RE.exec(fragment)) !== null) {
    const parts = m[1].split(/\s*,\s*|\s+e\s+/i);
    for (const p of parts) {
      const n = p.trim();
      if (n) refs.push(`Art. ${n.replace(/º?$/, '')}º`);
    }
  }
  return refs;
}

function extractRedacao(text: string): string | null {
  const m = text.match(REDACAO_QUOTE_RE);
  if (m?.[1]) return m[1].trim();
  const quoted = text.match(/["“]([^"”]+)["”]/);
  if (quoted?.[1] && quoted[1].length > 20) return quoted[1].trim();
  return null;
}

function detectEffectType(text: string): SuggestedLegislativeEffect['tipoEfeito'] | null {
  if (ALTERACAO_RE.test(text)) return 'alteracao_redacao';
  if (REVOGACAO_RE.test(text)) return 'revogacao_total';
  if (INCLUSAO_RE.test(text)) return 'inclusao';
  if (/\brenumerad[oa]\b/i.test(text)) return 'renumeracao';
  return null;
}

function parseBlockEffect(
  block: StructureBlock,
  index: number,
): SuggestedLegislativeEffect[] {
  const text = block.texto.trim();
  if (text.length < 20) return [];

  const tipo = detectEffectType(text);
  if (!tipo) return [];

  const norma = extractNormaRef(text);
  if (!norma.normaNumero) return [];

  const alterMatch = text.match(ALTERACAO_RE);
  const revogMatch = text.match(REVOGACAO_RE);
  const inclMatch = text.match(INCLUSAO_RE);
  const deviceFragment = (alterMatch ?? revogMatch ?? inclMatch)?.[1] ?? text;
  const artRefs = extractArtRefs(deviceFragment);

  const textoNovo =
    tipo === 'alteracao_redacao' || tipo === 'inclusao' ? extractRedacao(text) : null;

  const posMatch = text.match(/\b(após|depois de|antes de|dentro de)\s+(?:o\s+|a\s+)?(.+?)(?:\.|,|$)/i);
  let posicionamento: SuggestedLegislativeEffect['posicionamento'] = null;
  let referenciaIdentificacao: string | null = null;
  if (posMatch) {
    const prep = posMatch[1].toLowerCase();
    if (prep.includes('antes')) posicionamento = 'antes_de';
    else if (prep.includes('dentro')) posicionamento = 'dentro_de';
    else posicionamento = 'apos';
    const refArts = extractArtRefs(posMatch[2]);
    referenciaIdentificacao = refArts[0] ?? posMatch[2].trim().slice(0, 40);
  }

  const targets = artRefs.length > 0 ? artRefs : [null];
  return targets.map((targetIdentificacao, i) => ({
    id: `fx-${block.ordem}-${index}-${i}`,
    sourceBlockOrdem: block.ordem,
    sourceTag: block.tag,
    ...norma,
    targetIdentificacao,
    tipoEfeito: tipo,
    textoNovo,
    posicionamento: tipo === 'inclusao' ? posicionamento ?? 'apos' : null,
    referenciaIdentificacao,
    novaIdentificacao: tipo === 'inclusao' ? targetIdentificacao : null,
    confianca: norma.normaAno && targetIdentificacao ? 85 : norma.normaAno ? 70 : 55,
    trecho: text.slice(0, 280),
    aceito: norma.normaAno !== null && (targetIdentificacao !== null || tipo === 'inclusao'),
  }));
}

/** Detecta cláusulas alteradoras nos blocos estruturados da norma importada. */
export function parseLegislativeEffects(blocos: StructureBlock[]): SuggestedLegislativeEffect[] {
  const results: SuggestedLegislativeEffect[] = [];
  let idx = 0;

  for (const block of blocos) {
    if (!['artigo', 'paragrafo', 'paragrafo_unico', 'inciso'].includes(block.tipo)) continue;
    const effects = parseBlockEffect(block, idx++);
    results.push(...effects);
  }

  return results;
}
