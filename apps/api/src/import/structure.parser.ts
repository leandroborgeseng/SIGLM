import { extractActMetadata, isFormalTitleLine, type DetectedActMetadata } from './metadata.parser';

export interface StructureBlock {
  tag: string;
  tipo: string;
  texto: string;
  confianca: number;
  ordem: number;
  parentOrdem?: number | null;
  formatacao?: {
    align?: 'left' | 'center' | 'right' | 'justify';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    letterSpacing?: 'normal' | 'expanded';
  } | null;
}

export interface DetectedStructure {
  blocos: StructureBlock[];
  textoCompleto: string;
  ocrAprovado: boolean;
  mediaConfianca: number;
  metadados?: DetectedActMetadata;
}

const EMENTA_RE = /^(?:EMENTA|Ementa)[:\s]/i;
const CONSIDERANDO_RE = /^CONSIDERANDO\b/i;
/** Fórmula introdutória da autoridade / abertura do preâmbulo (não inclui fórmulas DECRETA etc.). */
const PREAMBULO_RE =
  /^(?:O\s+PREFEITO|A\s+PREFEITA|O\s+PRESIDENTE|A\s+PRESIDENTA|Faço saber que|FAÇO SABER QUE)\b/i;
const PARTE_RE = /^(PARTE)\s+(.+)$/i;
const LIVRO_RE = /^(LIVRO)\s+(.+)$/i;
const TITULO_RE = /^(T[IÍ]TULO)\s+(.+)$/i;
const SUBTITULO_RE = /^(SUBT[IÍ]TULO)\s+(.+)$/i;
const CAPITULO_RE = /^(CAP[IÍ]TULO)\s+(.+)$/i;
const SUBCAPITULO_RE = /^(SUBCAP[IÍ]TULO)\s+(.+)$/i;
const SECAO_RE = /^(SE[CÇ][AÃ]O)\s+(.+)$/i;
const SUBSECAO_RE = /^(SUBSE[CÇ][AÃ]O)\s+(.+)$/i;
const ANEXO_RE = /^(ANEXO)\s+(.+)$/i;
const ARTICLE_RE = /^(?:Art\.|Artigo)\s*(\d+[A-Za-z-]*)\s*[°ºoO]?\s*[-–—.]?\s*(.*)$/;
const PARAGRAFO_SYMBOL_RE = /^§\s*([úuUÚ]nico|\d+)\s*[°ºoO]?\.?\s*(.*)$/i;
const PARAGRAFO_UNICO_RE = /^Par[áa]grafo\s+[úuUÚ]nico\.?\s*(.*)$/i;
const PARAGRAFO_NUM_RE = /^Par[áa]grafo\s+(\d+)\s*[°ºoO]?\.?\s*(.*)$/i;
const INCISO_RE = /^([IVXLCDM]{1,6})\s*[-–—.;]\s*(.+)$/i;
const ALINEA_RE = /^([a-z])\)\s*(.+)$/i;
const ITEM_RE = /^(\d{1,2})\.\s+(.+)$/;

/** Expressões e blocos tipicamente não estruturais. */
const TEXTO_SIMPLES_FORMULA_RE =
  /^(?:D\s*E\s*C\s*R\s*E\s*T\s*A|R\s*E\s*S\s*O\s*L\s*V\s*E|F\s*A\s*Z\s+S\s*A\s*B\s*E\s*R)\.?$/i;
const TEXTO_SIMPLES_INTRO_RE =
  /^(?:DECRETA|RESOLVE|FAZ SABER|FAÇO SABER|PROMULGA|SANCIONA)\b/i;
