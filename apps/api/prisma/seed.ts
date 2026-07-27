import {
  ActSituacao,
  ActType,
  ChangeType,
  PrismaClient,
  PublicationStatus,
  UnitStatus,
  UnitType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { ATTACHMENTS_DIR } from '../src/common/uploads';

const prisma = new PrismaClient();

const PERMISSIONS = [
  'acts:read',
  'acts:write',
  'acts:publish',
  'acts:consolidate',
  'imports:manage',
  'ocr:review',
  'users:manage',
  'audit:read',
  'acts:version',
  'acts:history',
  'orgs:all',
] as const;

const ROLES: Record<string, { descricao: string; permissions: string[] }> = {
  admin_geral: {
    descricao: 'Administrador geral do LeisMunicipais',
    permissions: [...PERMISSIONS],
  },
  editor: {
    descricao: 'Editor legislativo',
    permissions: [
      'acts:read',
      'acts:write',
      'acts:version',
      'acts:history',
      'imports:manage',
      'ocr:review',
    ],
  },
  revisor: {
    descricao: 'Revisor de textos normativos',
    permissions: ['acts:read', 'acts:write', 'acts:version', 'acts:history'],
  },
  publicador: {
    descricao: 'Publicador no portal',
    permissions: ['acts:read', 'acts:publish', 'acts:history'],
  },
  consulta: {
    descricao: 'Consulta administrativa (sem edição)',
    permissions: ['acts:read', 'audit:read', 'acts:history'],
  },
};

async function seedRolesAndUsers() {
  const permissionRecords = await Promise.all(
    PERMISSIONS.map((chave) =>
      prisma.permission.upsert({
        where: { chave },
        update: {},
        create: { chave },
      }),
    ),
  );
  const permissionByKey = Object.fromEntries(permissionRecords.map((p) => [p.chave, p]));

  for (const [nome, config] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { nome },
      update: { descricao: config.descricao },
      create: { nome, descricao: config.descricao },
    });

    for (const chave of config.permissions) {
      const permission = permissionByKey[chave];
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { nome: 'admin_geral' } });
  const hashSenha = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@franca.sp.gov.br' },
    update: {},
    create: {
      nome: 'Administrador LeisMunicipais',
      email: 'admin@franca.sp.gov.br',
      hashSenha,
      roleId: adminRole.id,
      roleLinks: {
        create: { roleId: adminRole.id, isPrimary: true },
      },
    },
  });

  return prisma.user.findUniqueOrThrow({ where: { email: 'admin@franca.sp.gov.br' } });
}

async function seedOriginOrgs() {
  const nomes = ['Câmara Municipal de Franca', 'Prefeitura Municipal de Franca'];
  const byName: Record<string, string> = {};
  for (const nome of nomes) {
    const org = await prisma.originOrg.upsert({
      where: { nome },
      update: { ativo: true },
      create: { nome, ativo: true },
    });
    byName[nome] = org.id;
  }
  return byName;
}

