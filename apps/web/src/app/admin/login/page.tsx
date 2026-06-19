import { Suspense } from 'react';
import AdminLoginPage from './page.client';

export default function LoginPage() {
  return (
    <Suspense>
      <AdminLoginPage />
    </Suspense>
  );
}
