import { extractActMetadata, type DetectedActMetadata } from './metadata.parser';

export interface StructureBlock {
  tag: string;
  tipo: string;
  texto: string;
  confianca: number;
  ordem: number;
  parentOrdem?: number | null;
}

export interface DetectedStructure {
  blocos: StructureBlock[];
  textoCompleto: string;
  ocrAprovado: boolean;
  mediaConfianca: number;
  metadados?: DetectedActMetadata;
}

const EMENTA_RE = /^(?:EMENTA|Ementa)[:\s]/i;
const PREAMBULO_RE = /Faço saber|Faço saber que/i;
const TITULO_RE = /^(T[IÍ]TULO)\s+(.+)$/i;
const CAPITULO_RE = /^(CAP[IÍ]TULO)\s+(.+)$/i;
const SECAO_RE = /^(SE[CÇ][AÃ]O)\s+(.+)$/i;
const ARTICLE_RE = /^(?:Art\.|Artigo)\s*(\d+)\s*[°ºoO]?\s*[-–—.]?\s*(.*)$/;
const PARAGRAFO_SYMBOL_RE = /^§\s*([úuUÚ]nico|\d+)\s*[°ºoO]?\.?\s*(.*)$/i;
const PARAGRAFO_UNICO_RE = /^Par[áa]grafo\s+[úuUÚ]nico\.?\s*(.*)$/i;
const PARAGRAFO_NUM_RE = /^Par[áa]grafo\s+(\d+)\s*[°ºoO]?\.?\s*(.*)$/i;
const INCISO_RE = /^([IVXLCDM]{1,6})\s*[-–—.;]\s*(.+)$/i;
const ALINEA_RE = /^([a-z])\)\s*(.+)$/i;
const ITEM_RE = /^(\d{1,2})\.\s+(.+)$/;

type StackEntry = { tipo: string; ordem: number };

/** Insere quebras de linha antes de marcadores normativos embutidos no texto corrido (PDF/DOCX). */
export function preprocessLegalText(text: string): string {
  let t = text
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00ba/g, 'º')
    .replace(/\u00aa/g, 'ª')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const breakBefore = (pattern: RegExp) => {
    t = t.replace(pattern, (match, prefix: string) => `${prefix}\n`);
  };

  breakBefore(/([^\n])\s+(?=T[IÍ]TULO\s+)/gi);
  breakBefore(/([^\n])\s+(?=CAP[IÍ]TULO\s+)/gi);
  breakBefore(/([^\n])\s+(?=SE[CÇ][AÃ]O\s+)/gi);
  breakBefore(/([^\n])\s+(?=(?:Art\.|Artigo)\s*\d+)/g);
  breakBefore(/([^\n])\s+(?=§\s*)/gi);
  breakBefore(/([^\n])\s+(?=Par[áa]grafo\s+)/gi);

  t = t.replace(/([.:;])\s+([IVXLCDM]{1,6})\s*-\s*/gi, '$1\n$2 - ');
  t = t.replace(/([^\n])\s+([IVXLCDM]{1,6})\s*-\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, '$1\n$2 - ');
  t = t.replace(/([;:])\s+([a-z])\)\s+/gi, '$1\n$2) ');

  return t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function pushBlock(
  blocos: StructureBlock[],
  stack: StackEntry[],
  tipo: string,
  tag: string,
  texto: string,
  confianca: number,
) {
  const parentOrdem = stack.length > 0 ? stack[stack.length - 1].ordem : null;
  const ordem = blocos.length;
  blocos.push({ tag, tipo, texto: texto.trim(), confianca, ordem, parentOrdem });
  stack.push({ tipo, ordem });
}

function appendToLastBlock(blocos: StructureBlock[], line: string) {
  const last = blocos[blocos.length - 1];
  last.texto = last.texto ? `${last.texto} ${line}` : line;
}

function trimStackForType(stack: StackEntry[], tipo: string) {
  const divisionOrder = ['titulo', 'capitulo', 'secao', 'subsecao'];
  const hierarchyOrder = ['artigo', 'paragrafo', 'inciso', 'alinea', 'item'];

  if (divisionOrder.includes(tipo)) {
    const level = divisionOrder.indexOf(tipo);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const topLevel = divisionOrder.indexOf(top.tipo);
      if (topLevel >= 0 && topLevel >= level) stack.pop();
      else break;
    }
    return;
  }

  if (hierarchyOrder.includes(tipo)) {
    const level = hierarchyOrder.indexOf(tipo);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const topDiv = divisionOrder.indexOf(top.tipo);
      if (topDiv >= 0) break;
      const topLevel = hierarchyOrder.indexOf(top.tipo);
      if (topLevel >= 0 && topLevel >= level) stack.pop();
      else break;
    }
  }
}

function divisionTag(label: string, rest: string): { tag: string; texto: string } {
  const parts = rest.split(/\s*[-–—]\s*/);
  const head = parts[0]?.trim() ?? rest;
  const body = parts.slice(1).join(' - ').trim();
  return {
    tag: `${label} ${head}`.trim(),
    texto: body || rest.trim(),
  };
}

