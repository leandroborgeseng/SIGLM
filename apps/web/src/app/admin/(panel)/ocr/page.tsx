import { redirect } from 'next/navigation';

type SearchParams = Promise<{ importId?: string; id?: string }>;

/** Rota legada: OCR ocorre no fluxo Importar — redirect server-side (evita prerender/client hooks). */
export default async function OcrPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const importId = sp.importId ?? sp.id;
  if (importId) {
    redirect(`/admin/importar?id=${encodeURIComponent(importId)}&revisaoOcr=1`);
  }
  redirect('/admin/importar');
}
