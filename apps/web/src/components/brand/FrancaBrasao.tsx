import Image from 'next/image';
import { cn } from '@/lib/format';

/** Brasão oficial da Prefeitura de Franca — uso na página pública do ato. */
const BRASAO_WIDTH = 1022;
const BRASAO_HEIGHT = 870;
const BRASAO_ASPECT = BRASAO_WIDTH / BRASAO_HEIGHT;

export function FrancaBrasao({
  className,
  size = 72,
  priority = false,
}: {
  className?: string;
  /** Altura em px (largura proporcional). */
  size?: number;
  priority?: boolean;
}) {
  const height = size;
  const width = Math.round(size * BRASAO_ASPECT);

  return (
    <Image
      src="/brand/franca-brasao.png"
      alt="Brasão da Prefeitura Municipal de Franca"
      width={width}
      height={height}
      className={cn('shrink-0 object-contain object-center', className)}
      style={{ width, height, maxWidth: '100%' }}
      priority={priority}
    />
  );
}