function detectLine(line: string): { tipo: string; tag: string; texto: string } | null {
  if (EMENTA_RE.test(line)) {
    return {
      tipo: 'ementa',
      tag: 'Ementa',
      texto: line.replace(/^EMENTA[:\s]*/i, '').trim() || line,
    };
  }
  if (PREAMBULO_RE.test(line)) {
    return { tipo: 'preambulo', tag: 'Preâmbulo', texto: line };
  }

  const titulo = line.match(TITULO_RE);
  if (titulo) {
    const { tag, texto } = divisionTag(titulo[1].toUpperCase(), titulo[2]);
    return { tipo: 'titulo', tag, texto };
  }

  const capitulo = line.match(CAPITULO_RE);
  if (capitulo) {
    const { tag, texto } = divisionTag(capitulo[1].toUpperCase(), capitulo[2]);
    return { tipo: 'capitulo', tag, texto };
  }

  const secao = line.match(SECAO_RE);
  if (secao) {
    const { tag, texto } = divisionTag(secao[1].toUpperCase(), secao[2]);
    return { tipo: 'secao', tag, texto };
  }

  const art = line.match(ARTICLE_RE);
  if (art) {
    const body = art[2]?.trim() ?? '';
    return { tipo: 'artigo', tag: `Art. ${art[1]}º`, texto: body || line };
  }

  const parSymbol = line.match(PARAGRAFO_SYMBOL_RE);
  if (parSymbol) {
    const num = parSymbol[1].toLowerCase();
    const body = parSymbol[2]?.trim() ?? '';
    const tag = num === 'único' || num === 'unico' ? '§ único' : `§ ${num}º`;
    return { tipo: 'paragrafo', tag, texto: body || line };
  }

  const parUnico = line.match(PARAGRAFO_UNICO_RE);
  if (parUnico) {
    return {
      tipo: 'paragrafo',
      tag: 'Parágrafo único',
      texto: parUnico[1]?.trim() || line,
    };
  }

  const parNum = line.match(PARAGRAFO_NUM_RE);
  if (parNum) {
    const body = parNum[2]?.trim() ?? '';
    return { tipo: 'paragrafo', tag: `§ ${parNum[1]}º`, texto: body || line };
  }

  const alinea = line.match(ALINEA_RE);
  if (alinea) {
    return { tipo: 'alinea', tag: `${alinea[1].toLowerCase()})`, texto: alinea[2].trim() };
  }

  const item = line.match(ITEM_RE);
  if (item && !ARTICLE_RE.test(line)) {
    return { tipo: 'item', tag: `${item[1]}.`, texto: item[2].trim() };
  }

  const inciso = line.match(INCISO_RE);
  if (inciso && /^[IVXLCDM]+$/i.test(inciso[1])) {
    return {
      tipo: 'inciso',
      tag: inciso[1].toUpperCase(),
      texto: inciso[2]?.trim() || line,
    };
  }

  return null;
}

function handleUnmarkedLine(
  blocos: StructureBlock[],
  stack: StackEntry[],
  line: string,
  baseConfidence: number,
) {
  if (blocos.length > 0) {
    appendToLastBlock(blocos, line);
    return;
  }

  if (EMENTA_RE.test(line)) {
    trimStackForType(stack, 'ementa');
    pushBlock(
      blocos,
      stack,
      'ementa',
      'Ementa',
      line.replace(/^EMENTA[:\s]*/i, '').trim() || line,
      baseConfidence,
    );
    return;
  }

  const last = blocos[blocos.length - 1];
  if (last?.tipo === 'preambulo') {
    appendToLastBlock(blocos, line);
    return;
  }

  trimStackForType(stack, 'preambulo');
  pushBlock(blocos, stack, 'preambulo', 'Preâmbulo', line, Math.max(70, baseConfidence - 5));
}

export function parseStructure(
  text: string,
  baseConfidence = 95,
  filename?: string,
): DetectedStructure {
  const normalized = preprocessLegalText(text);
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  const blocos: StructureBlock[] = [];
  const stack: StackEntry[] = [];

  for (const line of lines) {
    const detected = detectLine(line);
    if (detected) {
      trimStackForType(stack, detected.tipo);
      pushBlock(blocos, stack, detected.tipo, detected.tag, detected.texto, baseConfidence);
    } else {
      handleUnmarkedLine(blocos, stack, line, baseConfidence);
    }
  }

  if (blocos.length === 0 && normalized) {
    blocos.push({
      tag: 'Texto integral',
      tipo: 'artigo',
      texto: normalized,
      confianca: Math.max(60, baseConfidence - 15),
      ordem: 0,
      parentOrdem: null,
    });
  }

  const mediaConfianca =
    blocos.length > 0
      ? Math.round(blocos.reduce((s, b) => s + b.confianca, 0) / blocos.length)
      : 0;

  const metadados = extractActMetadata(normalized, filename, blocos);

  return {
    blocos,
    textoCompleto: normalized,
    ocrAprovado: baseConfidence >= 80,
    mediaConfianca,
    metadados,
  };
}

export function mergeOcrPages(
  pages: { pagina: number; texto: string; confianca: { linhas: { texto: string; confianca: number }[]; mediaPagina: number } }[],
  filename?: string,
): DetectedStructure {
  const textoCompleto = pages.map((p) => p.texto).join('\n\n');
  const allLines = pages.flatMap((p) => p.confianca.linhas ?? []);
  const mediaConfianca =
    allLines.length > 0
      ? Math.round(allLines.reduce((s, l) => s + l.confianca, 0) / allLines.length)
      : 70;

  const structure = parseStructure(textoCompleto, mediaConfianca, filename);

  for (const bloco of structure.blocos) {
    const matchingLines = allLines.filter((l) => bloco.texto.includes(l.texto.slice(0, 30)));
    if (matchingLines.length > 0) {
      bloco.confianca = Math.round(
        matchingLines.reduce((s, l) => s + l.confianca, 0) / matchingLines.length,
      );
    }
  }

  structure.mediaConfianca = mediaConfianca;
  structure.ocrAprovado = false;
  return structure;
}
