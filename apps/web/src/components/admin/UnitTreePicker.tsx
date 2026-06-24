'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/format';
import { buildUnitTree, unitTreeLabel, type TreeUnit, type UnitTreeNode } from '@/lib/unit-tree';
import { UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';
import type { UnitType } from '@/lib/types';

function TreeNode({
  node,
  selectedId,
  onSelect,
  defaultExpanded,
}: {
  node: UnitTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  defaultExpanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded || node.depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.unit.id;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded-[6px] py-0.5 pr-1',
          isSelected ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2',
        )}
        style={{ paddingLeft: `${node.depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-4"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Recolher' : 'Expandir'}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block h-5 w-5 shrink-0" />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[12px]"
          onClick={() => onSelect(node.unit.id)}
        >
          <span className="font-mono font-medium">{unitTreeLabel(node.unit)}</span>
          <span className="ml-1 text-[10px] text-ink-4">
            ({UNIT_TYPE_LABELS[node.unit.tipoUnidade as UnitType]})
          </span>
        </button>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.unit.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function UnitTreePicker({
  units,
  value,
  onChange,
  placeholder = 'Selecione na árvore…',
  className,
}: {
  units: TreeUnit[];
  value: string | null;
  onChange: (unitId: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const tree = useMemo(() => buildUnitTree(units), [units]);
  const selectedLabel = units.find((u) => u.id === value);

  return (
    <div className={cn('rounded-[8px] border border-line bg-surface', className)}>
      <div className="flex items-center justify-between border-b border-line-2 px-2 py-1.5">
        <span className="truncate text-[11px] text-ink-3">
          {selectedLabel ? unitTreeLabel(selectedLabel) : placeholder}
        </span>
        {value && (
          <button
            type="button"
            className="shrink-0 text-[10px] text-brand hover:underline"
            onClick={() => onChange(null)}
          >
            Limpar
          </button>
        )}
      </div>
      <div className="max-h-40 overflow-y-auto p-1">
        {tree.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-ink-4">Nenhum dispositivo nesta norma.</p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.unit.id}
              node={node}
              selectedId={value}
              onSelect={onChange}
              defaultExpanded={false}
            />
          ))
        )}
      </div>
    </div>
  );
}
