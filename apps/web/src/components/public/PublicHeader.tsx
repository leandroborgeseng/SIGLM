import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { FrancaMark } from '@/components/brand/FrancaMark';

export function PublicHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/legislacao" className="flex min-w-0 items-center gap-3">
          <FrancaMark size={36} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[14px] font-semibold text-ink">Portal de Legislação</div>
            <div className="truncate text-[11.5px] text-ink-3">Prefeitura de Franca/SP</div>
          </div>
        </Link>
        <Link href="/admin/login" className="shrink-0">
          <Button variant="outlined" size="sm" className="touch-target max-sm:px-3">
            <span className="hidden sm:inline">Área administrativa</span>
            <span className="sm:hidden">Admin</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}
