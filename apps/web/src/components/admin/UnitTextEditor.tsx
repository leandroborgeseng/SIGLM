'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ExternalLink, Link2, Pencil, Unlink } from 'lucide-react';
import { HyperlinkDialog } from '@/components/admin/HyperlinkDialog';
import { cn } from '@/lib/format';
import { sanitizeUnitHtml, unitTextToEditorHtml } from '@/lib/rich-text';

const MARK_ATTR = 'data-siglm-link-mark';

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

function clearSelectionMarks(root: HTMLElement) {
  root.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => el.remove());
}

function createMark(kind: 'start' | 'end'): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.setAttribute(MARK_ATTR, kind);
  mark.setAttribute('contenteditable', 'false');
  mark.style.cssText = 'display:inline;width:0;height:0;overflow:hidden;font-size:0;line-height:0;';
  return mark;
}

/** Insere marcadores no DOM para preservar o trecho mesmo após o diálogo roubar o foco. */
function placeSelectionMarks(root: HTMLElement, range: Range): boolean {
  clearSelectionMarks(root);
  try {
    const endMark = createMark('end');
    const startMark = createMark('start');
    const endRange = range.cloneRange();
    endRange.collapse(false);
    endRange.insertNode(endMark);
    const startRange = range.cloneRange();
    startRange.collapse(true);
    startRange.insertNode(startMark);
    return Boolean(
      root.querySelector(`[${MARK_ATTR}="start"]`) &&
        root.querySelector(`[${MARK_ATTR}="end"]`),
    );
  } catch {
    clearSelectionMarks(root);
    return false;
  }
}

function rangeFromMarks(root: HTMLElement): Range | null {
  const start = root.querySelector(`[${MARK_ATTR}="start"]`);
  const end = root.querySelector(`[${MARK_ATTR}="end"]`);
  if (!start || !end) return null;
  try {
    const range = document.createRange();
    range.setStartAfter(start);
    range.setEndBefore(end);
    return range;
  } catch {
    return null;
  }
}

