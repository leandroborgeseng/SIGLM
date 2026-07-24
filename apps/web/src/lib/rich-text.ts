/**
 * HTML permitido nos textos das unidades: <a> e quebras de linha (<br>).
 * Forma canônica: apenas `<br>` (sem `\n` acompanhando), para não duplicar
 * quebras com `whitespace-pre-wrap` nem a cada ciclo salvar/reabrir.
 */

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type LetterSpacing = 'normal' | 'expanded';

export type UnitFormatacao = {
  align?: TextAlign;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  letterSpacing?: LetterSpacing;
};

export const DEFAULT_TEXTO_SIMPLES_FORMAT: UnitFormatacao = {
  align: 'center',
  bold: false,
  italic: false,
  underline: false,
  letterSpacing: 'normal',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Converte marcações de bloco HTML em quebras de linha, preservando o texto. */
export function htmlBlockToNewlines(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|li|tr)(\s[^>]*)?>/gi, '')
    .replace(/&nbsp;/g, ' ');
}

export function stripHtmlTags(value: string): string {
  return htmlBlockToNewlines(value)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    // Não colapsar \n\n — linhas em branco intencionais devem sobreviver.
    .replace(/\n{3,}/g, '\n\n');
}

export function sanitizeHref(url: string): string | null {
  let t = url.trim();
  if (!t) return null;
  if (t.startsWith('/')) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t)) return t;
  if (/^www\./i.test(t)) t = `https://${t}`;
  else if (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+([/?#][^\s]*)?$/i.test(t)
  ) {
    t = `https://${t}`;
  } else {
    return null;
  }
  return /^https?:\/\//i.test(t) ? t : null;
}

/**
 * Escapa texto preservando quebras exatamente uma vez como `<br>`.
 * Idempotente: sanitize(sanitize(x)) === sanitize(x).
 */
export function sanitizeUnitHtml(input: string): string {
  if (!input) return '';

  const normalizePlain = (text: string) =>
    escapeHtml(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')).replace(/\n/g, '<br>');

  if (!/<[a-z/]/i.test(input)) {
    return normalizePlain(input);
  }

  const parts: string[] = [];
  const re = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    parts.push(normalizePlain(stripHtmlTags(input.slice(last, match.index))));
    const attrs = match[1];
    const inner = stripHtmlTags(match[2]).replace(/\n/g, ' ').trim();
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
    const href = hrefMatch ? sanitizeHref(hrefMatch[1]) : null;
    if (href && inner) {
      const external = /^https?:\/\//i.test(href);
      const rel = external ? ' rel="noopener noreferrer" target="_blank"' : '';
      parts.push(`<a href="${escapeHtml(href)}"${rel}>${escapeHtml(inner)}</a>`);
    } else if (inner) {
      parts.push(escapeHtml(inner));
    }
    last = match.index + match[0].length;
  }
  parts.push(normalizePlain(stripHtmlTags(input.slice(last))));
  return parts.join('');
}

/** Texto puro (PDF / busca), preservando quebras. */
export function unitHtmlToPlainText(input: string): string {
  return stripHtmlTags(input);
}

/** Para contentEditable: forma canônica idêntica ao armazenamento. */
export function unitTextToEditorHtml(input: string): string {
  return sanitizeUnitHtml(input || '');
}

export function parseFormatacao(value: unknown): UnitFormatacao | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const align =
    v.align === 'left' || v.align === 'center' || v.align === 'right' || v.align === 'justify'
      ? v.align
      : undefined;
  return {
    ...(align ? { align } : {}),
    ...(typeof v.bold === 'boolean' ? { bold: v.bold } : {}),
    ...(typeof v.italic === 'boolean' ? { italic: v.italic } : {}),
    ...(typeof v.underline === 'boolean' ? { underline: v.underline } : {}),
    ...(v.letterSpacing === 'normal' || v.letterSpacing === 'expanded'
      ? { letterSpacing: v.letterSpacing }
      : {}),
  };
}

export function formatacaoClassNames(fmt: UnitFormatacao | null | undefined): string {
  if (!fmt) return '';
  const classes: string[] = [];
  if (fmt.align === 'left') classes.push('text-left');
  if (fmt.align === 'center') classes.push('text-center');
  if (fmt.align === 'right') classes.push('text-right');
  if (fmt.align === 'justify') classes.push('text-justify');
  if (fmt.bold) classes.push('font-bold');
  if (fmt.italic) classes.push('italic');
  if (fmt.underline) classes.push('underline');
  if (fmt.letterSpacing === 'expanded') classes.push('tracking-[0.28em]');
  return classes.join(' ');
}
