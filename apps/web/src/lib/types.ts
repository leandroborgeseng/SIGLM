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

export type UnitStatus = 'vigente' | 'revogada' | 'revogada_parcialmente' | 'alterada' | 'incluida';

export type UnitType =
  | 'parte'
  | 'livro'
  | 'titulo'
  | 'subtitulo'
  | 'capitulo'
  | 'subcapitulo'
  | 'secao'
  | 'subsecao'
  | 'artigo'
  | 'paragrafo_unico'
  | 'paragrafo'
  | 'inciso'
  | 'alinea'
  | 'item'
  | 'anexo'
  | 'preambulo'
  | 'ementa';

export type EffectType =
  | 'alteracao_redacao'
  | 'inclusao'
  | 'revogacao_total'
  | 'revogacao_parcial'
  | 'renumeracao';

export type InclusaoPosicionamento = 'antes_de' | 'apos' | 'dentro_de';

export interface LegislativeEffect {
  id?: string;
  sourceUnitId: string;
  normaAlteradaActId: string;
  targetUnitId?: string | null;
  tipoEfeito: EffectType;
  dataVigencia: string;
  observacoes?: string | null;
  tipoDispositivoIncluido?: UnitType | null;
  posicionamento?: InclusaoPosicionamento | null;
  referenciaUnitId?: string | null;
  textoNovo?: string | null;
  redacaoUnitId?: string | null;
  novaIdentificacao?: string | null;
  ordem?: number;
  appliedAt?: string | null;
}

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
  efeitosLegislativos?: LegislativeEffect[];
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
