import type { StructureBlock } from './structure.parser';

export interface DetectedActMetadata {
  tipo: string | null;
  numero: number | null;
  ano: number | null;
  dataAto: string | null;
  ementa: string | null;
  tituloCompleto: string | null;
  confianca: number;
  /** Título formal encontrado no cabeçalho, antes da ementa. */
  titleFromHeader: boolean;
  /** Confiança insuficiente para auto-preenchimento confiável. */
  requerConferencia: boolean;
}

const TYPE_KEYWORDS: { tipo: string; pattern: RegExp }[] = [
  { tipo: 'lei_complementar', pattern: /\blei\s+complementar\b/i },
  { tipo: 'instrucao_normativa', pattern: /\binstru[çc][ãa]o\s+normativa\b/i },
  { tipo: 'decreto', pattern: /\bdecreto\b/i },
  { tipo: 'portaria', pattern: /\bportaria\b/i },
  { tipo: 'resolucao', pattern: /\bresolu[çc][ãa]o\b/i },
  { tipo: 'lei', pattern: /\blei\b/i },
];

const FULL_TITLE_RE =
  /\b(LEI\s+COMPLEMENTAR|INSTRU[ÇC][ÃA]O\s+NORMATIVA|LEI|DECRETO|PORTARIA|RESOLU[ÇC][ÃA]O)\s+N[º°oO.]?\s*([\d.]+)\s*,?\s*(?:DE\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç]+)\s+DE\s+(\d{4})|\/?\s*(\d{4}))?/i;

const EMENTA_RE =
  /(?:^|\n)\s*EMENTA\s*:?\s*(.+?)(?=\n\s*(?:Art(?:igo)?\.|§|T[IÍ]TULO|CAP[IÍ]TULO|CONSIDERANDO|Faço saber|O\s+(?:PREFEITO|GOVERNADOR|SECRET[AÁ]RIO)|DECRETA\s*:|RESOLVE\s*:|$))/is;

const LOW_CONFIDENCE_THRESHOLD = 55;

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function parseNumero(raw: string): number | null {
  const digits = raw.replace(/\./g, '').replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function tipoFromKeyword(keyword: string): string {
  const normalized = keyword.toUpperCase();
  if (normalized.includes('COMPLEMENTAR')) return 'lei_complementar';
  if (normalized.includes('INSTRU')) return 'instrucao_normativa';
  if (normalized.startsWith('DECRETO')) return 'decreto';
  if (normalized.startsWith('PORTARIA')) return 'portaria';
  if (normalized.startsWith('RESOLU')) return 'resolucao';
  return 'lei';
}

function parseDataExtenso(day: string, monthName: string, year: string): string | null {
  const key = monthName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const m = MONTHS[key];
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  if (!m || !d || !y) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extractFromFilename(filename: string): Partial<DetectedActMetadata> {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();

  const lc = base.match(/\b(?:lc|lei[-_]?complementar)[-_]?(\d[\d.]*?)[-_]?(20\d{2})\b/);
  if (lc) {
    return {
      tipo: 'lei_complementar',
      numero: parseNumero(lc[1]),
      ano: parseInt(lc[2], 10),
    };
  }

  const inMatch = base.match(/\b(?:in|instrucao[-_]?normativa)[-_]?(\d[\d.]*?)[-_]?(20\d{2})\b/);
  if (inMatch) {
    return {
      tipo: 'instrucao_normativa',
      numero: parseNumero(inMatch[1]),
      ano: parseInt(inMatch[2], 10),
    };
  }

  const typed = base.match(
    /\b(decreto|portaria|resolucao|resolução|lei)[-_]?(\d[\d.]*?)[-_]?(20\d{2})\b/,
  );
  if (typed) {
    const tipoMap: Record<string, string> = {
      decreto: 'decreto',
      portaria: 'portaria',
      resolucao: 'resolucao',
      resolução: 'resolucao',
      lei: 'lei',
    };
    return {
      tipo: tipoMap[typed[1]] ?? 'lei',
      numero: parseNumero(typed[2]),
      ano: parseInt(typed[3], 10),
    };
  }

  const generic = base.match(/\b(\d[\d.]*?)[-_](20\d{2})\b/);
  if (generic) {
    return { numero: parseNumero(generic[1]), ano: parseInt(generic[2], 10) };
  }

  return {};
}

/** Texto do cabeçalho antes da primeira ocorrência de EMENTA. */
function preEmentaHeader(text: string): string {
  const match = text.match(/(?:^|\n)\s*EMENTA\s*:?\s*/i);
  if (match?.index != null) {
    return text.slice(0, match.index);
  }
  return text.slice(0, 2500);
}

interface FormalTitleMatch {
  match: RegExpMatchArray;
  fromHeader: boolean;
  lineIndex: number;
  charIndex: number;
}

function extractFormalTitle(text: string): FormalTitleMatch | null {
  const header = preEmentaHeader(text);
  const lines = header.split(/\r?\n/);
  let offset = 0;

  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.length > 200) {
      offset += rawLine.length + 1;
      continue;
    }
    const m = line.match(FULL_TITLE_RE);
    if (m && isFormalTitleLine(line)) {
      return {
        match: m,
        fromHeader: true,
        lineIndex: i,
        charIndex: offset + rawLine.indexOf(m[0]),
      };
    }
    offset += rawLine.length + 1;
  }

  return null;
}

