export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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

  return (
    <div className="min-h-dvh max-w-full overflow-x-hidden bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="no-print border-b border-line/70 bg-white">
        <div className="mx-auto flex max-w-5xl min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-6">
          <Link
            href="/legislacao"
            className="touch-target shrink-0 text-[13px] text-ink-3 hover:text-brand hover:underline"
          >
            ← Voltar à busca
          </Link>
          <ActActions tipo={tipo} ano={ano} numero={numero} />
        </div>
      </div>

      <main
        id="main-content"
        className="mx-auto min-w-0 max-w-5xl px-4 py-8 sm:px-6 lg:px-10"
      >
        <ActContent act={act} />
      </main>
      <PublicBottomNav />
    </div>
  );
}
