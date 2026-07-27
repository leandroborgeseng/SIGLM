'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FrancaMark } from '@/components/brand/FrancaMark';
import { PasswordField } from '@/components/admin/PasswordField';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { Button } from '@/components/ui/Button';
import { changePassword, setAuthCookies } from '@/lib/auth';
import { passwordPolicyMessage } from '@/lib/password-policy';

export default function AlterarSenhaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, refreshUser } = useAdminAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = searchParams.get('from') ?? '/admin/atos';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const policyError = passwordPolicyMessage(novaSenha);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (novaSenha !== confirmacao) {
      setError('A confirmação da senha não confere');
      return;
    }

    setLoading(true);
    try {
      const data = await changePassword(senhaAtual, novaSenha, confirmacao);
      setAuthCookies(data.accessToken, data.refreshToken);
      await refreshUser();
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <p className="text-[14px] text-ink-3">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-8 shadow-md">
        <div className="mb-6 flex items-center gap-3">
          <FrancaMark size={40} priority />
          <div>
            <div className="text-[14px] font-semibold text-ink">Portal de Legislação</div>
            <div className="text-[12px] text-ink-3">{user?.email ?? ''}</div>
          </div>
        </div>

        <p className="text-kicker mb-1">Segurança da conta</p>
        <h1 className="text-page-title mb-2">Alterar senha</h1>
        <p className="mb-6 text-[13.5px] leading-relaxed text-ink-3">
          {user?.mustChangePassword
            ? 'Por segurança, defina uma nova senha antes de continuar no painel.'
            : 'Atualize sua senha de acesso ao painel administrativo.'}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <PasswordField
            id="forced-senha-atual"
            label="Senha atual"
            value={senhaAtual}
            onChange={setSenhaAtual}
            required
            autoComplete="current-password"
          />
          <PasswordField
            id="forced-nova-senha"
            label="Nova senha"
            value={novaSenha}
            onChange={setNovaSenha}
            required
            autoComplete="new-password"
            showRequirements
          />
          <PasswordField
            id="forced-confirmacao"
            label="Confirmar nova senha"
            value={confirmacao}
            onChange={setConfirmacao}
            required
            autoComplete="new-password"
          />

          {error && (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      </div>
    </div>
  );
}
