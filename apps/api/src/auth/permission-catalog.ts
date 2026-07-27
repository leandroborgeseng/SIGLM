export type PermissionGroupId =
  | 'atos'
  | 'importacao'
  | 'consolidacao'
  | 'auditoria'
  | 'administracao';

export type PermissionKey =
  | 'acts:read'
  | 'acts:write'
  | 'acts:publish'
  | 'acts:version'
  | 'acts:history'
  | 'acts:consolidate'
  | 'imports:manage'
  | 'ocr:review'
  | 'audit:read'
  | 'users:manage'
  | 'orgs:all';

export interface PermissionDefinition {
  chave: PermissionKey;
  nome: string;
  descricao: string;
  grupo: PermissionGroupId;
}

export const PERMISSION_GROUPS: { id: PermissionGroupId; label: string }[] = [
  { id: 'atos', label: 'Atos normativos' },
  { id: 'importacao', label: 'Importação' },
  { id: 'consolidacao', label: 'Consolidação' },
  { id: 'auditoria', label: 'Auditoria' },
  { id: 'administracao', label: 'Administração' },
];

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    chave: 'acts:read',
    nome: 'Consultar atos normativos',
    descricao: 'Visualizar atos, metadados e conteúdo no painel administrativo.',
    grupo: 'atos',
  },
  {
    chave: 'acts:write',
    nome: 'Criar e editar atos normativos',
    descricao: 'Cadastrar novos atos e alterar textos, metadados e anexos.',
    grupo: 'atos',
  },
  {
    chave: 'acts:publish',
    nome: 'Publicar atos normativos',
    descricao: 'Tornar revisões públicas no portal de legislação.',
    grupo: 'atos',
  },
  {
    chave: 'acts:version',
    nome: 'Criar e gerenciar versões',
    descricao: 'Controlar versões textuais e revisões internas dos dispositivos.',
    grupo: 'atos',
  },
  {
    chave: 'acts:history',
    nome: 'Consultar histórico interno',
    descricao: 'Acessar o registro de alterações internas de cada ato.',
    grupo: 'atos',
  },
  {
    chave: 'imports:manage',
    nome: 'Gerenciar importações',
    descricao: 'Enviar arquivos, processar importações e acervo histórico.',
    grupo: 'importacao',
  },
  {
    chave: 'ocr:review',
    nome: 'Revisar textos processados por OCR',
    descricao: 'Conferir e corrigir textos extraídos automaticamente de PDFs.',
    grupo: 'importacao',
  },
  {
    chave: 'acts:consolidate',
    nome: 'Gerenciar consolidação normativa',
    descricao: 'Aplicar efeitos legislativos e consolidar textos alterados.',
    grupo: 'consolidacao',
  },
  {
    chave: 'audit:read',
    nome: 'Consultar auditoria',
    descricao: 'Visualizar logs de ações dos usuários no sistema.',
    grupo: 'auditoria',
  },
  {
    chave: 'users:manage',
    nome: 'Gerenciar usuários',
    descricao: 'Administrar usuários, perfis, permissões e cadastros auxiliares.',
    grupo: 'administracao',
  },
  {
    chave: 'orgs:all',
    nome: 'Acessar todos os órgãos',
    descricao: 'Alternar o contexto administrativo para qualquer órgão ou visão consolidada.',
    grupo: 'administracao',
  },
];

export const PERMISSION_CATALOG_BY_KEY = Object.fromEntries(
  PERMISSION_CATALOG.map((p) => [p.chave, p]),
) as Record<PermissionKey, PermissionDefinition>;
