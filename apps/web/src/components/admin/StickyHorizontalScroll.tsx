'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { cn } from '@/lib/format';

/**
 * Item 84 — rolagem horizontal da grid com barra aderente ao viewport no desktop.
 * No mobile mantém apenas o gesto nativo sobre a área da tabela.
 */
export function StickyHorizontalScroll({
  children,
  className,
  /** Espaço inferior reservado (ex.: barra de ações em lote). */
  bottomOffset = 0,
}: {
  children: ReactNode;
  className?: string;
  bottomOffset?: number;
}) {
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const stickyInnerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const metricsRef = useRef({ left: 0, width: 0, overflows: false, show: false });

  const [overflows, setOverflows] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const [barMetrics, setBarMetrics] = useState({ left: 0, width: 0 });

  const updateVisibility = useCallback(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;

    const overflowsNow = wrap.scrollWidth > wrap.clientWidth + 1;
    if (stickyInnerRef.current) {
      stickyInnerRef.current.style.width = `${wrap.scrollWidth}px`;
    }

    const rect = wrap.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const width = Math.max(0, rect.width);
    const viewBottom = window.innerHeight - Math.max(0, bottomOffset);
    // Histerese: evita piscar no limiar da barra nativa.
    const nativeAccessible = rect.bottom <= viewBottom + 8 && rect.bottom > 48;
    const gridOnScreen = rect.top < viewBottom && rect.bottom > 0;
    const show = overflowsNow && gridOnScreen && !nativeAccessible;

    const prev = metricsRef.current;
    if (
      prev.left !== left ||
      prev.width !== width ||
      prev.overflows !== overflowsNow ||
      prev.show !== show
    ) {
      metricsRef.current = { left, width, overflows: overflowsNow, show };
      setOverflows(overflowsNow);
      setShowSticky(show);
      setBarMetrics({ left, width });
    }
  }, [bottomOffset]);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;

    updateVisibility();
    const ro = new ResizeObserver(() => updateVisibility());
    ro.observe(wrap);
    if (wrap.firstElementChild) ro.observe(wrap.firstElementChild);

    const onScroll = () => updateVisibility();
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [updateVisibility]);

  useLayoutEffect(() => {
    if (!showSticky) return;
    const wrap = tableWrapRef.current;
    const bar = stickyBarRef.current;
    if (!wrap || !bar) return;
    if (stickyInnerRef.current) {
      stickyInnerRef.current.style.width = `${wrap.scrollWidth}px`;
    }
    syncing.current = true;
    bar.scrollLeft = wrap.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, [showSticky, barMetrics.width]);

  const onTableScroll = (e: UIEvent<HTMLDivElement>) => {
    if (syncing.current) return;
    const bar = stickyBarRef.current;
    if (!bar) return;
    syncing.current = true;
    bar.scrollLeft = e.currentTarget.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  const onStickyScroll = (e: UIEvent<HTMLDivElement>) => {
    if (syncing.current) return;
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    syncing.current = true;
    wrap.scrollLeft = e.currentTarget.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={tableWrapRef}
        className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-sm"
        onScroll={onTableScroll}
      >
        {children}
      </div>

      {showSticky && overflows && (
        <div
          className="pointer-events-none fixed z-30 hidden md:block"
          style={{
            left: barMetrics.left,
            width: barMetrics.width,
            bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
          }}
          aria-hidden
        >
          <div
            ref={stickyBarRef}
            className="pointer-events-auto overflow-x-auto overflow-y-hidden border border-line bg-surface/95 shadow-md backdrop-blur"
            style={{ height: 14 }}
            onScroll={onStickyScroll}
          >
            <div ref={stickyInnerRef} style={{ height: 1 }} />
          </div>
        </div>
      )}
    </div>
  );
}
