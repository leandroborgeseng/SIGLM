import { redirect } from 'next/navigation';
import { ActsListPanel } from '@/components/admin/ActsListPanel';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthError, getAdminActs } from '@/lib/api';
import { requireServerAuth } from '@/lib/auth-server';

export default async function AdminAtosPage() {
  const token = await requireServerAuth();
  let data;
  try {
    data = await getAdminActs({ page: 1, limit: 20 }, token);
  } catch (e) {
    if (e instanceof AuthError) redirect('/admin/login');
    throw e;
  }

  return (
    <ToastProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <ActsListPanel initial={data} />
      </div>
    </ToastProvider>
  );
}
