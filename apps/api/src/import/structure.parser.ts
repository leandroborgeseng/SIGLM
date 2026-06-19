export interface StructureBlock {
  tag: string;
  tipo: string;
  texto: string;
  confianca: number;
  ordem: number;
}

export interface DetectedStructure {
  blocos: StructureBlock[];
  textoCompleto: string;
  ocrAprovado: boolean;
  mediaConfianca: number;
}

const ARTICLE_RE = /^Art(?:igo)?\.?\s*(\d+)º?/i;
const EMENTA_RE = /^(?:EMENTA|Ementa)[:\s]/i;
const PREAMBULO_RE = /Faço saber|Faço saber que/i;

export function parseStructure(text: string, baseConfidence = 95): DetectedStructure {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocos: StructureBlock[] = [];
  let ordem = 0;

  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    const blockText = lines.join(' ');

    if (EMENTA_RE.test(blockText) || (ordem === 0 && blockText.length < 500 && !ARTICLE_RE.test(blockText))) {
      blocos.push({
        tag: 'Ementa',
        tipo: 'ementa',
        texto: blockText.replace(/^EMENTA[:\s]*/i, '').trim() || blockText,
        confianca: baseConfidence,
        ordem: ordem++,
      });
      continue;
    }

    if (PREAMBULO_RE.test(blockText)) {
      blocos.push({
        tag: 'Preâmbulo',
        tipo: 'preambulo',
        texto: blockText,
        confianca: baseConfidence,
        ordem: ordem++,
      });
      continue;
    }

    const artMatch = blockText.match(ARTICLE_RE);
    if (artMatch) {
      blocos.push({
        tag: `Art. ${artMatch[1]}º`,
        tipo: 'artigo',
        texto: blockText,
        confianca: baseConfidence,
        ordem: ordem++,
      });
      continue;
    }

    if (blockText.length > 20) {
      blocos.push({
        tag: `Bloco ${ordem + 1}`,
        tipo: 'artigo',
        texto: blockText,
        confianca: Math.max(60, baseConfidence - 10),
        ordem: ordem++,
      });
    }
  }

  if (blocos.length === 0 && normalized) {
    blocos.push({
      tag: 'Texto integral',
      tipo: 'artigo',
      texto: normalized,
      confianca: baseConfidence,
      ordem: 0,
    });
  }

  const mediaConfianca =
    blocos.length > 0
      ? Math.round(blocos.reduce((s, b) => s + b.confianca, 0) / blocos.length)
      : 0;

  return {
    blocos,
    textoCompleto: normalized,
    ocrAprovado: baseConfidence >= 80,
    mediaConfianca,
  };
}

export function mergeOcrPages(
  pages: { pagina: number; texto: string; confianca: { linhas: { texto: string; confianca: number }[]; mediaPagina: number } }[],
): DetectedStructure {
  const textoCompleto = pages.map((p) => p.texto).join('\n\n');
  const allLines = pages.flatMap((p) => p.confianca.linhas ?? []);
  const mediaConfianca =
    allLines.length > 0
      ? Math.round(allLines.reduce((s, l) => s + l.confianca, 0) / allLines.length)
      : 70;

  const structure = parseStructure(textoCompleto, mediaConfianca);

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
