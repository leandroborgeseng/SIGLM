import { redirect } from 'next/navigation';
import { AdministrationPanel } from '@/components/admin/AdministrationPanel';
import { ToastProvider } from '@/components/ui/Toast';
import { fetchMe } from '@/lib/auth';
import { requireServerAuth } from '@/lib/auth-server';
import { hasPermission } from '@/lib/permissions';

export default async function AdministracaoPage() {
  const token = await requireServerAuth();
  let user;
  try {
    user = await fetchMe(token);
  } catch {
    redirect('/admin/login');
  }
  if (!hasPermission(user.permissions, 'users:manage')) {
    redirect('/admin/atos');
  }
  return (
    <ToastProvider>
      <AdministrationPanel />
    </ToastProvider>
  );
}
