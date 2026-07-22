import { redirect } from 'next/navigation';
import { ActInternalHistoryPanel } from '@/components/admin/ActInternalHistoryPanel';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthError, getAdminAct } from '@/lib/api';
import { requireServerAuth } from '@/lib/auth-server';
import { ACT_TYPE_LABELS } from '@/lib/format';

export default async function HistoricoInternoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = await requireServerAuth();
  let act;
  try {
    act = await getAdminAct(id, token);
  } catch (e) {
    if (e instanceof AuthError) redirect('/admin/login');
    redirect('/admin/atos');
  }

  const label =
    act.codigo ?? `${ACT_TYPE_LABELS[act.tipo]} nº ${act.numero}/${act.ano}`;

  return (
    <ToastProvider>
      <ActInternalHistoryPanel actId={id} actLabel={label} />
    </ToastProvider>
  );
}
