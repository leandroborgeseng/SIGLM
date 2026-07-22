'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { HyperlinkDialog } from '@/components/admin/HyperlinkDialog';
import { cn } from '@/lib/format';
import { sanitizeUnitHtml } from '@/lib/rich-text';

function getAnchorAtSelection(): HTMLAnchorElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  while (node && node !== document.body) {
    if (node instanceof HTMLAnchorElement) return node;
    node = node.parentNode;
  }
  return null;
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
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [existingHref, setExistingHref] = useState('');
  const skipSync = useRef(false);

  useEffect(() => {
    if (!ref.current || skipSync.current) {
      skipSync.current = false;
      return;
    }
    const next = value || '';
    if (ref.current.innerHTML !== next) {
      ref.current.innerHTML = next;
    }
  }, [value]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    skipSync.current = true;
    onChange(sanitizeUnitHtml(ref.current.innerHTML));
  }, [onChange]);

  const openLinkDialog = () => {
    const sel = window.getSelection();
    const anchor = getAnchorAtSelection();
    const text = sel?.toString() || anchor?.textContent || '';
    if (!text.trim() && !anchor) {
      return;
    }
    setSelectedText(text.trim() || anchor?.textContent || '');
    setExistingHref(anchor?.getAttribute('href') || '');
    setLinkOpen(true);
  };

  const applyLink = (url: string) => {
    const root = ref.current;
    if (!root) return;
    root.focus();
    const sel = window.getSelection();
    const existing = getAnchorAtSelection();
    if (existing) {
      existing.setAttribute('href', url);
      if (/^https?:\/\//i.test(url)) {
        existing.setAttribute('target', '_blank');
        existing.setAttribute('rel', 'noopener noreferrer');
      } else {
        existing.removeAttribute('target');
        existing.removeAttribute('rel');
      }
      emit();
      return;
    }
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const a = document.createElement('a');
    a.href = url;
    if (/^https?:\/\//i.test(url)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    try {
      range.surroundContents(a);
    } catch {
      const fragment = range.extractContents();
      a.appendChild(fragment);
      range.insertNode(a);
    }
    sel.removeAllRanges();
    emit();
  };

  const removeLink = () => {
    const existing = getAnchorAtSelection();
    if (!existing) return;
    const parent = existing.parentNode;
    while (existing.firstChild) {
      parent?.insertBefore(existing.firstChild, existing);
    }
    parent?.removeChild(existing);
    emit();
    setLinkOpen(false);
  };

  const minHeight = Math.max(56, rows * 22);

  return (
    <div className={cn('space-y-1.5', className)}>
      {!disabled && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openLinkDialog}
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
        className={cn(
          'w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed focus-ring',
          '[&_a]:text-brand [&_a]:underline',
          disabled && 'opacity-70',
        )}
        style={{ minHeight }}
      />
      <HyperlinkDialog
        open={linkOpen}
        initialUrl={existingHref}
        selectedText={selectedText}
        onClose={() => setLinkOpen(false)}
        onApply={applyLink}
        onRemove={existingHref ? removeLink : undefined}
      />
    </div>
  );
}