const TEXTO_SIMPLES_ASSINATURA_RE =
  /^(?:Prefeitura Municipal|Gabinete do|Palácio|Sala das Sessões|O Prefeito|A Prefeita|Prefeito Municipal|aos\s+\d{1,2}\s+de\s+)/i;

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

  breakBefore(/([^\n])\s+(?=PARTE\s+)/gi);
  breakBefore(/([^\n])\s+(?=LIVRO\s+)/gi);
  breakBefore(/([^\n])\s+(?=T[IÍ]TULO\s+)/gi);
  breakBefore(/([^\n])\s+(?=SUBT[IÍ]TULO\s+)/gi);
  breakBefore(/([^\n])\s+(?=CAP[IÍ]TULO\s+)/gi);
  breakBefore(/([^\n])\s+(?=SUBCAP[IÍ]TULO\s+)/gi);
  breakBefore(/([^\n])\s+(?=SE[CÇ][AÃ]O\s+)/gi);
  breakBefore(/([^\n])\s+(?=SUBSE[CÇ][AÃ]O\s+)/gi);
  breakBefore(/([^\n])\s+(?=ANEXO\s+)/gi);
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
  formatacao?: StructureBlock['formatacao'],
) {
  const last = blocos[blocos.length - 1];
  // Agrupa fórmula introdutória + considerandos em um único Preâmbulo
  if (tipo === 'preambulo' && last?.tipo === 'preambulo') {
    last.texto = `${last.texto}\n\n${texto.trim()}`;
    last.confianca = Math.round((last.confianca + confianca) / 2);
    return;
  }
  if (tipo === 'ementa' && last?.tipo === 'ementa') {
    last.texto = `${last.texto} ${texto.trim()}`.trim();
    return;
  }

  const parentOrdem = stack.length > 0 ? stack[stack.length - 1].ordem : null;
  const ordem = blocos.length;
  blocos.push({
    tag,
    tipo,
    texto: texto.trim(),
    confianca,
    ordem,
    parentOrdem,
    ...(formatacao ? { formatacao } : {}),
  });
  stack.push({ tipo, ordem });
}

function appendToLastBlock(blocos: StructureBlock[], line: string) {
  const last = blocos[blocos.length - 1];
  if (last.tipo === 'preambulo') {
    last.texto = last.texto ? `${last.texto}\n${line}` : line;
    return;
  }
  last.texto = last.texto ? `${last.texto} ${line}` : line;
}

