import Image from 'next/image';
import { cn } from '@/lib/format';

/** Marca oficial da Prefeitura de Franca/SP (arquivo único em /brand/franca-mark.png). */
const MARK_WIDTH = 558;
const MARK_HEIGHT = 844;
const MARK_ASPECT = MARK_WIDTH / MARK_HEIGHT;

export function FrancaMark({
  className,
  size = 36,
  shadow = false,
  priority = false,
}: {
  className?: string;
  /** Altura em px (largura proporcional ao asset original, sem recorte). */
  size?: number;
  shadow?: boolean;
  priority?: boolean;
}) {
  const height = size;
  const width = Math.round(size * MARK_ASPECT);

  return (
    <Image
      src="/brand/franca-mark.png"
      alt="Prefeitura de Franca"
      width={width}
      height={height}
      className={cn(
        'shrink-0 object-contain object-center',
        shadow && 'drop-shadow-[0_3px_10px_rgba(0,0,0,0.25)]',
        className,
      )}
      style={{ width, height, maxWidth: '100%' }}
      priority={priority}
    />
  );
}
