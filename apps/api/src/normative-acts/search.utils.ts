import type { PrismaService } from '../prisma/prisma.service';

export const FTS_LANGUAGE = 'portuguese';
export const MAX_SEARCH_TERM_LENGTH = 200;

export function normalizeSearchTerm(q: string): string {
  return q.trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_TERM_LENGTH);
}

export function parseNumeroSearch(term: string): number | null {
  const cleaned = term.replace(/\./g, '').replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export interface FtsFilterParams {
  tipo?: string;
  situacao?: string;
  ano?: number;
}

export function buildFtsFilterSql(
  filters: FtsFilterParams,
  startParamIndex: number,
): { sql: string; params: unknown[]; nextIndex: number } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = startParamIndex;

  if (filters.tipo) {
    params.push(filters.tipo);
    parts.push(`na.tipo = $${i++}::"ActType"`);
  }
  if (filters.situacao) {
    params.push(filters.situacao);
    parts.push(`na.situacao = $${i++}::"ActSituacao"`);
  }
  if (filters.ano) {
    params.push(filters.ano);
    parts.push(`na.ano = $${i++}`);
  }

  return {
    sql: parts.length ? ` AND ${parts.join(' AND ')}` : '',
    params,
    nextIndex: i,
  };
}

export async function refreshSearchVector(prisma: PrismaService, actId: string) {
  await prisma.$executeRawUnsafe(
    `
    UPDATE normative_acts na
    SET search_vector = (
      setweight(to_tsvector('portuguese', coalesce(na.ementa, '')), 'A') ||
      setweight(to_tsvector('portuguese', coalesce(na.assunto, '')), 'B') ||
      setweight(to_tsvector('portuguese', coalesce(array_to_string(na.palavras_chave, ' '), '')), 'C') ||
      setweight(to_tsvector('portuguese', coalesce((
        SELECT string_agg(nu.texto, ' ')
        FROM normative_units nu
        WHERE nu.act_id = na.id
      ), '')), 'D')
    )
    WHERE na.id = $1
  `,
    actId,
  );
}
