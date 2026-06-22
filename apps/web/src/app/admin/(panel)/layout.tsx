import { SkipLink } from '@/components/a11y/SkipLink';
import { AdminAuthProvider } from '@/components/admin/AdminAuthContext';
import { AdminMenuProvider } from '@/components/admin/AdminMenuContext';
import { AdminSidebar } from '@/components/admin/AdminShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminMenuProvider>
      <SkipLink />
      <div className="flex min-h-dvh bg-canvas">
        <AdminSidebar />
        <main
          id="main-content"
          className="flex min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
        >
          {children}
        </main>
      </div>
    </AdminMenuProvider>
    </AdminAuthProvider>
  );
}
