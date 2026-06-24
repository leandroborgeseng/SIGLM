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
  /\b(Lei\s+Complementar|Lei|Decreto|Portaria|Resolu[çc][ãa]o|Instru[çc][ãa]o\s+Normativa)\s+(?:n[º°oO.]?\s*)?([\d.]+)\s*(?:\/|\s*,?\s*de\s+|\s+de\s+)?(\d{4})?/gi;

const ALTERACAO_RE =
  /\b(?:Fica(?:m)?\s+alterad[oa]s?|Altera(?:-se)?|Passa(?:m)?\s+a\s+vigorar)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)\s+(?:da|do|de)\s+/i;

const REVOGACAO_RE =
  /\b(?:Fica(?:m)?\s+revogad[oa]s?|Revoga(?:-se)?)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)\s+(?:da|do|de)\s+/i;

const INCLUSAO_RE =
  /\b(?:Fica(?:m)?\s+inclu[íi]d[oa]s?|Acrescenta(?:-se)?|Inclui(?:-se)?|Adiciona(?:-se)?)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)\s+(?:na|no|da|do|de|após|apos|depois)\s+/i;

const REDACAO_INLINE_RE =
  /passa\s+a\s+vigorar\s+com\s+a\s+seguinte\s+reda[çc][ãa]o\s*:?\s*["“]?([\s\S]+?)["”]?\s*$/i;

const ART_REF_RE = /(?:art(?:igo)?\.?\s*)((?:\d+[A-Za-z-]*)(?:\s*[,e]\s*(?:\d+[A-Za-z-]*))*)/gi;
const PAR_REF_RE = /§\s*([úuUÚ]nico|\d+[A-Za-z-]*)/gi;
const CAP_REF_RE = /cap[íi]tulo\s+([IVXLCDM\d]+)/gi;
const INCISO_REF_RE = /inciso\s+([IVXLCDM]+)/gi;

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

function extractParRefs(fragment: string): string[] {
  const refs: string[] = [];
  PAR_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAR_REF_RE.exec(fragment)) !== null) {
    const id = m[1].toLowerCase();
    refs.push(id === 'único' || id === 'unico' ? 'Parágrafo único' : `§ ${m[1]}º`);
  }
  return refs;
}

function extractCapRefs(fragment: string): string[] {
  const refs: string[] = [];
  CAP_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CAP_REF_RE.exec(fragment)) !== null) {
    refs.push(`CAPÍTULO ${m[1]}`);
  }
  return refs;
}

function extractIncisoRefs(fragment: string): string[] {
  const refs: string[] = [];
  INCISO_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INCISO_REF_RE.exec(fragment)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

function extractDeviceRefs(fragment: string): string[] {
  const arts = extractArtRefs(fragment);
  if (arts.length > 0) return arts;
  const pars = extractParRefs(fragment);
  if (pars.length > 0) return pars;
  const caps = extractCapRefs(fragment);
  if (caps.length > 0) return caps;
  return extractIncisoRefs(fragment);
}

function extractRedacao(text: string, nextBlock?: StructureBlock): string | null {
  const inline = text.match(REDACAO_INLINE_RE);
  if (inline?.[1]?.trim()) return inline[1].trim();

  const quoted = text.match(/["“]([^"”]{20,})["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  if (/passa\s+a\s+vigorar\s+com\s+a\s+seguinte\s+reda[çc][ãa]o/i.test(text) && nextBlock) {
    const t = nextBlock.texto.trim();
    if (t.length >= 15) return t;
  }

  return null;
}

function detectEffectType(text: string): SuggestedLegislativeEffect['tipoEfeito'] | null {
  if (ALTERACAO_RE.test(text)) return 'alteracao_redacao';
  if (REVOGACAO_RE.test(text)) {
    if (
      /\bparcial(?:mente)?\b/i.test(text) ||
      /§|inciso|al[ií]nea|caput/i.test(text)
    ) {
      return 'revogacao_parcial';
    }
    return 'revogacao_total';
  }
  if (INCLUSAO_RE.test(text)) return 'inclusao';
  if (/\brenumerad[oa]\b|\bpassa\s+a\s+denominar-se\b/i.test(text)) return 'renumeracao';
  return null;
}

function extractPosicionamento(text: string): {
  posicionamento: SuggestedLegislativeEffect['posicionamento'];
  referenciaIdentificacao: string | null;
} {
  const posMatch = text.match(
    /\b(após|apos|depois de|antes de|dentro de)\s+(?:o\s+|a\s+)?(.+?)(?:\.|,|$)/i,
  );
  if (!posMatch) {
    return { posicionamento: null, referenciaIdentificacao: null };
  }
  const prep = posMatch[1].toLowerCase();
  let posicionamento: SuggestedLegislativeEffect['posicionamento'] = 'apos';
  if (prep.includes('antes')) posicionamento = 'antes_de';
  else if (prep.includes('dentro')) posicionamento = 'dentro_de';

  const refDevices = extractDeviceRefs(posMatch[2]);
  return {
    posicionamento,
    referenciaIdentificacao: refDevices[0] ?? posMatch[2].trim().slice(0, 48),
  };
}

function scoreConfianca(
  norma: ReturnType<typeof extractNormaRef>,
  target: string | null,
  hasTextoNovo: boolean,
): number {
  let score = 50;
  if (norma.normaAno) score += 15;
  if (norma.normaTipo) score += 5;
  if (target) score += 15;
  if (hasTextoNovo) score += 10;
  return Math.min(score, 95);
}

function parseBlockEffect(
  block: StructureBlock,
  index: number,
  nextBlock?: StructureBlock,
): SuggestedLegislativeEffect[] {
  const text = block.texto.trim();
  if (text.length < 15) return [];

  const tipo = detectEffectType(text);
  if (!tipo) return [];

  const norma = extractNormaRef(text);
  if (!norma.normaNumero) return [];

  const alterMatch = text.match(ALTERACAO_RE);
  const revogMatch = text.match(REVOGACAO_RE);
  const inclMatch = text.match(INCLUSAO_RE);
  const deviceFragment = (alterMatch ?? revogMatch ?? inclMatch)?.[1] ?? text;
  const deviceRefs = extractDeviceRefs(deviceFragment);

  const textoNovo =
    tipo === 'alteracao_redacao' || tipo === 'inclusao'
      ? extractRedacao(text, nextBlock)
      : null;

  const { posicionamento, referenciaIdentificacao } = extractPosicionamento(text);

  const targets = deviceRefs.length > 0 ? deviceRefs : [null];
  return targets.map((targetIdentificacao, i) => {
    const confianca = scoreConfianca(norma, targetIdentificacao, !!textoNovo);
    return {
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
      confianca,
      trecho: text.slice(0, 280),
      aceito: confianca >= 70 && norma.normaAno !== null,
    };
  });
}

/** Detecta cláusulas alteradoras nos blocos estruturados da norma importada. */
export function parseLegislativeEffects(blocos: StructureBlock[]): SuggestedLegislativeEffect[] {
  const results: SuggestedLegislativeEffect[] = [];
  let idx = 0;

  for (let i = 0; i < blocos.length; i++) {
    const block = blocos[i];
    if (!['artigo', 'paragrafo', 'paragrafo_unico', 'inciso', 'alinea'].includes(block.tipo)) {
      continue;
    }
    const effects = parseBlockEffect(block, idx++, blocos[i + 1]);
    results.push(...effects);
  }

  return results;
}
