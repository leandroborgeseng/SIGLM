import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { createReadStream, existsSync } from 'fs';
import type { AuthUser } from '../auth/auth.constants';
import { UPLOADS_ROOT } from '../common/uploads';
import { PrismaService } from '../prisma/prisma.service';
import { refreshSearchVector } from '../normative-acts/search.utils';

const execFileAsync = promisify(execFile);

const BACKUP_FORMAT = 'siglm-system-backup-v1';
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB

type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  createdBy: { id: string; email: string; nome: string };
  app: string;
  counts: Record<string, number>;
  includesUploads: boolean;
  note: string;
};

type BackupPayload = {
  permissions: unknown[];
  roles: unknown[];
  rolePermissions: unknown[];
  users: unknown[];
  originOrgs: unknown[];
  publicationMedia: unknown[];
  signatories: unknown[];
  normativeActs: unknown[];
  actOriginOrgs: unknown[];
  actSignatories: unknown[];
  normativeUnits: unknown[];
  normativeVersions: unknown[];
  normativeChanges: unknown[];
  legislativeEffects: unknown[];
  attachments: unknown[];
  imports: unknown[];
  ocrResults: unknown[];
  actPublicRevisions: unknown[];
  actInternalHistory: unknown[];
  archiveImportBatches: unknown[];
  archiveImportItems: unknown[];
  auditLogs: unknown[];
};

@Injectable()
export class SystemBackupService {
  private readonly logger = new Logger(SystemBackupService.name);

  constructor(private readonly prisma: PrismaService) {}

  assertSystemAdmin(user: AuthUser) {
    if (!user.permissions?.includes('users:manage')) {
      throw new ForbiddenException('Apenas administradores do sistema podem usar backup');
    }
    // Papel canônico do administrador geral (seed).
    if (user.role !== 'admin_geral') {
      throw new ForbiddenException(
        'Backup e restauração restritos ao perfil Administrador geral',
      );
    }
  }

