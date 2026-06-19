import { redirect } from 'next/navigation';
import { ActEditor } from '@/components/admin/ActEditor';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthError, getAdminAct } from '@/lib/api';
import { requireServerAuth } from '@/lib/auth-server';

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await requireServerAuth();
  let act;
  try {
    act = await getAdminAct(id, token);
  } catch (e) {
    if (e instanceof AuthError) redirect('/admin/login');
    redirect('/admin/atos');
  }

  return (
    <ToastProvider>
      <ActEditor initialAct={act} />
    </ToastProvider>
  );
}
