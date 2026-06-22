'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { Input } from '@/components/ui/Form';

const FREQUENT = ['ISS', 'IPTU', 'Código Tributário', 'tributação'];

export function SearchHero() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [, startTransition] = useTransition();

  const update = useCallback(
    (term: string) => {
      const next = new URLSearchParams(params.toString());
      if (term) next.set('q', term);
      else next.delete('q');
      startTransition(() => router.push(`/legislacao?${next.toString()}`));
    },
    [params, router],
  );

  return (
    <section id="busca" className="hero-gradient scroll-mt-16 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-kicker mb-3.5 text-white/80">Legislação Municipal Consolidada</p>
        <h1 className="mb-3.5 text-[28px] font-bold leading-[1.08] tracking-tight text-white sm:text-[36px]">
          Consulte leis, decretos e atos normativos de Franca
        </h1>
        <p className="mb-7 text-[16px] leading-relaxed text-white/90">
          Busque por número, ano, assunto ou qualquer palavra do texto da norma.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update(q.trim());
          }}
          className="relative mx-auto max-w-2xl"
        >
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-4" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar em todo o texto da norma — ementa, assunto, artigos..."
            className="h-12 rounded-[14px] border-0 pl-12 text-[15px] shadow-lg"
            aria-label="Buscar legislação municipal"
          />
        </form>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {FREQUENT.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => {
                setQ(term);
                update(term);
              }}
              className="touch-target rounded-full bg-white/15 px-3 py-2 text-[12.5px] font-medium text-white transition hover:bg-white/25"
            >
              {term}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
