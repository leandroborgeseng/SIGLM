export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SkipLink } from '@/components/a11y/SkipLink';
import { ActCard } from '@/components/public/ActCard';
import { FilterSidebar } from '@/components/public/FilterSidebar';
import { MobileFilterDrawer } from '@/components/public/MobileFilterDrawer';
import { PublicBottomNav } from '@/components/public/PublicBottomNav';
import { PublicHeader } from '@/components/public/PublicHeader';
import { SearchHero } from '@/components/public/SearchHero';
import { getFilterCounts, searchActs } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Portal de Legislação — LeisMunicipais',
  description: 'Consulte atos normativos municipais da Prefeitura de Franca/SP',
};

async function Results({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tipo?: string;
    situacao?: string;
    ano?: string;
    numero?: string;
    assunto?: string;
    publicadoDe?: string;
    publicadoAte?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  let data;
  try {
    data = await searchActs({
      q: sp.q,
      tipo: sp.tipo,
      situacao: sp.situacao,
      ano: sp.ano,
      numero: sp.numero,
      assunto: sp.assunto,
      publicadoDe: sp.publicadoDe,
      publicadoAte: sp.publicadoAte,
      page: sp.page ? Number(sp.page) : 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao buscar atos';
    return (
      <div className="rounded-[14px] border border-line bg-surface p-8 text-center">
        <p className="text-page-title mb-2">Erro ao carregar resultados</p>
        <p className="text-[13px] text-ink-3 font-mono">{msg}</p>
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <div className="rounded-[14px] border border-line bg-surface p-12 text-center">
        <p className="text-page-title mb-2">Nenhum resultado</p>
        <p className="text-[14px] text-ink-3">Tente outros termos ou remova alguns filtros.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-3" role="status">
        {data.total} {data.total === 1 ? 'ato encontrado' : 'atos encontrados'}
      </p>
      <ul className="space-y-4" role="list">
        {data.items.map((act) => (
          <li key={act.id}>
            <ActCard act={act} />
          </li>
        ))}
      </ul>
      {data.totalPages > 1 && (
        <nav className="flex justify-center gap-2 pt-4" aria-label="Paginação">
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/legislacao?${new URLSearchParams({ ...sp, page: String(p) } as Record<string, string>)}`}
              className={`touch-target flex min-w-11 items-center justify-center rounded-[10px] border px-2 text-[13px] font-semibold ${
                p === data.page
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line bg-surface text-ink-2 hover:border-brand'
              }`}
              aria-current={p === data.page ? 'page' : undefined}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export default async function LegislacaoPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tipo?: string;
    situacao?: string;
    ano?: string;
    numero?: string;
    assunto?: string;
    publicadoDe?: string;
    publicadoAte?: string;
    page?: string;
  }>;
}) {
  let counts: Awaited<ReturnType<typeof getFilterCounts>> | null = null;
  let apiError: string | null = null;

  try {
    counts = await getFilterCounts();
  } catch (err) {
    apiError = err instanceof Error ? err.message : 'Erro ao conectar à API';
  }

  if (apiError || !counts) {
    return (
      <>
        <SkipLink />
        <div className="min-h-dvh bg-canvas">
          <PublicHeader />
          <main id="main-content" className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-page-title mb-2">Portal temporariamente indisponível</p>
            <p className="text-[14px] text-ink-3 mb-4">
              Não foi possível carregar os dados da API. Verifique se o serviço da API está no ar.
            </p>
            {apiError && (
              <p className="rounded-[10px] border border-line bg-surface px-4 py-3 text-left text-[13px] text-ink-3 font-mono">
                {apiError}
              </p>
            )}
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <SkipLink />
      <div className="min-h-dvh bg-canvas pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <PublicHeader />
        <Suspense>
          <SearchHero />
        </Suspense>
        <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
            <div className="hidden lg:block">
              <Suspense>
                <FilterSidebar counts={counts} />
              </Suspense>
            </div>
            <div>
              <Suspense>
                <MobileFilterDrawer counts={counts} />
              </Suspense>
              <Suspense
                fallback={
                  <div className="rounded-[14px] border border-line bg-surface p-8 text-ink-3">
                    Carregando resultados...
                  </div>
                }
              >
                <Results searchParams={searchParams} />
              </Suspense>
            </div>
          </div>
        </main>
        <PublicBottomNav />
      </div>
    </>
  );
}
