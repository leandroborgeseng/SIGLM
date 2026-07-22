'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ExternalLink, Link2, Pencil, Unlink } from 'lucide-react';
import { HyperlinkDialog } from '@/components/admin/HyperlinkDialog';
import { cn } from '@/lib/format';
import { sanitizeUnitHtml, unitTextToEditorHtml } from '@/lib/rich-text';

function getAnchorFromNode(node: Node | null, root: HTMLElement | null): HTMLAnchorElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root && cur !== document.body) {
    if (cur instanceof HTMLAnchorElement) return cur;
    cur = cur.parentNode;
  }
  return null;
}

function getAnchorAtSelection(root: HTMLElement | null): HTMLAnchorElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return getAnchorFromNode(sel.anchorNode, root);
}

function configureAnchor(a: HTMLAnchorElement, url: string) {
  a.setAttribute('href', url);
  if (/^https?:\/\//i.test(url)) {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  } else {
    a.removeAttribute('target');
    a.removeAttribute('rel');
  }
}

export function UnitTextEditor({
  value,
  onChange,
  disabled,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const savedAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [existingHref, setExistingHref] = useState('');
  const [ctx, setCtx] = useState<{
    anchor: HTMLAnchorElement;
    x: number;
    y: number;
  } | null>(null);
  const skipSync = useRef(false);

  useEffect(() => {
    if (!ref.current || skipSync.current) {
      skipSync.current = false;
      return;
    }
    const next = unitTextToEditorHtml(value || '');
    if (ref.current.innerHTML !== next) {
      ref.current.innerHTML = next;
    }
  }, [value]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    skipSync.current = true;
    onChange(sanitizeUnitHtml(ref.current.innerHTML));
  }, [onChange]);

  const captureSelection = () => {
    const root = ref.current;
    const sel = window.getSelection();
    const anchor = getAnchorAtSelection(root);
    savedAnchorRef.current = anchor;
    if (sel && sel.rangeCount > 0 && root?.contains(sel.anchorNode)) {
      try {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      } catch {
        savedRangeRef.current = null;
      }
    } else if (anchor) {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      savedRangeRef.current = range;
    } else {
      savedRangeRef.current = null;
    }
  };

  const restoreSelection = (): boolean => {
    const root = ref.current;
    if (!root) return false;
    root.focus();
    const sel = window.getSelection();
    if (!sel) return false;

    const anchor = savedAnchorRef.current;
    if (anchor && root.contains(anchor)) {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }

    const range = savedRangeRef.current;
    if (range && root.contains(range.commonAncestorContainer)) {
      try {
        sel.removeAllRanges();
        sel.addRange(range);
        return !sel.isCollapsed;
      } catch {
        return false;
      }
    }
    return false;
  };

  const openLinkDialog = (fromAnchor?: HTMLAnchorElement | null) => {
    const root = ref.current;
    if (fromAnchor) {
      savedAnchorRef.current = fromAnchor;
      const range = document.createRange();
      range.selectNodeContents(fromAnchor);
      savedRangeRef.current = range;
      setSelectedText(fromAnchor.textContent || '');
      setExistingHref(fromAnchor.getAttribute('href') || '');
      setLinkOpen(true);
      setCtx(null);
      return;
    }
    captureSelection();
    const sel = window.getSelection();
    const anchor = savedAnchorRef.current ?? getAnchorAtSelection(root);
    const text = sel?.toString() || anchor?.textContent || '';
    if (!text.trim() && !anchor) return;
    setSelectedText(text.trim() || anchor?.textContent || '');
    setExistingHref(anchor?.getAttribute('href') || '');
    setLinkOpen(true);
    setCtx(null);
  };

  const applyLink = (url: string) => {
    const root = ref.current;
    if (!root) return;

    const existing =
      (savedAnchorRef.current && root.contains(savedAnchorRef.current)
        ? savedAnchorRef.current
        : null) ?? getAnchorAtSelection(root);

    if (existing && root.contains(existing)) {
      configureAnchor(existing, url);
      savedAnchorRef.current = existing;
      emit();
      setExistingHref(url);
      return;
    }

    if (!restoreSelection()) {
      // Fallback: try live selection inside editor
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !root.contains(sel.anchorNode)) {
        return;
      }
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    const a = document.createElement('a');
    configureAnchor(a, url);
    try {
      range.surroundContents(a);
    } catch {
      const fragment = range.extractContents();
      a.appendChild(fragment);
      range.insertNode(a);
    }
    savedAnchorRef.current = a;
    savedRangeRef.current = null;
    sel.removeAllRanges();
    emit();
    setExistingHref(url);
  };

  const removeLink = () => {
    const root = ref.current;
    if (!root) return;
    const existing =
      (savedAnchorRef.current && root.contains(savedAnchorRef.current)
        ? savedAnchorRef.current
        : null) ??
      ctx?.anchor ??
      getAnchorAtSelection(root);
    if (!existing || !root.contains(existing)) return;
    const parent = existing.parentNode;
    while (existing.firstChild) {
      parent?.insertBefore(existing.firstChild, existing);
    }
    parent?.removeChild(existing);
    savedAnchorRef.current = null;
    savedRangeRef.current = null;
    emit();
    setLinkOpen(false);
    setExistingHref('');
    setCtx(null);
  };

  const openHref = (href: string) => {
    if (!href) return;
    const absolute =
      href.startsWith('http') || href.startsWith('mailto:')
        ? href
        : typeof window !== 'undefined'
          ? new URL(href, window.location.origin).toString()
          : href;
    window.open(absolute, '_blank', 'noopener,noreferrer');
  };

  const onEditorClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = e.target as Node;
    const anchor = getAnchorFromNode(target, ref.current);
    if (!anchor) {
      setCtx(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    savedAnchorRef.current = anchor;
    const range = document.createRange();
    range.selectNodeContents(anchor);
    savedRangeRef.current = range;
    const rect = anchor.getBoundingClientRect();
    setCtx({
      anchor,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
    });
  };

  useEffect(() => {
    if (!ctx) return;
    const close = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest('[data-link-ctx]')) return;
      if (t?.closest('[data-unit-editor]')) return;
      setCtx(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [ctx]);

  const minHeight = Math.max(56, rows * 22);

  return (
    <div className={cn('relative space-y-1.5', className)} data-unit-editor>
      {!disabled && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openLinkDialog()}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-line px-2 py-1 text-[11.5px] font-medium text-ink-2 hover:border-brand/40 hover:text-brand"
            title="Inserir ou editar hiperlink no trecho selecionado"
          >
            <Link2 className="h-3.5 w-3.5" />
            Hiperlink
          </button>
          <span className="text-[11px] text-ink-4">Selecione o trecho e clique</span>
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onClick={onEditorClick}
        className={cn(
          'w-full whitespace-pre-wrap rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed focus-ring',
          '[&_a]:text-[#0066cc] [&_a]:underline [&_a]:underline-offset-2',
          disabled && 'opacity-70',
        )}
        style={{ minHeight }}
      />

      {ctx && !disabled && !linkOpen && (
        <div
          data-link-ctx
          className="fixed z-[55] flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] border border-line bg-surface px-1 py-1 shadow-lg"
          style={{ left: ctx.x, top: ctx.y }}
          role="toolbar"
          aria-label="Ações do hiperlink"
        >
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
            onClick={() => openHref(ctx.anchor.getAttribute('href') || '')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
            onClick={() => openLinkDialog(ctx.anchor)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-[11.5px] font-medium text-danger hover:bg-danger/5"
            onClick={removeLink}
          >
            <Unlink className="h-3.5 w-3.5" />
            Remover
          </button>
        </div>
      )}

      <HyperlinkDialog
        open={linkOpen}
        initialUrl={existingHref}
        selectedText={selectedText}
        onClose={() => setLinkOpen(false)}
        onApply={applyLink}
        onRemove={existingHref ? removeLink : undefined}
        onOpen={existingHref ? () => openHref(existingHref) : undefined}
      />
    </div>
  );
}