async function seedNormativeActs(adminId: string, organs: Record<string, string>) {
  // Limpa dados normativos para re-seed idempotente em dev
  await prisma.normativeChange.deleteMany();
  await prisma.normativeVersion.deleteMany();
  await prisma.normativeUnit.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.import.deleteMany();
  await prisma.normativeAct.deleteMany();

  const lc312 = await prisma.normativeAct.create({
    data: {
      tipo: ActType.lei_complementar,
      numero: 312,
      ano: 2024,
      dataAto: new Date('2024-03-15'),
      dataPublicacao: new Date('2024-03-18'),
      ementa:
        'Institui o Código Tributário do Município de Franca, dispõe sobre o sistema tributário municipal e dá outras providências.',
      assunto: 'Tributação municipal',
      palavrasChave: ['tributação', 'ISS', 'IPTU', 'código tributário', 'franca'],
      situacao: ActSituacao.consolidado,
      orgaoOrigem: 'Câmara Municipal de Franca',
      orgaoOrigemId: organs['Câmara Municipal de Franca'],
      autoridadeSignataria: 'Prefeito Municipal',
      slug: 'lei-complementar/2024/312',
      statusPublicacao: PublicationStatus.publicado,
    },
  });

  const unitsLc312 = await createLc312Units(lc312.id);

  const lei4987 = await prisma.normativeAct.create({
    data: {
      tipo: ActType.lei,
      numero: 4987,
      ano: 2026,
      dataAto: new Date('2026-01-20'),
      dataPublicacao: new Date('2026-01-22'),
      ementa:
        'Altera a redação do art. 3º e acrescenta o art. 5º à Lei Complementar nº 312, de 15 de março de 2024.',
      assunto: 'Alteração legislativa — Código Tributário',
      palavrasChave: ['alteração', 'ISS', 'código tributário'],
      situacao: ActSituacao.vigente,
      orgaoOrigem: 'Câmara Municipal de Franca',
      orgaoOrigemId: organs['Câmara Municipal de Franca'],
      autoridadeSignataria: 'Prefeito Municipal',
      slug: 'lei/2026/4987',
      statusPublicacao: PublicationStatus.publicado,
    },
  });

  const decreto12450 = await prisma.normativeAct.create({
    data: {
      tipo: ActType.decreto,
      numero: 12450,
      ano: 2026,
      dataAto: new Date('2026-02-10'),
      dataPublicacao: new Date('2026-02-11'),
      ementa:
        'Regulamenta disposições do Código Tributário Municipal e revoga o art. 4º da Lei Complementar nº 312/2024.',
      assunto: 'Regulamentação tributária',
      palavrasChave: ['decreto', 'regulamentação', 'revogação'],
      situacao: ActSituacao.vigente,
      orgaoOrigem: 'Prefeitura Municipal de Franca',
      orgaoOrigemId: organs['Prefeitura Municipal de Franca'],
      autoridadeSignataria: 'Prefeito Municipal',
      slug: 'decreto/2026/12450',
      statusPublicacao: PublicationStatus.publicado,
    },
  });

  const art3 = unitsLc312.art3;
  const art4 = unitsLc312.art4;
  const textoAnteriorArt3 = art3.texto;

  const textoNovoArt3 =
    'Fica instituído o Imposto Sobre Serviços de Qualquer Natureza — ISS, com alíquotas mínimas de 2% (dois por cento) e máximas de 5% (cinco por cento), conforme lista de serviços anexa, observada a progressividade para atividades de impacto ambiental.';

  await prisma.normativeUnit.update({
    where: { id: art3.id },
    data: {
      texto: textoNovoArt3,
      status: UnitStatus.alterada,
      alteradoPorActId: lei4987.id,
      dataAlteracao: new Date('2026-01-20'),
    },
  });

  await prisma.normativeVersion.createMany({
    data: [
      {
        unitId: art3.id,
        texto: textoAnteriorArt3,
        validoDe: new Date('2024-03-15'),
        validoAte: new Date('2026-01-19'),
        origemActId: lc312.id,
      },
      {
        unitId: art3.id,
        texto: textoNovoArt3,
        validoDe: new Date('2026-01-20'),
        origemActId: lei4987.id,
      },
    ],
  });

  await prisma.normativeChange.create({
    data: {
      normaAlteradoraActId: lei4987.id,
      normaAlteradaActId: lc312.id,
      unitId: art3.id,
      tipoAlteracao: ChangeType.alteracao_redacao,
      textoAnterior: textoAnteriorArt3,
      textoNovo: textoNovoArt3,
      notaGerada: 'Redação dada pela Lei nº 4.987/2026',
      fundamento: 'Art. 1º da Lei nº 4.987/2026',
      data: new Date('2026-01-20'),
      autorId: adminId,
    },
  });

  await prisma.normativeUnit.update({
    where: { id: art4.id },
    data: {
      status: UnitStatus.revogada,
      alteradoPorActId: decreto12450.id,
      dataAlteracao: new Date('2026-02-10'),
    },
  });

  await prisma.normativeVersion.create({
    data: {
      unitId: art4.id,
      texto: art4.texto,
      validoDe: new Date('2024-03-15'),
      validoAte: new Date('2026-02-09'),
      origemActId: lc312.id,
    },
  });

  await prisma.normativeChange.create({
    data: {
      normaAlteradoraActId: decreto12450.id,
      normaAlteradaActId: lc312.id,
      unitId: art4.id,
      tipoAlteracao: ChangeType.revogacao_parcial,
      textoAnterior: art4.texto,
      notaGerada: 'Revogado pelo Decreto nº 12.450/2026',
      fundamento: 'Art. 2º do Decreto nº 12.450/2026',
      data: new Date('2026-02-10'),
      autorId: adminId,
    },
  });

  const art5 = await prisma.normativeUnit.create({
    data: {
      actId: lc312.id,
      tipoUnidade: UnitType.artigo,
      identificacao: 'Art. 5º',
      texto:
        'O Município poderá conceder incentivos fiscais a empresas que comprovarem investimento em tecnologia verde e geração de empregos, nos termos de regulamento específico.',
      ordem: 7,
      status: UnitStatus.incluida,
      origemActId: lc312.id,
      alteradoPorActId: lei4987.id,
      dataAlteracao: new Date('2026-01-20'),
    },
  });

  await prisma.normativeVersion.create({
    data: {
      unitId: art5.id,
      texto: art5.texto,
      validoDe: new Date('2026-01-20'),
      origemActId: lei4987.id,
    },
  });

  await prisma.normativeChange.create({
    data: {
      normaAlteradoraActId: lei4987.id,
      normaAlteradaActId: lc312.id,
      unitId: art5.id,
      tipoAlteracao: ChangeType.inclusao,
      textoNovo: art5.texto,
      notaGerada: 'Incluído pela Lei nº 4.987/2026',
      fundamento: 'Art. 2º da Lei nº 4.987/2026',
      data: new Date('2026-01-20'),
      autorId: adminId,
    },
  });

  await prisma.attachment.create({
    data: {
      actId: lc312.id,
      tipo: 'pdf_original',
      url: 'attachments/lc-312-2024-diario-oficial.pdf',
      nome: 'LC 312-2024 — publicação original (Diário Oficial)',
      tamanho: 245760,
      hash: 'sha256:exemplo-lc312-original',
    },
  });

  await createSampleDiarioPdf(
    path.join(ATTACHMENTS_DIR, 'lc-312-2024-diario-oficial.pdf'),
    'Lei Complementar nº 312/2024',
    'Publicação original no Diário Oficial do Município de Franca — documento de referência.',
  );

  await prisma.normativeAct.update({
    where: { id: lc312.id },
    data: { situacao: ActSituacao.parcialmente_revogado },
  });

  return { lc312, lei4987, decreto12450 };
}