function wrapRangeWithLink(range: Range, url: string): HTMLAnchorElement {
  const a = document.createElement('a');
  configureAnchor(a, url);
  try {
    range.surroundContents(a);
  } catch {
    const fragment = range.extractContents();
    a.appendChild(fragment);
    range.insertNode(a);
  }
  return a;
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
  const linkDialogOpenRef = useRef(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [existingHref, setExistingHref] = useState('');
  const [applyError, setApplyError] = useState('');
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
    // Não sobrescrever o DOM enquanto o diálogo de link depende dos marcadores.
    if (linkDialogOpenRef.current) return;
    const next = unitTextToEditorHtml(value || '');
    if (ref.current.innerHTML !== next) {
      ref.current.innerHTML = next;
    }
  }, [value]);

  const emit = useCallback(() => {
    if (!ref.current || linkDialogOpenRef.current) return;
    clearSelectionMarks(ref.current);
    skipSync.current = true;
    onChange(sanitizeUnitHtml(ref.current.innerHTML));
  }, [onChange]);

  const captureSelection = () => {
    const root = ref.current;
    if (!root) return;
    clearSelectionMarks(root);
    const sel = window.getSelection();
    const anchor = getAnchorAtSelection(root);
    savedAnchorRef.current = anchor;

    if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode) && !sel.isCollapsed) {
      try {
        const range = sel.getRangeAt(0).cloneRange();
        savedRangeRef.current = range;
        placeSelectionMarks(root, range);
      } catch {
        savedRangeRef.current = null;
      }
      return;
    }

    if (anchor && root.contains(anchor)) {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      savedRangeRef.current = range;
      placeSelectionMarks(root, range);
      return;
    }

    savedRangeRef.current = null;
  };

  const restoreSelection = (): boolean => {
    const root = ref.current;
    if (!root) return false;
    root.focus();
    const sel = window.getSelection();
    if (!sel) return false;

    const fromMarks = rangeFromMarks(root);
    if (fromMarks && !fromMarks.collapsed) {
      sel.removeAllRanges();
      sel.addRange(fromMarks);
      return true;
    }

    const anchor = savedAnchorRef.current;
    if (anchor && root.contains(anchor)) {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }

    const range = savedRangeRef.current;
    if (range) {
      try {
        if (root.contains(range.commonAncestorContainer)) {
          sel.removeAllRanges();
          sel.addRange(range);
          return !sel.isCollapsed;
        }
      } catch {
        /* range detached */
      }
    }
    return false;
  };

  const closeLinkDialog = () => {
    linkDialogOpenRef.current = false;
    setLinkOpen(false);
    setApplyError('');
    if (ref.current) clearSelectionMarks(ref.current);
  };

  const openLinkDialog = (fromAnchor?: HTMLAnchorElement | null) => {
    const root = ref.current;
    setApplyError('');
    if (fromAnchor && root?.contains(fromAnchor)) {
      savedAnchorRef.current = fromAnchor;
      const range = document.createRange();
      range.selectNodeContents(fromAnchor);
      savedRangeRef.current = range;
      placeSelectionMarks(root, range);
      setSelectedText(fromAnchor.textContent || '');
      setExistingHref(fromAnchor.getAttribute('href') || '');
      linkDialogOpenRef.current = true;
      setLinkOpen(true);
      setCtx(null);
      return;
    }
    captureSelection();
    const sel = window.getSelection();
    const anchor = savedAnchorRef.current ?? getAnchorAtSelection(root);
    const marked = root
      ? (rangeFromMarks(root)?.toString() || '')
      : '';
    const text = marked || sel?.toString() || anchor?.textContent || '';
    if (!text.trim() && !anchor) return;
    setSelectedText(text.trim() || anchor?.textContent || '');
    setExistingHref(anchor?.getAttribute('href') || '');
    linkDialogOpenRef.current = true;
    setLinkOpen(true);
    setCtx(null);
  };

  const finishLinkSuccess = (url: string, anchor: HTMLAnchorElement | null) => {
    const root = ref.current;
    if (!root) return;
    savedAnchorRef.current = anchor;
    savedRangeRef.current = null;
    clearSelectionMarks(root);
    window.getSelection()?.removeAllRanges();
    linkDialogOpenRef.current = false;
    setLinkOpen(false);
    setApplyError('');
    setExistingHref(url);
    skipSync.current = true;
    onChange(sanitizeUnitHtml(root.innerHTML));
  };

  const applyLink = (url: string) => {
    const root = ref.current;
    if (!root) return;

    const existing =
      (savedAnchorRef.current && root.contains(savedAnchorRef.current)
        ? savedAnchorRef.current
        : null) ?? getAnchorAtSelection(root);

    const markedRange = rangeFromMarks(root);
    const markedText = markedRange?.toString().trim() ?? '';

    // Editar hiperlink existente (menu contextual / seleção cobrindo o mesmo trecho).
    if (existing && root.contains(existing)) {
      const anchorText = (existing.textContent || '').trim();
      if (!markedText || markedText === anchorText) {
        configureAnchor(existing, url);
        finishLinkSuccess(url, existing);
        return;
      }
    }

    // Preferir marcadores; fallback para Range/seleção ao vivo.
    let range = markedRange && !markedRange.collapsed ? markedRange : null;
    if (!range) {
      if (!restoreSelection()) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !root.contains(sel.anchorNode)) {
          setApplyError(
            'Não foi possível aplicar o hiperlink. Selecione novamente o trecho no texto e clique em Hiperlink.',
          );
          return;
        }
        range = sel.getRangeAt(0);
      } else {
        const sel = window.getSelection();
        range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      }
    }

    if (!range || range.collapsed || !root.contains(range.commonAncestorContainer)) {
      setApplyError(
        'Não foi possível aplicar o hiperlink. Selecione novamente o trecho no texto e clique em Hiperlink.',
      );
      return;
    }

    // Se a seleção coincide com um <a> existente, só atualiza o href (evita aninhamento).
    const anchorInRange = getAnchorFromNode(range.commonAncestorContainer, root);
    if (
      anchorInRange &&
      root.contains(anchorInRange) &&
      range.toString().trim() === (anchorInRange.textContent || '').trim()
    ) {
      configureAnchor(anchorInRange, url);
      finishLinkSuccess(url, anchorInRange);
      return;
    }

    // Remover âncoras interceptadas pela seleção antes de criar o novo vínculo.
    const toUnwrap = Array.from(root.querySelectorAll('a')).filter((el) => {
      try {
        return range!.intersectsNode(el);
      } catch {
        return false;
      }
    });
    for (const a of toUnwrap) {
      const parent = a.parentNode;
      while (a.firstChild) parent?.insertBefore(a.firstChild, a);
      parent?.removeChild(a);
    }

    // Recalcular range após unwrap (marcadores ainda no DOM).
    range = rangeFromMarks(root);
    if (!range || range.collapsed) {
      setApplyError(
        'Não foi possível aplicar o hiperlink. Selecione novamente o trecho no texto e clique em Hiperlink.',
      );
      return;
    }

    const a = wrapRangeWithLink(range, url);
    finishLinkSuccess(url, a);
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
    clearSelectionMarks(root);
    linkDialogOpenRef.current = false;
    setLinkOpen(false);
    setExistingHref('');
    setApplyError('');
    setCtx(null);
    skipSync.current = true;
    onChange(sanitizeUnitHtml(root.innerHTML));
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
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              // Em touch, captura a seleção antes do navegador descartá-la.
              if (e.pointerType === 'touch') captureSelection();
            }}
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
        onInput={() => {
          if (!linkDialogOpenRef.current) emit();
        }}
        onBlur={() => {
          if (!linkDialogOpenRef.current) emit();
        }}
        onClick={onEditorClick}
        className={cn(
          // Sem whitespace-pre-wrap: quebras canônicas são <br> (evita duplicar com \\n).
          'w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed focus-ring',
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
            Abrir link
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
            onClick={() => openLinkDialog(ctx.anchor)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar hiperlink
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-[11.5px] font-medium text-danger hover:bg-danger/5"
            onClick={removeLink}
          >
            <Unlink className="h-3.5 w-3.5" />
            Remover hiperlink
          </button>
        </div>
      )}

      <HyperlinkDialog
        open={linkOpen}
        initialUrl={existingHref}
        selectedText={selectedText}
        applyError={applyError}
        onClose={closeLinkDialog}
        onApply={applyLink}
        onRemove={existingHref ? removeLink : undefined}
        onOpen={existingHref ? () => openHref(existingHref) : undefined}
      />
    </div>
  );
}
