'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FrancaMark } from '@/components/brand/FrancaMark';
import { login, setAuthCookies } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('admin@franca.sp.gov.br');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sessaoExpirada = searchParams.get('sessao') === 'expirada';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await login(email, password);
      setAuthCookies(data.accessToken, data.refreshToken);
      const from = searchParams.get('from') ?? '/admin/atos';
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh">
      <div className="hero-gradient hidden flex-1 flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <FrancaMark size={48} shadow priority />
          <div className="leading-tight">
            <div className="text-[18px] font-bold tracking-tight text-white">Portal de Legislação</div>
            <div className="text-[12px] text-white/80">Painel administrativo</div>
          </div>
        </div>
        <div>
          <p className="text-kicker mb-4 text-white/80">Gestão legislativa municipal</p>
          <h1 className="mb-3.5 max-w-md text-[34px] font-bold leading-[1.15] tracking-tight text-white">
            Cadastre, importe e consolide as normas do Município.
          </h1>
          <p className="max-w-sm text-[15px] leading-relaxed text-white/90">
            Versionamento completo, rastreabilidade e revisão humana antes da publicação.
          </p>
        </div>
        <p className="text-[12px] text-white/70">Prefeitura Municipal de Franca/SP</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-8 shadow-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <FrancaMark size={40} priority />
            <div>
              <div className="text-[14px] font-semibold text-ink">Portal de Legislação</div>
              <div className="text-[12px] text-ink-3">Prefeitura Municipal de Franca/SP</div>
            </div>
          </div>
          <p className="text-kicker mb-1">Acesso restrito</p>
          <h2 className="text-page-title mb-6">Entrar no painel</h2>

          {sessaoExpirada && (
            <p className="mb-4 rounded-[10px] border border-warn-bd bg-warn-bg px-3 py-2 text-[13px] text-warn" role="alert">
              Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">E-mail</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Senha</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-[13px] text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no painel'}
            </Button>
          </form>

          <div className="mt-6 rounded-[10px] bg-brand-soft p-3 text-[12.5px] text-brand">
            <strong>Demonstração:</strong> admin@franca.sp.gov.br / admin123
          </div>

          <Link href="/legislacao" className="mt-4 block text-center text-[13px] text-ink-3 hover:text-brand">
            ← Voltar ao portal público
          </Link>
        </div>
      </div>
    </div>
  );
}