async function createLc312Units(actId: string) {
  const preamble = await prisma.normativeUnit.create({
    data: {
      actId,
      tipoUnidade: UnitType.preambulo,
      identificacao: null,
      texto:
        'Faço saber que a Câmara Municipal de Franca aprovou e eu sanciono a seguinte Lei Complementar:',
      ordem: 0,
      status: UnitStatus.vigente,
      origemActId: actId,
    },
  });

  const ementa = await prisma.normativeUnit.create({
    data: {
      actId,
      tipoUnidade: UnitType.ementa,
      identificacao: null,
      texto:
        'Institui o Código Tributário do Município de Franca, dispõe sobre o sistema tributário municipal e dá outras providências.',
      ordem: 1,
      status: UnitStatus.vigente,
      origemActId: actId,
    },
  });

  const titulo = await prisma.normativeUnit.create({
    data: {
      actId,
      tipoUnidade: UnitType.titulo,
      identificacao: 'TÍTULO I',
      texto: 'DO SISTEMA TRIBUTÁRIO MUNICIPAL',
      ordem: 2,
      status: UnitStatus.vigente,
      origemActId: actId,
    },
  });

  const art1 = await prisma.normativeUnit.create({
    data: {
      actId,
      tipoUnidade: UnitType.artigo,
      identificacao: 'Art. 1º',
      texto:
        'Fica instituído o Código Tributário do Município de Franca, que regula os tributos de competência municipal, os contribuintes, os fatos geradores e os procedimentos de lançamento, fiscalização e cobrança.',
      ordem: 3,
      status: UnitStatus.vigente,
      origemActId: actId,
    },
  });

  const art2 = await prisma.normativeUnit.create({
    data: {
      actId,
      tipoUnidade: UnitType.artigo,
      identificacao: 'Art. 2º',
      texto:
        'Integram o sistema tributário municipal os impostos, as taxas e as contribuições de melhoria, na forma desta Lei Complementar e da legislação federal aplicável.',
      ordem: 4,
      status: UnitStatus.vigente,
      origemActId: actId,
    },
  });

  const art3 = await prisma.normativeUnit.create({
    data: {
      actId,
      tipoUnidade: UnitType.artigo,
      identificacao: 'Art. 3º',
      texto:
        'Fica instituído o Imposto Sobre Serviços de Qualquer Natureza — ISS, com alíquotas mínimas de 2% (dois por cento) e máximas de 5% (cinco por cento), conforme lista de serviços anexa.',
      ordem: 5,
      status: UnitStatus.vigente,
      origemActId: actId,
    },
  });

  const art4 = await prisma.normativeUnit.create({
    data: {
      actId,
      tipoUnidade: UnitType.artigo,
      identificacao: 'Art. 4º',
      texto:
        'O Imposto sobre a Propriedade Predial e Territorial Urbana — IPTU será cobrado anualmente, com vencimento em parcela única ou em até dez parcelas mensais, conforme calendário fixado pelo Poder Executivo.',
      ordem: 6,
      status: UnitStatus.vigente,
      origemActId: actId,
    },
  });

  // Versões originais dos dispositivos iniciais
  for (const unit of [preamble, ementa, titulo, art1, art2, art3, art4]) {
    await prisma.normativeVersion.create({
      data: {
        unitId: unit.id,
        texto: unit.texto,
        validoDe: new Date('2024-03-15'),
        origemActId: actId,
      },
    });
  }

  return { preamble, ementa, titulo, art1, art2, art3, art4 };
}

