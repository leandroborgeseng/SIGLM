export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SkipLink } from '@/components/a11y/SkipLink';
import { ActActions } from '@/components/public/ActActions';
import { ActContent } from '@/components/public/ActContent';
import { PublicBottomNav } from '@/components/public/PublicBottomNav';
import { PublicHeader } from '@/components/public/PublicHeader';
import { StatusBadge } from '@/components/ui/Badge';
import { getActBySlug } from '@/lib/api';
import { formatDate, SITUACAO_LABELS } from '@/lib/format';

type Props = { params: Promise<{ tipo: string; ano: string; numero: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { tipo, ano, numero } = await params;
    const act = await getActBySlug(tipo, ano, numero);
    return { title: `${act.codigo} — LeisMunicipais`, description: act.ementa };
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
      <div className="min-h-dvh bg-canvas pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <PublicHeader />

        <div className="no-print border-b border-line bg-surface">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/legislacao" className="touch-target text-[13px] font-medium text-brand hover:underline">
              ← Voltar à busca
            </Link>
            <ActActions
              tipo={tipo}
              ano={ano}
              numero={numero}
              diarioUrl={pdf?.downloadUrl}
            />
          </div>
        </div>

        <main id="main-content">
          <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-8 border-b border-line-2 pb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-semibold text-brand">{act.codigo}</span>
            <StatusBadge situacao={act.situacao} label={SITUACAO_LABELS[act.situacao]} />
          </div>
          <h1
            className="mb-4 text-[26px] font-semibold leading-snug text-ink"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {act.ementa}
          </h1>
          <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-ink-4">Data do ato</dt>
              <dd className="font-mono text-ink-2">{formatDate(act.dataAto)}</dd>
            </div>
            <div>
              <dt className="text-ink-4">Publicação</dt>
              <dd className="font-mono text-ink-2">{formatDate(act.dataPublicacao)}</dd>
            </div>
            {act.orgaoOrigem && (
              <div>
                <dt className="text-ink-4">Órgão</dt>
                <dd className="text-ink-2">{act.orgaoOrigem}</dd>
              </div>
            )}
            {act.assunto && (
              <div>
                <dt className="text-ink-4">Assunto</dt>
                <dd className="text-ink-2">{act.assunto}</dd>
              </div>
            )}
          </dl>
        </header>

            <ActContent act={act} />
          </article>
        </main>
        <PublicBottomNav />
      </div>
    </>
  );
}
