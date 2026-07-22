'use client';

import { FileCode, FileText, Printer } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-url';

export function ActActions({
  tipo,
  ano,
  numero,
}: {
  tipo: string;
  ano: string;
  numero: string;
}) {
  const API_URL = getApiBaseUrl();
  const base = `${API_URL}/public/acts/${tipo}/${ano}/${numero}`;
  const htmlUrl = `${base}/export.html`;
  const pdfUrl = `${base}/export.pdf`;

  const linkClass =
    'inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-[12.5px] text-ink-3 hover:bg-surface-2 hover:text-brand';

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" className={linkClass} onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" />
        Imprimir
      </button>
      <a href={htmlUrl} download className={linkClass}>
        <FileCode className="h-3.5 w-3.5" />
        HTML
      </a>
      <a href={pdfUrl} download className={linkClass}>
        <FileText className="h-3.5 w-3.5" />
        PDF
      </a>
    </div>
  );
}
