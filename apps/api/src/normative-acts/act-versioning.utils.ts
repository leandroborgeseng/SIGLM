import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ActSnapshot = {
  metadata: {
    tipo: string;
    numero: number;
    ano: number;
    ementa: string;
    dataAto: string | null;
    dataPublicacao: string | null;
    orgaoOrigem: string | null;
    orgaoOrigemId: string | null;
    orgaoOrigemIds: string[];
    meioPublicacaoId: string | null;
    meioPublicacao: string | null;
    atoConjunto: boolean;
    prefixoTituloModo: string;
    prefixoTitulo: string | null;
    signatories: { signatoryId: string | null; nome: string; cargo: string; ordem: number }[];
    assunto: string | null;
    situacao: string;
    autoridadeSignataria: string | null;
    palavrasChave: string[];
    statusPublicacao: string;
    editionOpen: boolean;
    responsavelEstruturacaoId: string | null;
    responsavelRevisaoId: string | null;
    responsavelEstruturacaoNome: string | null;
    responsavelRevisaoNome: string | null;
  };
  units: {
    id: string;
    tipoUnidade: string;
    identificacao: string | null;
    texto: string;
    formatacao: unknown;
    ordem: number;
    parentUnitId: string | null;
    status: string;
  }[];
  effects: {
    id: string;
    sourceUnitId: string;
    normaAlteradaActId: string;
    targetUnitId: string | null;
    tipoEfeito: string;
    dataVigencia: string;
    observacoes: string | null;
    tipoDispositivoIncluido: string | null;
    posicionamento: string | null;
    referenciaUnitId: string | null;
    textoNovo: string | null;
    redacaoUnitId: string | null;
    novaIdentificacao: string | null;
    ordem: number;
    appliedAt: string | null;
  }[];
  attachments: {
    id: string;
    tipo: string;
    nome: string;
    titulo: string | null;
    href: string | null;
    url: string;
    ordem: number;
    ativo: boolean;
  }[];
};

export async function buildActSnapshot(
  prisma: PrismaService,
  actId: string,
): Promise<ActSnapshot> {
  const act = await prisma.normativeAct.findUniqueOrThrow({
    where: { id: actId },
    include: {
      orgao: true,
      meioPublicacao: true,
      originOrgs: { orderBy: { ordem: 'asc' }, include: { orgao: true } },
      signatories: { orderBy: { ordem: 'asc' } },
      units: { orderBy: { ordem: 'asc' } },
      attachments: { orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }] },
      responsavelEstruturacao: { select: { id: true, nome: true, ativo: true } },
      responsavelRevisao: { select: { id: true, nome: true, ativo: true } },
    },
  });
  const unitIds = act.units.map((u) => u.id);
  const effects =
    unitIds.length > 0
      ? await prisma.legislativeEffect.findMany({
          where: { sourceUnitId: { in: unitIds } },
          orderBy: [{ sourceUnitId: 'asc' }, { ordem: 'asc' }],
        })
      : [];

  const orgaoOrigemIds = act.originOrgs.map((l) => l.orgaoId);
  const orgaoNomes = act.originOrgs.map((l) => l.orgao.nome);

  return {
    metadata: {
      tipo: act.tipo,
      numero: act.numero,
      ano: act.ano,
      ementa:
        act.units
          .find((u) => u.tipoUnidade === 'ementa')
          ?.texto?.replace(/<[^>]+>/g, '')
          .trim() || act.ementa,
      dataAto: act.dataAto?.toISOString() ?? null,
      dataPublicacao: act.dataPublicacao?.toISOString() ?? null,
      orgaoOrigem: orgaoNomes.join('; ') || act.orgao?.nome || act.orgaoOrigem,
      orgaoOrigemId: act.orgaoOrigemId,
      orgaoOrigemIds,
      meioPublicacaoId: act.meioPublicacaoId,
      meioPublicacao: act.meioPublicacao?.nome ?? null,
      atoConjunto: act.atoConjunto,
      prefixoTituloModo: act.prefixoTituloModo,
      prefixoTitulo: act.prefixoTitulo,
      signatories: act.signatories.map((s) => ({
        signatoryId: s.signatoryId,
        nome: s.nome,
        cargo: s.cargo,
        ordem: s.ordem,
      })),
      assunto: act.assunto,
      situacao: act.situacao,
      autoridadeSignataria: act.autoridadeSignataria,
      palavrasChave: act.palavrasChave,
      statusPublicacao: act.statusPublicacao,
      editionOpen: act.editionOpen,
      responsavelEstruturacaoId: act.responsavelEstruturacaoId,
      responsavelRevisaoId: act.responsavelRevisaoId,
      responsavelEstruturacaoNome: act.responsavelEstruturacao?.nome ?? null,
      responsavelRevisaoNome: act.responsavelRevisao?.nome ?? null,
    },
    units: act.units.map((u) => ({
      id: u.id,
      tipoUnidade: u.tipoUnidade,
      identificacao: u.identificacao,
      texto: u.texto,
      formatacao: u.formatacao ?? null,
      ordem: u.ordem,
      parentUnitId: u.parentUnitId,
      status: u.status,
    })),
    effects: effects.map((e) => ({
      id: e.id,
      sourceUnitId: e.sourceUnitId,
      normaAlteradaActId: e.normaAlteradaActId,
      targetUnitId: e.targetUnitId,
      tipoEfeito: e.tipoEfeito,
      dataVigencia: e.dataVigencia.toISOString(),
      observacoes: e.observacoes,
      tipoDispositivoIncluido: e.tipoDispositivoIncluido,
      posicionamento: e.posicionamento,
      referenciaUnitId: e.referenciaUnitId,
      textoNovo: e.textoNovo,
      redacaoUnitId: e.redacaoUnitId,
      novaIdentificacao: e.novaIdentificacao,
      ordem: e.ordem,
      appliedAt: e.appliedAt?.toISOString() ?? null,
    })),
    attachments: act.attachments.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      nome: a.nome,
      titulo: a.titulo,
      href: a.href,
      url: a.url,
      ordem: a.ordem,
      ativo: a.ativo,
    })),
  };
}

