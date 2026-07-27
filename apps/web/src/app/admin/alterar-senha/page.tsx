import { Suspense } from 'react';
import { AdminAuthProvider } from '@/components/admin/AdminAuthContext';
import AlterarSenhaPage from './page.client';

export default function Page() {
  return (
    <AdminAuthProvider>
      <Suspense>
        <AlterarSenhaPage />
      </Suspense>
    </AdminAuthProvider>
  );
}
