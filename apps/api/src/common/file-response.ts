import type { Response } from 'express';

/** Extensões que o navegador costuma visualizar com segurança (inline). */
const INLINE_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

/** MIME conhecidos para download (attachment); evita tipagem genérica. */
const ATTACHMENT_MIME: Record<string, string> = {
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  dwg: 'application/acad',
  dxf: 'application/dxf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  txt: 'text/plain',
  rtf: 'application/rtf',
  xml: 'application/xml',
  json: 'application/json',
};

/** Tipos que nunca devem ser executados/renderizados na origem do SIGLM. */
const FORCE_DOWNLOAD_EXT = new Set([
  'html',
  'htm',
  'xhtml',
  'svg',
  'js',
  'mjs',
  'cjs',
  'wasm',
  'php',
  'asp',
  'aspx',
  'jsp',
  'cgi',
  'exe',
  'bat',
  'cmd',
  'sh',
  'ps1',
]);

export type FileServeMode = 'inline' | 'attachment';

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function resolveFileServe(filename: string): {
  contentType: string;
  disposition: FileServeMode;
} {
  const ext = extensionOf(filename);

  if (FORCE_DOWNLOAD_EXT.has(ext)) {
    return { contentType: 'application/octet-stream', disposition: 'attachment' };
  }

  if (ext && INLINE_MIME[ext]) {
    return { contentType: INLINE_MIME[ext], disposition: 'inline' };
  }

  if (ext && ATTACHMENT_MIME[ext]) {
    return { contentType: ATTACHMENT_MIME[ext], disposition: 'attachment' };
  }

  // Desconhecido: download seguro, sem tentar renderizar como página.
  return { contentType: 'application/octet-stream', disposition: 'attachment' };
}

export function buildContentDisposition(
  filename: string,
  disposition: FileServeMode,
): string {
  const ascii = filename.replace(/[^\w.\-() ]/g, '_') || 'arquivo';
  const encoded = encodeURIComponent(filename)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Cabeçalhos de segurança para arquivos enviados por usuários. */
export function applyUserFileSecurityHeaders(
  res: Response,
  opts?: { forceIsolate?: boolean },
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Isola apenas downloads forçados (HTML/JS/etc.); PDF/imagem inline seguem sem CSP rígida.
  if (opts?.forceIsolate) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox; frame-ancestors 'none'",
    );
  }
}

export function setUserFileHeaders(res: Response, filename: string): void {
  const { contentType, disposition } = resolveFileServe(filename);
  applyUserFileSecurityHeaders(res, {
    forceIsolate: disposition === 'attachment',
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', buildContentDisposition(filename, disposition));
}

/** Página HTML clara quando o anexo não pode ser localizado (navegação em nova aba). */
export function sendAttachmentUnavailable(
  res: Response,
  message = 'O arquivo não pôde ser localizado ou não está disponível para acesso.',
): void {
  res.status(404);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Arquivo indisponível</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2.5rem 1.25rem;
      background: #f6f7f9; color: #1a1d23; }
    main { max-width: 36rem; margin: 0 auto; background: #fff; border: 1px solid #dde1e6;
      border-radius: 12px; padding: 1.5rem 1.25rem; }
    h1 { font-size: 1.15rem; margin: 0 0 0.75rem; }
    p { margin: 0; line-height: 1.55; color: #3d4450; font-size: 0.95rem; }
  </style>
</head>
<body>
  <main>
    <h1>Arquivo não encontrado</h1>
    <p>${message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c)}</p>
  </main>
</body>
</html>`);
}