  async createBackupArchive(user: AuthUser): Promise<{
    filePath: string;
    filename: string;
    cleanup: () => Promise<void>;
  }> {
    this.assertSystemAdmin(user);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'siglm-backup-'));
    const archivePath = path.join(os.tmpdir(), `siglm-backup-${stamp}.tar.gz`);

    try {
      const data = await this.exportData();
      const counts = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
      );

      const manifest: BackupManifest = {
        format: BACKUP_FORMAT,
        createdAt: new Date().toISOString(),
        createdBy: { id: user.id, email: user.email, nome: user.nome },
        app: 'SIGLM',
        counts,
        includesUploads: true,
        note:
          'Backup lógico do banco (JSON) + pasta uploads. Variáveis de ambiente (JWT, DATABASE_URL) não são incluídas.',
      };

      await fs.writeFile(
        path.join(staging, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
      await fs.writeFile(
        path.join(staging, 'data.json'),
        this.serialize(data),
        'utf8',
      );

      const uploadsDest = path.join(staging, 'uploads');
      if (existsSync(UPLOADS_ROOT)) {
        await this.copyDir(UPLOADS_ROOT, uploadsDest);
      } else {
        await fs.mkdir(uploadsDest, { recursive: true });
      }

      await execFileAsync('tar', ['-czf', archivePath, '-C', staging, '.']);

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          acao: 'system.backup.export',
          entidade: 'SystemBackup',
          entidadeId: stamp,
          diff: { counts, filename: path.basename(archivePath) },
        },
      });

      return {
        filePath: archivePath,
        filename: `siglm-backup-${stamp}.tar.gz`,
        cleanup: async () => {
          await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
          await fs.rm(archivePath, { force: true }).catch(() => undefined);
        },
      };
    } catch (err) {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  async restoreBackupArchive(user: AuthUser, file: Express.Multer.File) {
    this.assertSystemAdmin(user);

    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo de backup obrigatório');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Arquivo de backup excede o limite de 512 MB');
    }

    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'siglm-restore-'));
    const archivePath = path.join(staging, 'incoming.tar.gz');

    try {
      await fs.writeFile(archivePath, file.buffer);
      await execFileAsync('tar', ['-xzf', archivePath, '-C', staging]);

      const manifestRaw = await fs.readFile(path.join(staging, 'manifest.json'), 'utf8');
      const dataRaw = await fs.readFile(path.join(staging, 'data.json'), 'utf8');
      const manifest = JSON.parse(manifestRaw) as BackupManifest;
      if (manifest.format !== BACKUP_FORMAT) {
        throw new BadRequestException('Formato de backup não suportado');
      }
      const data = this.deserialize(dataRaw) as BackupPayload;

      await this.replaceDatabase(data);

      const uploadsSrc = path.join(staging, 'uploads');
      if (existsSync(uploadsSrc)) {
        await fs.mkdir(UPLOADS_ROOT, { recursive: true });
        // Substitui uploads pelo conteúdo do backup (mantém pasta raiz)
        const entries = await fs.readdir(UPLOADS_ROOT);
        for (const name of entries) {
          await fs.rm(path.join(UPLOADS_ROOT, name), { recursive: true, force: true });
        }
        await this.copyDir(uploadsSrc, UPLOADS_ROOT);
      }

      // Reindexa busca pública quando possível
      try {
        const acts = await this.prisma.normativeAct.findMany({ select: { id: true } });
        for (const act of acts) {
          await refreshSearchVector(this.prisma, act.id);
        }
      } catch (err) {
        this.logger.warn(`Falha ao refrescar search_vector após restore: ${String(err)}`);
      }

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          acao: 'system.backup.restore',
          entidade: 'SystemBackup',
          entidadeId: manifest.createdAt,
          diff: {
            sourceCreatedAt: manifest.createdAt,
            sourceCreatedBy: manifest.createdBy,
            counts: manifest.counts,
          },
        },
      });

      return {
        ok: true,
        message: 'Backup restaurado com sucesso. Faça login novamente se a sessão for inválida.',
        restoredFrom: manifest.createdAt,
        counts: manifest.counts,
      };
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  openReadStream(filePath: string) {
    return createReadStream(filePath);
  }

  private async exportData(): Promise<BackupPayload> {
    const [
      permissions,
      roles,
      rolePermissions,
      users,
      originOrgs,
      publicationMedia,
      signatories,
      normativeActs,
      actOriginOrgs,
      actSignatories,
      normativeUnits,
      normativeVersions,
      normativeChanges,
      legislativeEffects,
      attachments,
      imports,
      ocrResults,
      actPublicRevisions,
      actInternalHistory,
      archiveImportBatches,
      archiveImportItems,
      auditLogs,
    ] = await Promise.all([
      this.prisma.permission.findMany(),
      this.prisma.role.findMany(),
      this.prisma.rolePermission.findMany(),
      this.prisma.user.findMany(),
      this.prisma.originOrg.findMany(),
      this.prisma.publicationMedium.findMany(),
      this.prisma.signatory.findMany(),
      this.prisma.normativeAct.findMany({
        // searchVector (tsvector) não é serializável no client
        select: {
          id: true,
          tipo: true,
          numero: true,
          ano: true,
          dataAto: true,
          dataPublicacao: true,
          ementa: true,
          assunto: true,
          palavrasChave: true,
          situacao: true,
          orgaoOrigem: true,
          orgaoOrigemId: true,
          autoridadeSignataria: true,
          meioPublicacaoId: true,
          prefixoTituloModo: true,
          prefixoTitulo: true,
          atoConjunto: true,
          slug: true,
          observacoesInternas: true,
          statusPublicacao: true,
          etapaEditorial: true,
          editionOpen: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.actOriginOrg.findMany(),
      this.prisma.actSignatory.findMany(),
      this.prisma.normativeUnit.findMany(),
      this.prisma.normativeVersion.findMany(),
      this.prisma.normativeChange.findMany(),
      this.prisma.legislativeEffect.findMany(),
      this.prisma.attachment.findMany(),
      this.prisma.import.findMany(),
      this.prisma.ocrResult.findMany(),
      this.prisma.actPublicRevision.findMany(),
      this.prisma.actInternalHistory.findMany(),
      this.prisma.archiveImportBatch.findMany(),
      this.prisma.archiveImportItem.findMany(),
      this.prisma.auditLog.findMany(),
    ]);

    return {
      permissions,
      roles,
      rolePermissions,
      users,
      originOrgs,
      publicationMedia,
      signatories,
      normativeActs,
      actOriginOrgs,
      actSignatories,
      normativeUnits,
      normativeVersions,
      normativeChanges,
      legislativeEffects,
      attachments,
      imports,
      ocrResults,
      actPublicRevisions,
      actInternalHistory,
      archiveImportBatches,
      archiveImportItems,
      auditLogs,
    };
  }

  private async replaceDatabase(data: BackupPayload) {
    // Ordem: limpa filhos → pais; depois reinsere pais → filhos
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`
          TRUNCATE TABLE
            "archive_import_items",
            "archive_import_batches",
            "ocr_results",
            "imports",
            "attachments",
            "legislative_effects",
            "normative_changes",
            "normative_versions",
            "normative_units",
            "act_signatories",
            "act_origin_orgs",
            "act_public_revisions",
            "act_internal_history",
            "normative_acts",
            "signatories",
            "publication_mediums",
            "origin_orgs",
            "audit_logs",
            "role_permissions",
            "users",
            "roles",
            "permissions"
          RESTART IDENTITY CASCADE
        `);

        if (data.permissions?.length) {
          await tx.permission.createMany({ data: data.permissions as Prisma.PermissionCreateManyInput[] });
        }
        if (data.roles?.length) {
          await tx.role.createMany({ data: data.roles as Prisma.RoleCreateManyInput[] });
        }
        if (data.rolePermissions?.length) {
          await tx.rolePermission.createMany({
            data: data.rolePermissions as Prisma.RolePermissionCreateManyInput[],
          });
        }
        if (data.users?.length) {
          await tx.user.createMany({ data: data.users as Prisma.UserCreateManyInput[] });
        }
        if (data.originOrgs?.length) {
          await tx.originOrg.createMany({ data: data.originOrgs as Prisma.OriginOrgCreateManyInput[] });
        }
        if (data.publicationMedia?.length) {
          await tx.publicationMedium.createMany({
            data: data.publicationMedia as Prisma.PublicationMediumCreateManyInput[],
          });
        }
        if (data.signatories?.length) {
          await tx.signatory.createMany({
            data: data.signatories as Prisma.SignatoryCreateManyInput[],
          });
        }
        if (data.normativeActs?.length) {
          await tx.normativeAct.createMany({
            data: data.normativeActs as Prisma.NormativeActCreateManyInput[],
          });
        }
        if (data.actOriginOrgs?.length) {
          await tx.actOriginOrg.createMany({
            data: data.actOriginOrgs as Prisma.ActOriginOrgCreateManyInput[],
          });
        }
        if (data.actSignatories?.length) {
          await tx.actSignatory.createMany({
            data: data.actSignatories as Prisma.ActSignatoryCreateManyInput[],
          });
        }
        if (data.normativeUnits?.length) {
          await tx.normativeUnit.createMany({
            data: data.normativeUnits as Prisma.NormativeUnitCreateManyInput[],
          });
        }
        if (data.normativeVersions?.length) {
          await tx.normativeVersion.createMany({
            data: data.normativeVersions as Prisma.NormativeVersionCreateManyInput[],
          });
        }
        if (data.normativeChanges?.length) {
          await tx.normativeChange.createMany({
            data: data.normativeChanges as Prisma.NormativeChangeCreateManyInput[],
          });
        }
        if (data.legislativeEffects?.length) {
          await tx.legislativeEffect.createMany({
            data: data.legislativeEffects as Prisma.LegislativeEffectCreateManyInput[],
          });
        }
        if (data.attachments?.length) {
          await tx.attachment.createMany({
            data: data.attachments as Prisma.AttachmentCreateManyInput[],
          });
        }
        if (data.imports?.length) {
          await tx.import.createMany({ data: data.imports as Prisma.ImportCreateManyInput[] });
        }
        if (data.ocrResults?.length) {
          await tx.ocrResult.createMany({
            data: data.ocrResults as Prisma.OcrResultCreateManyInput[],
          });
        }
        if (data.actPublicRevisions?.length) {
          await tx.actPublicRevision.createMany({
            data: data.actPublicRevisions as Prisma.ActPublicRevisionCreateManyInput[],
          });
        }
        if (data.actInternalHistory?.length) {
          await tx.actInternalHistory.createMany({
            data: data.actInternalHistory as Prisma.ActInternalHistoryCreateManyInput[],
          });
        }
        if (data.archiveImportBatches?.length) {
          await tx.archiveImportBatch.createMany({
            data: data.archiveImportBatches as Prisma.ArchiveImportBatchCreateManyInput[],
          });
        }
        if (data.archiveImportItems?.length) {
          await tx.archiveImportItem.createMany({
            data: data.archiveImportItems as Prisma.ArchiveImportItemCreateManyInput[],
          });
        }
        if (data.auditLogs?.length) {
          await tx.auditLog.createMany({
            data: data.auditLogs as Prisma.AuditLogCreateManyInput[],
          });
        }
      },
      { timeout: 600_000, maxWait: 60_000 },
    );
  }

  private serialize(value: unknown): string {
    return JSON.stringify(
      value,
      (_key, v) => {
        if (v instanceof Date) return { __type: 'Date', value: v.toISOString() };
        if (typeof v === 'bigint') return { __type: 'BigInt', value: v.toString() };
        return v;
      },
      2,
    );
  }

  private deserialize(raw: string): unknown {
    return JSON.parse(raw, (_key, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v) && v.__type === 'Date') {
        return new Date(v.value);
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && v.__type === 'BigInt') {
        return BigInt(v.value);
      }
      return v;
    });
  }

  private async copyDir(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const from = path.join(src, entry.name);
      const to = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(from, to);
      } else if (entry.isFile()) {
        await fs.copyFile(from, to);
      }
    }
  }
}