function extractEmenta(
  text: string,
  afterCharIndex: number,
  blocos?: StructureBlock[],
): string | null {
  const fromBlock = blocos?.find((b) => b.tipo === 'ementa')?.texto?.trim();
  if (fromBlock) return fromBlock;

  const slice = text.slice(Math.max(0, afterCharIndex));
  const match = slice.match(EMENTA_RE);
  if (match?.[1]) {
    return match[1].replace(/\s+/g, ' ').trim();
  }

  // Sem rótulo EMENTA: bloco entre título formal e preâmbulo/primeiro artigo
  const betweenTitleAndBody = slice.match(
    /^\s*\n\s*(.+?)(?=\n\s*(?:CONSIDERANDO|Faço saber|O\s+(?:PREFEITO|GOVERNADOR)|Art(?:igo)?\.\s*\d|DECRETA\s*:|RESOLVE\s*:))/is,
  );
  if (betweenTitleAndBody?.[1]) {
    const candidate = betweenTitleAndBody[1].replace(/\s+/g, ' ').trim();
    if (candidate.length >= 20 && candidate.length <= 2000 && !FULL_TITLE_RE.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractYear(header: string): number | null {
  const fullDate = header.match(/DE\s+\d{1,2}\s+DE\s+\S+\s+DE\s+(20\d{2})/i);
  if (fullDate) return parseInt(fullDate[1], 10);

  const slashYear = header.match(/N[º°oO.]?\s*[\d.]+\s*[/,]\s*(20\d{2})/i);
  if (slashYear) return parseInt(slashYear[1], 10);

  const years = [...header.matchAll(/\b(20\d{2})\b/g)].map((m) => parseInt(m[1], 10));
  return years[0] ?? null;
}

function applyFilenameSignals(
  meta: Pick<DetectedActMetadata, 'tipo' | 'numero' | 'ano'>,
  filename: string,
): number {
  const fromFile = extractFromFilename(filename);
  if (!fromFile.tipo && fromFile.numero == null && fromFile.ano == null) return 0;

  let delta = 0;
  const hasMeta = Boolean(meta.tipo || meta.numero != null || meta.ano != null);

  if (fromFile.tipo) {
    if (!meta.tipo) {
      meta.tipo = fromFile.tipo;
      delta += 10;
    } else if (meta.tipo === fromFile.tipo) {
      delta += 8;
    } else {
      delta -= 18;
    }
  }

  if (fromFile.numero != null) {
    if (meta.numero == null) {
      meta.numero = fromFile.numero;
      delta += 10;
    } else if (meta.numero === fromFile.numero) {
      delta += 8;
    } else {
      delta -= 18;
    }
  }

  if (fromFile.ano != null) {
    if (meta.ano == null) {
      meta.ano = fromFile.ano;
      delta += 6;
    } else if (meta.ano === fromFile.ano) {
      delta += 6;
    } else {
      delta -= 12;
    }
  }

  if (!hasMeta && (fromFile.tipo || fromFile.numero != null)) {
    delta += 5;
  }

  return delta;
}

/** Detecta se a linha é só o título formal (não deve virar unidade estruturada). */
export function isFormalTitleLine(line: string): boolean {
  return FULL_TITLE_RE.test(line.trim()) && line.trim().length < 180;
}

export function confidenceTier(confianca: number): 'alta' | 'media' | 'baixa' {
  if (confianca >= 75) return 'alta';
  if (confianca >= LOW_CONFIDENCE_THRESHOLD) return 'media';
  return 'baixa';
}

export function extractActMetadata(
  text: string,
  filename?: string,
  blocos?: StructureBlock[],
): DetectedActMetadata {
  const header = preEmentaHeader(text);
  let confianca = 0;
  let tipo: string | null = null;
  let numero: number | null = null;
  let ano: number | null = null;
  let dataAto: string | null = null;
  let tituloCompleto: string | null = null;
  let titleFromHeader = false;

  const formal = extractFormalTitle(text);
  let ementaSearchFrom = 0;

  if (formal) {
    const titleMatch = formal.match;
    tituloCompleto = titleMatch[0].replace(/\s+/g, ' ').trim();
    tipo = tipoFromKeyword(titleMatch[1]);
    numero = parseNumero(titleMatch[2]);
    titleFromHeader = formal.fromHeader;
    ementaSearchFrom = formal.charIndex + tituloCompleto.length;

    if (titleMatch[3] && titleMatch[4] && titleMatch[5]) {
      dataAto = parseDataExtenso(titleMatch[3], titleMatch[4], titleMatch[5]);
      ano = parseInt(titleMatch[5], 10);
      confianca += formal.fromHeader ? 50 : 25;
    } else if (titleMatch[6]) {
      ano = parseInt(titleMatch[6], 10);
      confianca += formal.fromHeader ? 40 : 20;
    } else {
      confianca += formal.fromHeader ? 35 : 15;
    }
  } else {
    for (const { tipo: t, pattern } of TYPE_KEYWORDS) {
      if (pattern.test(header)) {
        tipo = t;
        confianca += 12;
        break;
      }
    }

    const looseNum = header.match(
      /\b(?:LEI\s+COMPLEMENTAR|INSTRU[ÇC][ÃA]O\s+NORMATIVA|LEI|DECRETO|PORTARIA|RESOLU[ÇC][ÃA]O)\s+N[º°oO.]?\s*([\d.]+)/i,
    );
    if (looseNum) {
      numero = parseNumero(looseNum[1]);
      confianca += 15;
    }
  }

  if (!ano) {
    const year = extractYear(header);
    if (year) {
      ano = year;
      confianca += 12;
    }
  }

  const ementa = extractEmenta(text, ementaSearchFrom, blocos);
  if (ementa) confianca += 30;

  if (filename) {
    confianca += applyFilenameSignals({ tipo, numero, ano }, filename);
  }

  const finalConfianca = Math.max(0, Math.min(100, confianca));
  const requerConferencia = finalConfianca < LOW_CONFIDENCE_THRESHOLD;

  let finalTipo = tipo;
  let finalNumero = numero;
  let finalAno = ano;
  let finalDataAto = dataAto;
  let finalTitulo = tituloCompleto;

  if (requerConferencia && !titleFromHeader) {
    const fromFile = filename ? extractFromFilename(filename) : {};
    finalTipo = fromFile.tipo ?? null;
    finalNumero = fromFile.numero ?? null;
    finalAno = fromFile.ano ?? null;
    finalDataAto = null;
    if (!fromFile.tipo && fromFile.numero == null) {
      finalTitulo = null;
    }
  }

  return {
    tipo: finalTipo,
    numero: finalNumero,
    ano: finalAno,
    dataAto: finalDataAto,
    ementa,
    tituloCompleto: finalTitulo,
    confianca: finalConfianca,
    titleFromHeader,
    requerConferencia,
  };
}
