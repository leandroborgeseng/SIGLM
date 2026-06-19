'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { createAct } from '@/lib/admin-api';
import { ACT_TYPE_LABELS, ACT_TYPES } from '@/lib/format';

export function NewActButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tipo: 'lei',
    numero: '',
    ano: String(new Date().getFullYear()),
    ementa: '',
    orgaoOrigem: 'Câmara Municipal de Franca',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const act = await createAct({
        tipo: form.tipo,
        numero: Number(form.numero),
        ano: Number(form.ano),
        ementa: form.ementa,
        orgaoOrigem: form.orgaoOrigem,
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
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            >
              {ACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
              <label className="mb-1 block text-[12px] text-ink-3">Ano</label>
              <Input
                type="number"
                required
                min={1900}
                value={form.ano}
                onChange={(e) => setForm({ ...form, ano: e.target.value })}
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Ementa</label>
            <textarea
              required
              minLength={3}
              value={form.ementa}
              onChange={(e) => setForm({ ...form, ementa: e.target.value })}
              className="min-h-[80px] w-full rounded-[10px] border border-line px-3.5 py-2 text-[13.5px] focus-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Órgão de origem</label>
            <Input
              value={form.orgaoOrigem}
              onChange={(e) => setForm({ ...form, orgaoOrigem: e.target.value })}
            />
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
