import Image from 'next/image';
import { cn } from '@/lib/format';

/** Lockup institucional horizontal — Prefeitura Municipal de Franca. */
export function FrancaLockup({
  className,
  height = 40,
  priority = false,
}: {
  className?: string;
  height?: number;
  priority?: boolean;
}) {
  const width = Math.round(height * (220 / 58));

  return (
    <Image
      src="/brand/franca-lockup.png"
      alt="Prefeitura Municipal de Franca"
      width={width}
      height={height}
      className={cn('shrink-0 object-contain object-left', className)}
      priority={priority}
    />
  );
}
