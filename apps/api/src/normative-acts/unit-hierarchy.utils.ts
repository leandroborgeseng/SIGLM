import { UnitType } from '@prisma/client';

export const DIVISION_TYPES: UnitType[] = [
  UnitType.titulo,
  UnitType.capitulo,
  UnitType.secao,
  UnitType.subsecao,
];

export const HIERARCHY_TYPES: UnitType[] = [
  UnitType.artigo,
  UnitType.paragrafo,
  UnitType.inciso,
  UnitType.alinea,
  UnitType.item,
];

const VALID_PARENTS: Partial<Record<UnitType, UnitType[]>> = {
  [UnitType.titulo]: [],
  [UnitType.capitulo]: [UnitType.titulo],
  [UnitType.secao]: [UnitType.capitulo, UnitType.titulo],
  [UnitType.subsecao]: [UnitType.secao, UnitType.capitulo],
  [UnitType.artigo]: [UnitType.titulo, UnitType.capitulo, UnitType.secao, UnitType.subsecao],
  [UnitType.paragrafo]: [UnitType.artigo, UnitType.paragrafo],
  [UnitType.inciso]: [UnitType.artigo, UnitType.paragrafo],
  [UnitType.alinea]: [UnitType.inciso],
  [UnitType.item]: [UnitType.alinea, UnitType.inciso],
};

export function isValidParent(childType: UnitType, parentType: UnitType): boolean {
  const allowed = VALID_PARENTS[childType];
  if (!allowed) return true;
  return allowed.includes(parentType);
}

export function validateUnitsHierarchy(
  units: { id: string; ordem: number; tipoUnidade: UnitType; parentUnitId?: string | null }[],
): boolean {
  if (units.length === 0) return true;

  const sorted = [...units].sort((a, b) => a.ordem - b.ordem);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].ordem !== i) return false;
  }

  const byId = new Map(sorted.map((u) => [u.id, u]));

  for (const unit of sorted) {
    if (!unit.parentUnitId) continue;
    const parent = byId.get(unit.parentUnitId);
    if (!parent) return false;
    if (!isValidParent(unit.tipoUnidade, parent.tipoUnidade)) return false;
    if (parent.ordem >= unit.ordem) return false;
  }

  return true;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function defaultIdentificacao(
  tipo: UnitType,
  units: { tipoUnidade: UnitType; parentUnitId?: string | null; identificacao?: string | null }[],
  parentUnitId?: string | null,
): string | undefined {
  const siblings = (t: UnitType) =>
    units.filter((u) => u.tipoUnidade === t && (u.parentUnitId ?? null) === (parentUnitId ?? null));

  switch (tipo) {
    case UnitType.artigo:
      return `Art. ${units.filter((u) => u.tipoUnidade === UnitType.artigo).length + 1}º`;
    case UnitType.paragrafo:
      return `§ ${siblings(UnitType.paragrafo).length + 1}º`;
    case UnitType.inciso:
      return ROMAN[siblings(UnitType.inciso).length] ?? String(siblings(UnitType.inciso).length + 1);
    case UnitType.alinea:
      return `${String.fromCharCode(97 + siblings(UnitType.alinea).length)})`;
    case UnitType.item:
      return `${siblings(UnitType.item).length + 1}.`;
    case UnitType.titulo:
      return `TÍTULO ${units.filter((u) => u.tipoUnidade === UnitType.titulo).length + 1}`;
    case UnitType.capitulo:
      return `CAPÍTULO ${units.filter((u) => u.tipoUnidade === UnitType.capitulo).length + 1}`;
    case UnitType.secao:
      return `SEÇÃO ${units.filter((u) => u.tipoUnidade === UnitType.secao).length + 1}`;
    default:
      return undefined;
  }
}
