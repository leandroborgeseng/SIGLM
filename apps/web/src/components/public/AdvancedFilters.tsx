'use client';

import { Input } from '@/components/ui/Form';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatOriginOrgLabel } from '@/lib/format';
import type { PublicOriginOrgOption } from '@/lib/types';

type OrgOption = PublicOriginOrgOption & { count?: number };

export function AdvancedFilters({
  numero,
  assunto,
  publicadoDe,
  publicadoAte,
  orgaoOrigemId,
  orgaos,
  onChange,
}: {
  numero: string;
  assunto: string;
  publicadoDe: string;
  publicadoAte: string;
  orgaoOrigemId: string;
  orgaos: OrgOption[];
  onChange: (updates: Record<string, string | null>) => void;
}) {
  const orgOptions = orgaos.map((o) => ({
    value: o.id,
    label:
      o.count != null
        ? `${formatOriginOrgLabel(o)} (${o.count})`
        : formatOriginOrgLabel(o),
    searchText: `${o.sigla ?? ''} ${o.nome}`.trim(),
  }));

  return (
    <div className="space-y-3 border-t border-line-2 pt-4">
      <h2 className="text-section">Busca avançada</h2>
      <div>
        <label htmlFor="filter-orgao" className="mb-1 block text-[12px] text-ink-3">
          Órgão de origem
        </label>
        <SearchableSelect
          id="filter-orgao"
          aria-label="Órgão de origem"
          value={orgaoOrigemId}
          onChange={(v) => onChange({ orgaoOrigemId: v })}
          options={orgOptions}
          allLabel="Todos os órgãos"
          searchPlaceholder="Buscar por sigla ou nome…"
        />
      </div>
      <div>
        <label htmlFor="filter-numero" className="mb-1 block text-[12px] text-ink-3">
          Número do ato
        </label>
        <Input
          id="filter-numero"
          type="number"
          min={1}
          placeholder="Ex.: 312"
          value={numero}
          onChange={(e) => onChange({ numero: e.target.value || null })}
          className="font-mono"
        />
      </div>
      <div>
        <label htmlFor="filter-assunto" className="mb-1 block text-[12px] text-ink-3">
          Assunto
        </label>
        <Input
          id="filter-assunto"
          placeholder="Ex.: tributação"
          value={assunto}
          onChange={(e) => onChange({ assunto: e.target.value || null })}
        />
      </div>
      <div>
        <label htmlFor="filter-de" className="mb-1 block text-[12px] text-ink-3">
          Publicado a partir de
        </label>
        <Input
          id="filter-de"
          type="date"
          value={publicadoDe}
          onChange={(e) => onChange({ publicadoDe: e.target.value || null })}
        />
      </div>
      <div>
        <label htmlFor="filter-ate" className="mb-1 block text-[12px] text-ink-3">
          Publicado até
        </label>
        <Input
          id="filter-ate"
          type="date"
          value={publicadoAte}
          onChange={(e) => onChange({ publicadoAte: e.target.value || null })}
        />
      </div>
    </div>
  );
}