export async function recordInternalHistory(
  prisma: PrismaService,
  params: {
    actId: string;
    userId?: string | null;
    acao: string;
    resumo?: string;
    revisionNumber?: number | null;
    withSnapshot?: boolean;
  },
) {
  const snapshot = params.withSnapshot
    ? await buildActSnapshot(prisma, params.actId)
    : null;

  return prisma.actInternalHistory.create({
    data: {
      actId: params.actId,
      userId: params.userId ?? null,
      acao: params.acao,
      resumo: params.resumo,
      revisionNumber: params.revisionNumber ?? null,
      snapshot: snapshot ? (snapshot as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}

export function diffSnapshots(a: ActSnapshot, b: ActSnapshot) {
  const metaChanges: { campo: string; de: unknown; para: unknown }[] = [];
  for (const key of Object.keys(a.metadata) as (keyof ActSnapshot['metadata'])[]) {
    const left = a.metadata[key];
    const right = b.metadata[key];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      metaChanges.push({ campo: key, de: left, para: right });
    }
  }

  const aUnits = new Map(a.units.map((u) => [u.id, u]));
  const bUnits = new Map(b.units.map((u) => [u.id, u]));
  const added = b.units.filter((u) => !aUnits.has(u.id));
  const removed = a.units.filter((u) => !bUnits.has(u.id));
  const changed = b.units
    .filter((u) => aUnits.has(u.id))
    .map((u) => {
      const prev = aUnits.get(u.id)!;
      const fields: string[] = [];
      if (prev.texto !== u.texto) {
        fields.push('texto');
        const linkRe = /<a\s[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi;
        const prevLinks = [...(prev.texto.match(linkRe) ?? [])].sort().join('|');
        const nextLinks = [...(u.texto.match(linkRe) ?? [])].sort().join('|');
        if (prevLinks !== nextLinks) fields.push('hiperlink');
      }
      if (JSON.stringify(prev.formatacao) !== JSON.stringify(u.formatacao)) fields.push('formatacao');
      if (prev.identificacao !== u.identificacao) fields.push('identificacao');
      if (prev.tipoUnidade !== u.tipoUnidade) fields.push('tipoUnidade');
      if (prev.ordem !== u.ordem) fields.push('ordem');
      if (prev.parentUnitId !== u.parentUnitId) fields.push('parentUnitId');
      if (prev.status !== u.status) fields.push('status');
      return fields.length ? { id: u.id, identificacao: u.identificacao, fields, de: prev, para: u } : null;
    })
    .filter(Boolean);

  const orderChanged =
    a.units.map((u) => u.id).join(',') !== b.units.map((u) => u.id).join(',');

  const aAtt = new Map((a.attachments ?? []).map((x) => [x.id, x]));
  const bAtt = new Map((b.attachments ?? []).map((x) => [x.id, x]));
  const attAdded = (b.attachments ?? []).filter((x) => !aAtt.has(x.id));
  const attRemoved = (a.attachments ?? []).filter((x) => !bAtt.has(x.id));
  const attChanged = (b.attachments ?? [])
    .filter((x) => aAtt.has(x.id))
    .map((x) => {
      const prev = aAtt.get(x.id)!;
      if (JSON.stringify(prev) !== JSON.stringify(x)) {
        return { id: x.id, de: prev, para: x };
      }
      return null;
    })
    .filter(Boolean);

  return {
    metaChanges,
    units: { added, removed, changed, orderChanged },
    attachments: { added: attAdded, removed: attRemoved, changed: attChanged },
  };
}
