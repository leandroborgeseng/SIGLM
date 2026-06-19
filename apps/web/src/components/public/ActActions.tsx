'use client';

import { Download, FileCode, FileText, Printer } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-url';
import { Button } from '@/components/ui/Button';

export function ActActions({
  tipo,
  ano,
  numero,
  diarioUrl,
}: {
  tipo: string;
  ano: string;
  numero: string;
  diarioUrl?: string;
}) {
  const API_URL = getApiBaseUrl();
  const base = `${API_URL}/public/acts/${tipo}/${ano}/${numero}`;
  const htmlUrl = `${base}/export.html`;
  const pdfUrl = `${base}/export.pdf`;
  const diarioFullUrl = diarioUrl
    ? diarioUrl.startsWith('http')
      ? diarioUrl
      : `${API_URL}${diarioUrl}`
    : undefined;

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outlined" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Imprimir
      </Button>
      <a href={htmlUrl} download className="inline-flex">
        <Button variant="outlined" size="sm">
          <FileCode className="h-4 w-4" />
          Exportar HTML
        </Button>
      </a>
      <a href={pdfUrl} download className="inline-flex">
        <Button variant="outlined" size="sm">
          <FileText className="h-4 w-4" />
          Exportar PDF
        </Button>
      </a>
      {diarioFullUrl && (
        <a href={diarioFullUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
          <Button variant="tonal" size="sm">
            <Download className="h-4 w-4" />
            PDF do Diário Oficial
          </Button>
        </a>
      )}
    </div>
  );
}
