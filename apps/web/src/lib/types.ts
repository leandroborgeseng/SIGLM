export type ActType =
  | 'lei_complementar'
  | 'lei'
  | 'decreto'
  | 'portaria'
  | 'resolucao'
  | 'instrucao_normativa';

export type ActSituacao =
  | 'vigente'
  | 'revogado'
  | 'parcialmente_revogado'
  | 'alterado'
  | 'consolidado';

export type UnitStatus = 'vigente' | 'revogada' | 'alterada' | 'incluida';

export type UnitType =
  | 'titulo'
  | 'livro'
  | 'capitulo'
  | 'secao'
  | 'subsecao'
  | 'artigo'
  | 'paragrafo'
  | 'inciso'
  | 'alinea'
  | 'item'
  | 'anexo'
  | 'preambulo'
  | 'ementa';

export interface ActSummary {
  id: string;
  tipo: ActType;
  numero: number;
  ano: number;
  ementa: string;
  situacao: ActSituacao;
  dataPublicacao: string | null;
  orgaoOrigem: string | null;
  assunto: string | null;
  slug: string;
  codigo: string;
  snippet?: string;
  rank?: number;
}

export interface NormativeVersion {
  id: string;
  texto: string;
  validoDe: string;
  validoAte: string | null;
}

export interface NormativeUnit {
  id: string;
  tipoUnidade: UnitType;
  identificacao: string | null;
  texto: string;
  ordem: number;
  status: UnitStatus;
  parentUnitId?: string | null;
  nota: string | null;
  versoes: NormativeVersion[];
}

export interface ActHistoryItem {
  id: string;
  data: string;
  tipoAlteracao: string;
  nota: string | null;
  fundamento: string | null;
  dispositivo: string | null;
  normaAlteradora: { codigo: string; slug: string } | null;
}

export interface ActDetail extends ActSummary {
  dataAto: string | null;
  palavrasChave: string[];
  autoridadeSignataria: string | null;
  units: NormativeUnit[];
  history: ActHistoryItem[];
  attachments: { id: string; tipo: string; url: string; nome: string; downloadUrl?: string }[];
}

export interface SearchResponse {
  items: ActSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchMode?: 'fulltext' | 'legacy';
}

export interface FilterCounts {
  total: number;
  tipos: Record<string, number>;
  situacoes: Record<string, number>;
  anos: Record<string, number>;
}

export interface AdminKpis {
  total: number;
  vigentes: number;
  emRevisao: number;
  publicadosMes: number;
}

export interface AdminAct extends ActSummary {
  statusPublicacao: string;
  updatedAt: string;
}

export interface AdminActDetail extends ActDetail {
  statusPublicacao?: string;
  hierarchyValid?: boolean;
  observacoesInternas?: string | null;
}

export interface AdminListResponse {
  kpis: AdminKpis;
  items: AdminAct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
