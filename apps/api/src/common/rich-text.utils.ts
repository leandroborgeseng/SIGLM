/**
 * HTML permitido nos textos das unidades: <a> e quebras de linha (<br> / \n).
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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function htmlBlockToNewlines(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
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
    .replace(/\n{3,}/g, '\n\n');
}

export function sanitizeHref(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith('/')) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t)) return t;
  return null;
}

export function sanitizeUnitHtml(input: string): string {
  if (!input) return '';

  const normalizePlain = (text: string) =>
    escapeHtml(text).replace(/\n/g, '<br>\n');

  if (!/<[a-z/]/i.test(input)) {
    return normalizePlain(input.replace(/\r\n/g, '\n'));
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
  return parts.join('').replace(/(?:<br>\n?){3,}/g, '<br>\n<br>\n');
}

export function unitHtmlToPlainText(input: string): string {
  return stripHtmlTags(input);
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

export function formatacaoToCss(fmt: UnitFormatacao | null | undefined): string {
  if (!fmt) return '';
  const styles: string[] = [];
  if (fmt.align) styles.push(`text-align:${fmt.align}`);
  if (fmt.bold) styles.push('font-weight:700');
  if (fmt.italic) styles.push('font-style:italic');
  if (fmt.underline) styles.push('text-decoration:underline');
  if (fmt.letterSpacing === 'expanded') styles.push('letter-spacing:0.28em');
  return styles.join(';');
}
