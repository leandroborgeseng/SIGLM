import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FrancaMark } from '@/components/brand/FrancaMark';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { stagingGateEnabled, unlockStaging } from './actions';

export default async function AcessoDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  if (!(await stagingGateEnabled())) {
    redirect('/legislacao');
  }

  const { erro } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <FrancaMark size={52} shadow priority />
          <h1 className="mt-4 text-[22px] font-bold tracking-tight text-ink">Ambiente de demonstração</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            Este portal está em fase de testes. Informe a senha de acesso para continuar.
          </p>
        </div>

        <form action={unlockStaging} className="space-y-4">
          <Input
            id="password"
            name="password"
            type="password"
            label="Senha de acesso"
            placeholder="Senha fornecida pela equipe"
            required
            autoFocus
          />
          {erro ? (
            <p className="text-[13px] font-medium text-danger" role="alert">
              {erro}
            </p>
          ) : null}
          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-[12px] text-ink-3">
          Área administrativa:{' '}
          <Link href="/admin/login" className="font-medium text-brand hover:underline">
            login do painel
          </Link>
        </p>
      </div>
    </div>
  );
}
