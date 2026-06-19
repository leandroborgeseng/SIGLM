import { cn } from '@/lib/format';

/** Marca estilizada (cata-vento) — referência visual Prefeitura de Franca/SP */
export function FrancaMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" className="fill-brand" />
      <circle cx="20" cy="20" r="3" fill="white" />
      <path d="M20 6 L22 18 L20 20 L18 18 Z" fill="white" opacity="0.95" />
      <path d="M34 20 L22 22 L20 20 L22 18 Z" fill="white" opacity="0.85" />
      <path d="M20 34 L18 22 L20 20 L22 22 Z" fill="white" opacity="0.75" />
      <path d="M6 20 L18 18 L20 20 L18 22 Z" fill="white" opacity="0.9" />
    </svg>
  );
}
