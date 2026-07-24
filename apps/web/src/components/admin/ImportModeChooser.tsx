'use client';

import Link from 'next/link';
import { FileStack, Files } from 'lucide-react';
import { AdminTopbar } from '@/components/admin/AdminShell';

export function ImportModeChooser() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTopbar title="Importar" sticky />
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <p className="mb-6 max-w-2xl text-[14px] text-ink-2">
          Escolha o fluxo de importação. A importação estruturada identifica dispositivos; a
          importação de acervo inclui documentos históricos em massa apenas com o arquivo
          original.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/importar?modo=estruturada"
            className="rounded-[14px] border border-line bg-surface p-6 shadow-sm transition hover:border-brand hover:bg-brand-soft/20"
          >
            <Files className="mb-3 h-8 w-8 text-brand" />
            <h2 className="text-[16px] font-semibold text-ink">Importação estruturada</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
              Envie um ato, identifique a estrutura legislativa e revise os dispositivos antes de
              criar o rascunho no Editor de Texto Estruturado.
            </p>
          </Link>
          <Link
            href="/admin/importar?modo=acervo"
            className="rounded-[14px] border border-line bg-surface p-6 shadow-sm transition hover:border-brand hover:bg-brand-soft/20"
          >
            <FileStack className="mb-3 h-8 w-8 text-brand" />
            <h2 className="text-[16px] font-semibold text-ink">Importação de acervo</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
              Envie vários PDFs/DOCX históricos de uma vez. Identifica só os dados básicos e cria
              atos no estágio “Somente arquivo original”, sem estruturar o texto nesta etapa.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