async function seedSearchVectors() {
  await prisma.$executeRawUnsafe(`
    UPDATE normative_acts na
    SET search_vector = (
      setweight(to_tsvector('portuguese', coalesce(na.ementa, '')), 'A') ||
      setweight(to_tsvector('portuguese', coalesce(na.assunto, '')), 'B') ||
      setweight(to_tsvector('portuguese', coalesce(array_to_string(na.palavras_chave, ' '), '')), 'C') ||
      setweight(to_tsvector('portuguese', coalesce((
        SELECT string_agg(nu.texto, ' ')
        FROM normative_units nu
        WHERE nu.act_id = na.id
      ), '')), 'D') ||
      setweight(
        to_tsvector('portuguese', coalesce(na.texto_identificado_importacao, '')),
        CASE
          WHEN EXISTS (
            SELECT 1 FROM normative_units nu
            WHERE nu.act_id = na.id AND length(trim(nu.texto)) > 0
          ) THEN 'C'
          ELSE 'D'
        END
      )
    );
  `);
}

async function createSampleDiarioPdf(filePath: string, title: string, subtitle: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72 });
    const stream = doc.pipe(require('fs').createWriteStream(filePath));
    doc.fontSize(16).text('Diário Oficial — Prefeitura de Franca/SP', { align: 'center' });
    doc.moveDown();
    doc.fontSize(13).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(subtitle, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(10).text(
      'Documento de demonstração gerado pelo seed do LeisMunicipais. Em produção, este arquivo seria o PDF autêntico publicado no Diário Oficial.',
      { align: 'justify' },
    );
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function main() {
  console.log('🌱 Seed LeisMunicipais...');

  const admin = await seedRolesAndUsers();
  const organs = await seedOriginOrgs();
  const acts = await seedNormativeActs(admin.id, organs);
  await seedSearchVectors();

  console.log('✅ Seed concluído:');
  console.log(`   • LC 312/2024 — ${acts.lc312.slug}`);
  console.log(`   • Lei 4.987/2026 — ${acts.lei4987.slug}`);
  console.log(`   • Decreto 12.450/2026 — ${acts.decreto12450.slug}`);
  console.log('   • Admin: admin@franca.sp.gov.br / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
