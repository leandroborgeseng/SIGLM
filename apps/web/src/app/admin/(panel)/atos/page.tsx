import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink, GitMerge, Pencil, Upload } from 'lucide-react';
import { AdminTopbar, KpiCard } from '@/components/admin/AdminShell';
import { NewActButton } from '@/components/admin/NewActButton';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthError, getAdminActs } from '@/lib/api';
import { requireServerAuth } from '@/lib/auth-server';
import { actUrl, formatDate, SITUACAO_LABELS } from '@/lib/format';

export default async function AdminAtosPage() {
  const token = await requireServerAuth();
  let data;
  try {
    data = await getAdminActs(undefined, token);
  } catch (e) {
    if (e instanceof AuthError) redirect('/admin/login');
    throw e;
  }

  return (
    <ToastProvider>
      <>
      <AdminTopbar
        title="Atos normativos"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/importar">
              <Button variant="outlined" size="sm">
                <Upload className="h-4 w-4" />
                Importar arquivo
              </Button>
            </Link>
            <NewActButton />
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total de atos" value={data.kpis.total} />
          <KpiCard label="Vigentes" value={data.kpis.vigentes} />
          <KpiCard label="Aguardando revisão" value={data.kpis.emRevisao} />
          <KpiCard label="Publicados no mês" value={data.kpis.publicadosMes} />
        </div>

        <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-sm">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2">
                <th className="text-section px-4 py-3">Norma</th>
                <th className="text-section px-4 py-3">Ementa</th>
                <th className="text-section px-4 py-3">Situação</th>
                <th className="text-section px-4 py-3">Status</th>
                <th className="text-section px-4 py-3">Publicação</th>
                <th className="text-section px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((act) => (
                <tr key={act.id} className="border-b border-line-2 transition hover:bg-surface-2">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-brand">
                    {act.codigo}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-ink-2">{act.ementa}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      situacao={act.situacao}
                      label={SITUACAO_LABELS[act.situacao]}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted-bg px-2 py-0.5 text-[11px] font-semibold uppercase text-muted">
                      {act.statusPublicacao.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12.5px] text-ink-3">
                    {formatDate(act.dataPublicacao)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Link href={`/admin/atos/${act.id}/editor`}>
                        <Button variant="ghost" size="xs">
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                      </Link>
                      <Link href={`/admin/consolidar?act=${act.id}`}>
                        <Button variant="ghost" size="xs">
                          <GitMerge className="h-3.5 w-3.5" />
                          Consolidar
                        </Button>
                      </Link>
                      <Link href={actUrl(act.slug)} target="_blank">
                        <Button variant="ghost" size="xs">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Ver público
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
    </ToastProvider>
  );
}