function trimStackForType(stack: StackEntry[], tipo: string) {
  const divisionOrder = [
    'parte',
    'livro',
    'titulo',
    'subtitulo',
    'capitulo',
    'subcapitulo',
    'secao',
    'subsecao',
    'anexo',
  ];
  const hierarchyOrder = ['artigo', 'paragrafo_unico', 'paragrafo', 'inciso', 'alinea', 'item'];

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

function detectLine(line: string): {
  tipo: string;
  tag: string;
  texto: string;
  formatacao?: StructureBlock['formatacao'];
} | null {
  if (isFormalTitleLine(line)) {
    return null; // título formal vai para metadados, não para unidades
  }

  if (TEXTO_SIMPLES_FORMULA_RE.test(line.replace(/\s+/g, ' ').trim()) || TEXTO_SIMPLES_INTRO_RE.test(line)) {
    const compact = line.replace(/\s+/g, ' ').trim();
    const isExpanded = /D\s+E\s+C\s+R\s+E\s+T\s+A/i.test(line) || /^D\s*E\s*C\s*R\s*E\s*T\s*A/i.test(line);
    return {
      tipo: 'texto_simples',
      tag: 'Texto simples',
      texto: compact.replace(/\s+/g, ' ').replace(/D E C R E T A/i, 'DECRETA').replace(/R E S O L V E/i, 'RESOLVE'),
      formatacao: {
        align: 'center',
        bold: true,
        letterSpacing: isExpanded || /DECRETA|RESOLVE/i.test(compact) ? 'expanded' : 'normal',
      },
    };
  }

  if (TEXTO_SIMPLES_ASSINATURA_RE.test(line)) {
    return {
      tipo: 'texto_simples',
      tag: 'Texto simples',
      texto: line,
      formatacao: { align: 'center', italic: false },
    };
  }

  if (EMENTA_RE.test(line)) {
    return {
      tipo: 'ementa',
      tag: 'Ementa',
      texto: line.replace(/^EMENTA[:\s]*/i, '').trim() || line,
    };
  }
  if (CONSIDERANDO_RE.test(line) || PREAMBULO_RE.test(line)) {
    return { tipo: 'preambulo', tag: 'Preâmbulo', texto: line };
  }

  const parte = line.match(PARTE_RE);
  if (parte) {
    const { tag, texto } = divisionTag(parte[1].toUpperCase(), parte[2]);
    return { tipo: 'parte', tag, texto };
  }

  const livro = line.match(LIVRO_RE);
  if (livro) {
    const { tag, texto } = divisionTag(livro[1].toUpperCase(), livro[2]);
    return { tipo: 'livro', tag, texto };
  }

  const titulo = line.match(TITULO_RE);
  if (titulo) {
    const { tag, texto } = divisionTag(titulo[1].toUpperCase(), titulo[2]);
    return { tipo: 'titulo', tag, texto };
  }

  const subtitulo = line.match(SUBTITULO_RE);
  if (subtitulo) {
    const { tag, texto } = divisionTag(subtitulo[1].toUpperCase(), subtitulo[2]);
    return { tipo: 'subtitulo', tag, texto };
  }

  const capitulo = line.match(CAPITULO_RE);
  if (capitulo) {
    const { tag, texto } = divisionTag(capitulo[1].toUpperCase(), capitulo[2]);
    return { tipo: 'capitulo', tag, texto };
  }

  const subcapitulo = line.match(SUBCAPITULO_RE);
  if (subcapitulo) {
    const { tag, texto } = divisionTag(subcapitulo[1].toUpperCase(), subcapitulo[2]);
    return { tipo: 'subcapitulo', tag, texto };
  }

  const secao = line.match(SECAO_RE);
  if (secao) {
    const { tag, texto } = divisionTag(secao[1].toUpperCase(), secao[2]);
    return { tipo: 'secao', tag, texto };
  }

  const subsecao = line.match(SUBSECAO_RE);
  if (subsecao) {
    const { tag, texto } = divisionTag(subsecao[1].toUpperCase(), subsecao[2]);
    return { tipo: 'subsecao', tag, texto };
  }

  const anexo = line.match(ANEXO_RE);
  if (anexo) {
    const { tag, texto } = divisionTag(anexo[1].toUpperCase(), anexo[2]);
    return { tipo: 'anexo', tag, texto };
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
    if (num === 'único' || num === 'unico') {
      return { tipo: 'paragrafo_unico', tag: 'Parágrafo único', texto: body || line };
    }
    return { tipo: 'paragrafo', tag: `§ ${num}º`, texto: body || line };
  }

  const parUnico = line.match(PARAGRAFO_UNICO_RE);
  if (parUnico) {
    return {
      tipo: 'paragrafo_unico',
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
  // Linhas curtas em maiúsculas após dispositivos → texto simples (assinatura / fórmula)
  const looksLikeSimple =
    line.length <= 120 &&
    /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\s.,;:ºª/-]+$/.test(line) &&
    !ARTICLE_RE.test(line) &&
    blocos.some((b) => ['artigo', 'paragrafo', 'paragrafo_unico', 'inciso'].includes(b.tipo));

  if (looksLikeSimple && blocos.length > 0) {
    const last = blocos[blocos.length - 1];
    if (last.tipo !== 'texto_simples') {
      trimStackForType(stack, 'texto_simples');
      pushBlock(
        blocos,
        stack,
        'texto_simples',
        'Texto simples',
        line,
        Math.max(65, baseConfidence - 10),
        { align: 'center' },
      );
      return;
    }
  }

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
    if (isFormalTitleLine(line)) continue;
    const detected = detectLine(line);
    if (detected) {
      trimStackForType(stack, detected.tipo);
      pushBlock(
        blocos,
        stack,
        detected.tipo,
        detected.tag,
        detected.texto,
        baseConfidence,
        detected.formatacao,
      );
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
