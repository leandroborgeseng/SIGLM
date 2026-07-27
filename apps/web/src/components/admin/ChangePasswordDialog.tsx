'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { PasswordField } from '@/components/admin/PasswordField';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { changePassword, setAuthCookies } from '@/lib/auth';
import { passwordPolicyMessage } from '@/lib/password-policy';

export function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { refreshUser } = useAdminAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const reset = () => {
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmacao('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const policyError = passwordPolicyMessage(novaSenha);
    if (policyError) {
      toast(policyError, 'danger');
      return;
    }
    if (novaSenha !== confirmacao) {
      toast('A confirmação da senha não confere', 'danger');
      return;
    }

    setLoading(true);
    try {
      const data = await changePassword(senhaAtual, novaSenha, confirmacao);
      setAuthCookies(data.accessToken, data.refreshToken);
      await refreshUser();
      toast('Senha alterada com sucesso', 'ok');
      handleClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao alterar senha', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand" aria-hidden />
          <h2 id="change-password-title" className="text-[16px] font-semibold text-ink">
            Alterar minha senha
          </h2>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <PasswordField
            id="senha-atual"
            label="Senha atual"
            value={senhaAtual}
            onChange={setSenhaAtual}
            required
            autoComplete="current-password"
          />
          <PasswordField
            id="nova-senha"
            label="Nova senha"
            value={novaSenha}
            onChange={setNovaSenha}
            required
            autoComplete="new-password"
            showRequirements
          />
          <PasswordField
            id="confirmacao-senha"
            label="Confirmar nova senha"
            value={confirmacao}
            onChange={setConfirmacao}
            required
            autoComplete="new-password"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando…' : 'Alterar senha'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
