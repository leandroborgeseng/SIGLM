'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { createAct, listOrgans, type OriginOrg } from '@/lib/admin-api';
import { ACT_TYPE_LABELS, ACT_TYPES, formatFormalTitle } from '@/lib/format';
import type { ActType } from '@/lib/types';

export function NewActButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [organs, setOrgans] = useState<OriginOrg[]>([]);
  const [form, setForm] = useState({
    tipo: 'lei' as ActType,
    numero: '',
    dataAto: '',
    orgaoOrigemId: '',
  });

  useEffect(() => {
    if (!open) return;
    listOrgans(true)
      .then(setOrgans)
      .catch(() => undefined);
  }, [open]);

  const anoDerivado = form.dataAto
    ? new Date(form.dataAto).getUTCFullYear()
    : new Date().getFullYear();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dataAto) {
      toast('Informe a Data do ato', 'warn');
      return;
    }
    setLoading(true);
    try {
      const act = await createAct({
        tipo: form.tipo,
        numero: Number(form.numero),
        ano: anoDerivado,
        ementa: 'Ementa pendente',
        dataAto: form.dataAto,
        orgaoOrigemId: form.orgaoOrigemId || undefined,
      });
      toast('Ato criado como rascunho', 'ok');
      setOpen(false);
      router.push(`/admin/atos/${act.id}/editor`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao criar ato', 'danger');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Novo ato
      </Button>
    );
  }

  const preview = formatFormalTitle(
    form.tipo,
    Number(form.numero) || 0,
    anoDerivado,
    form.dataAto || null,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-[14px] border border-line bg-surface p-6 shadow-lg"
      >
        <h2 className="text-page-title mb-4">Novo ato normativo</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
            <Select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as ActType })}
            >
              {ACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Número</label>
            <Input
              type="number"
              required
              min={1}
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
              className="font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Data do ato</label>
            <Input
              type="date"
              required
              value={form.dataAto}
              onChange={(e) => setForm({ ...form, dataAto: e.target.value })}
              className="font-mono"
            />
            <p className="mt-1 text-[11px] text-ink-4">
              O ano ({anoDerivado}) é obtido automaticamente a partir desta data.
            </p>
          </div>
          {form.numero && form.dataAto && (
            <p className="rounded-[8px] bg-surface-2 px-3 py-2 text-[12px] font-semibold uppercase text-ink">
              {preview}
            </p>
          )}
          <p className="rounded-[8px] border border-dashed border-line px-3 py-2 text-[12px] text-ink-3">
            A ementa será cadastrada no Editor de Texto Estruturado (grupo Texto → Ementa).
          </p>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Órgão de origem</label>
            <Select
              value={form.orgaoOrigemId}
              onChange={(e) => setForm({ ...form, orgaoOrigemId: e.target.value })}
            >
              <option value="">Selecione…</option>
              {organs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.sigla ? `${o.sigla} — ${o.nome}` : o.nome}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Criando...' : 'Criar rascunho'}
          </Button>
        </div>
      </form>
    </div>
  );
}
