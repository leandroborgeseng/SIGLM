export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SkipLink } from '@/components/a11y/SkipLink';
import { ActActions } from '@/components/public/ActActions';
import { ActContent } from '@/components/public/ActContent';
import { PublicBottomNav } from '@/components/public/PublicBottomNav';
import { getActBySlug } from '@/lib/api';
import { formatFormalTitle } from '@/lib/format';

type Props = { params: Promise<{ tipo: string; ano: string; numero: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { tipo, ano, numero } = await params;
    const act = await getActBySlug(tipo, ano, numero);
    const title =
      act.tituloFormal ?? formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto);
    return { title: `${title} — LeisMunicipais`, description: act.ementa };
  } catch {
    return { title: 'Ato não encontrado — LeisMunicipais' };
  }
}

export default async function ActPage({ params }: Props) {
  const { tipo, ano, numero } = await params;
  let act;
  try {
    act = await getActBySlug(tipo, ano, numero);
  } catch {
    notFound();
  }

  const pdf = act.attachments.find((a) => a.tipo === 'pdf_original');

  return (
    <>
      <SkipLink />
      <div className="min-h-dvh bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="no-print border-b border-line/70 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <Link
              href="/legislacao"
              className="touch-target text-[13px] text-ink-3 hover:text-brand hover:underline"
            >
              ← Voltar à busca
            </Link>
            <ActActions tipo={tipo} ano={ano} numero={numero} diarioUrl={pdf?.downloadUrl} />
          </div>
        </div>

        <main id="main-content" className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:px-10">
          <ActContent act={act} />
        </main>
        <PublicBottomNav />
      </div>
    </>
  );
}
