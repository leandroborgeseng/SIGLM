import type { StructureBlock } from './structure.parser';

export interface DetectedActMetadata {
  tipo: string | null;
  numero: number | null;
  ano: number | null;
  dataAto: string | null;
  ementa: string | null;
  tituloCompleto: string | null;
  confianca: number;
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
  /(?:^|\n)\s*EMENTA\s*:?\s*(.+?)(?=\n\s*(?:Art(?:igo)?\.|§|T[IÍ]TULO|CAP[IÍ]TULO|CONSIDERANDO|Faço saber|$))/is;

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

function extractEmenta(text: string, blocos?: StructureBlock[]): string | null {
  const fromBlock = blocos?.find((b) => b.tipo === 'ementa')?.texto?.trim();
  if (fromBlock) return fromBlock;

  const match = text.match(EMENTA_RE);
  if (match?.[1]) {
    return match[1].replace(/\s+/g, ' ').trim();
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

/** Detecta se a linha é só o título formal (não deve virar unidade estruturada). */
export function isFormalTitleLine(line: string): boolean {
  return FULL_TITLE_RE.test(line.trim()) && line.trim().length < 180;
}

export function extractActMetadata(
  text: string,
  filename?: string,
  blocos?: StructureBlock[],
): DetectedActMetadata {
  const header = text.slice(0, 2500);
  let confianca = 0;
  let tipo: string | null = null;
  let numero: number | null = null;
  let ano: number | null = null;
  let dataAto: string | null = null;
  let tituloCompleto: string | null = null;

  const ementa = extractEmenta(text, blocos);
  if (ementa) confianca += 35;

  const titleMatch = header.match(FULL_TITLE_RE);
  if (titleMatch) {
    tituloCompleto = titleMatch[0].replace(/\s+/g, ' ').trim();
    tipo = tipoFromKeyword(titleMatch[1]);
    numero = parseNumero(titleMatch[2]);
    if (titleMatch[3] && titleMatch[4] && titleMatch[5]) {
      dataAto = parseDataExtenso(titleMatch[3], titleMatch[4], titleMatch[5]);
      ano = parseInt(titleMatch[5], 10);
      confianca += 10;
    } else if (titleMatch[6]) {
      ano = parseInt(titleMatch[6], 10);
    }
    confianca += 45;
  } else {
    for (const { tipo: t, pattern } of TYPE_KEYWORDS) {
      if (pattern.test(header)) {
        tipo = t;
        confianca += 15;
        break;
      }
    }

    const looseNum = header.match(
      /\b(?:LEI\s+COMPLEMENTAR|INSTRU[ÇC][ÃA]O\s+NORMATIVA|LEI|DECRETO|PORTARIA|RESOLU[ÇC][ÃA]O)\s+N[º°oO.]?\s*([\d.]+)/i,
    );
    if (looseNum) {
      numero = parseNumero(looseNum[1]);
      confianca += 20;
    }
  }

  if (!ano) {
    const year = extractYear(header);
    if (year) {
      ano = year;
      confianca += 15;
    }
  }

  if (filename) {
    const fromFile = extractFromFilename(filename);
    if (!tipo && fromFile.tipo) {
      tipo = fromFile.tipo;
      confianca += 12;
    }
    if (!numero && fromFile.numero) {
      numero = fromFile.numero;
      confianca += 12;
    }
    if (!ano && fromFile.ano) {
      ano = fromFile.ano;
      confianca += 8;
    }
  }

  return {
    tipo,
    numero,
    ano,
    dataAto,
    ementa,
    tituloCompleto,
    confianca: Math.min(100, confianca),
  };
}
