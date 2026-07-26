import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import type { S3BackupConfig } from '@prisma/client';
import { CronJob } from 'cron';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { AuthUser } from '../auth/auth.constants';
import { decryptSecret, encryptSecret } from '../common/secret-crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateS3BackupConfigDto } from './s3-backup.dto';
import { SystemBackupService } from './system-backup.service';

const CONFIG_ID = 'default';
const CRON_JOB_NAME = 'siglm-s3-backup';

export type S3BackupTier = 'daily' | 'weekly' | 'monthly';

export type S3BackupPublicConfig = {
  enabled: boolean;
  configured: boolean;
  hasSecret: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  cron: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  running: boolean;
  lastRun: {
    at: string;
    ok: boolean;
    error?: string;
    uploaded?: { tier: S3BackupTier; key: string }[];
    pruned?: { tier: S3BackupTier; deleted: number }[];
    triggeredBy: 'cron' | 'manual';
  } | null;
};

type RuntimeConfig = {
  enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
};

@Injectable()
export class S3BackupService implements OnModuleInit {
  private readonly logger = new Logger(S3BackupService.name);
  private client: S3Client | null = null;
  private clientFingerprint = '';
  private running = false;
  private lastRun: S3BackupPublicConfig['lastRun'] = null;
  private cachedRow: S3BackupConfig | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemBackup: SystemBackupService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    await this.ensureRow();
    await this.maybeImportFromEnv();
    await this.refreshCache();
    this.rescheduleCron();
    const cfg = this.cachedRow;
    if (cfg?.enabled && this.isRowConfigured(cfg)) {
      this.logger.log(
        `Backup S3 ativo → s3://${cfg.bucket}/${cfg.prefix} às ${String(cfg.hour).padStart(2, '0')}:00 (${cfg.timezone})`,
      );
    } else {
      this.logger.log(
        'Backup S3: configure em Administração → Backup (interface). Desabilitado por padrão.',
      );
    }
  }

  async getPublicConfig(): Promise<S3BackupPublicConfig> {
    await this.refreshCache();
    const row = this.cachedRow!;
    return {
      enabled: row.enabled,
      configured: this.isRowConfigured(row),
      hasSecret: Boolean(row.secretAccessKeyEnc),
      bucket: row.bucket,
      region: row.region,
      accessKeyId: row.accessKeyId,
      endpoint: row.endpoint,
      forcePathStyle: row.forcePathStyle,
      prefix: row.prefix,
      hour: row.hour,
      timezone: row.timezone,
      cron: this.cronFromHour(row.hour),
      keepDaily: row.keepDaily,
      keepWeekly: row.keepWeekly,
      keepMonthly: row.keepMonthly,
      running: this.running,
      lastRun: this.lastRun,
    };
  }

  async updateConfig(user: AuthUser, dto: UpdateS3BackupConfigDto) {
    this.systemBackup.assertSystemAdmin(user);
    await this.ensureRow();

    const bucket = dto.bucket.trim();
    const region = dto.region.trim();
    const accessKeyId = dto.accessKeyId.trim();
    const prefix = (dto.prefix.trim() || 'siglm/backups').replace(/^\/+|\/+$/g, '');
    const timezone = dto.timezone.trim() || 'America/Sao_Paulo';
    const endpoint = dto.endpoint?.trim() ? dto.endpoint.trim() : null;
    const secretIncoming = dto.secretAccessKey?.trim() ?? '';

    const current = await this.prisma.s3BackupConfig.findUniqueOrThrow({
      where: { id: CONFIG_ID },
    });

    let secretAccessKeyEnc = current.secretAccessKeyEnc;
    if (secretIncoming) {
      secretAccessKeyEnc = encryptSecret(secretIncoming);
    }

    if (dto.enabled) {
      if (!bucket || !region || !accessKeyId) {
        throw new BadRequestException(
          'Para ativar, preencha bucket, região e chave de acesso.',
        );
      }
      if (!secretAccessKeyEnc) {
        throw new BadRequestException(
          'Para ativar, informe a chave secreta (Secret Access Key).',
        );
      }
      try {
        this.assertValidTimezone(timezone);
      } catch {
        throw new BadRequestException(`Fuso horário inválido: ${timezone}`);
      }
    }

    const row = await this.prisma.s3BackupConfig.update({
      where: { id: CONFIG_ID },
      data: {
        enabled: dto.enabled,
        bucket,
        region,
        accessKeyId,
        secretAccessKeyEnc,
        endpoint,
        forcePathStyle: dto.forcePathStyle ?? true,
        prefix,
        hour: dto.hour,
        timezone,
        keepDaily: dto.keepDaily,
        keepWeekly: dto.keepWeekly,
        keepMonthly: dto.keepMonthly,
      },
    });

    this.cachedRow = row;
    this.client = null;
    this.clientFingerprint = '';
    this.rescheduleCron();

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        acao: 'system.backup.s3.config',
        entidade: 'S3BackupConfig',
        entidadeId: CONFIG_ID,
        diff: {
          enabled: row.enabled,
          bucket: row.bucket,
          region: row.region,
          prefix: row.prefix,
          hour: row.hour,
          timezone: row.timezone,
          keepDaily: row.keepDaily,
          keepWeekly: row.keepWeekly,
          keepMonthly: row.keepMonthly,
          secretUpdated: Boolean(secretIncoming),
        },
      },
    });

    return this.getPublicConfig();
  }

  async runNow(user: AuthUser) {
    this.systemBackup.assertSystemAdmin(user);
    await this.refreshCache();
    const runtime = this.toRuntime(this.cachedRow!);
    if (!runtime.enabled) {
      throw new BadRequestException(
        'Backup S3 desabilitado. Ative e salve na interface de Administração.',
      );
    }
    if (!this.isRuntimeConfigured(runtime)) {
      throw new BadRequestException(
        'Backup S3 incompleto. Preencha bucket, região e chaves na interface.',
      );
    }
    return this.executeBackup('manual', runtime);
  }

  /** Callback do cron dinâmico. */
  async handleCron() {
    await this.refreshCache();
    const runtime = this.toRuntime(this.cachedRow!);
    if (!runtime.enabled || !this.isRuntimeConfigured(runtime)) return;
    try {
      await this.executeBackup('cron', runtime);
    } catch (err) {
      this.logger.error(
        `Falha no backup S3 agendado: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async executeBackup(triggeredBy: 'cron' | 'manual', runtime: RuntimeConfig) {
    if (this.running) {
      throw new BadRequestException('Já existe um backup S3 em andamento');
    }
    this.running = true;
    const uploaded: { tier: S3BackupTier; key: string }[] = [];
    const pruned: { tier: S3BackupTier; deleted: number }[] = [];

    let cleanup: (() => Promise<void>) | undefined;
    try {
      const client = this.ensureClient(runtime);
      const { filePath, filename, cleanup: clean } =
        await this.systemBackup.createBackupArchive('system');
      cleanup = clean;

      const fileStat = await stat(filePath);
      const tiers = this.tiersForToday(runtime.timezone);

      for (const tier of tiers) {
        const key = `${runtime.prefix}/${tier}/${filename}`;
        await client.send(
          new PutObjectCommand({
            Bucket: runtime.bucket,
            Key: key,
            Body: createReadStream(filePath),
            ContentType: 'application/gzip',
            ContentLength: fileStat.size,
            Metadata: {
              'siglm-tier': tier,
              'siglm-triggered': triggeredBy,
            },
          }),
        );
        uploaded.push({ tier, key });
        this.logger.log(
          `Backup enviado: s3://${runtime.bucket}/${key} (${fileStat.size} bytes)`,
        );
      }

      for (const tier of ['daily', 'weekly', 'monthly'] as S3BackupTier[]) {
        const keep =
          tier === 'daily'
            ? runtime.keepDaily
            : tier === 'weekly'
              ? runtime.keepWeekly
              : runtime.keepMonthly;
        const deleted = await this.pruneTier(
          client,
          runtime.bucket,
          runtime.prefix,
          tier,
          keep,
        );
        pruned.push({ tier, deleted });
      }

      this.lastRun = {
        at: new Date().toISOString(),
        ok: true,
        uploaded,
        pruned,
        triggeredBy,
      };
      return this.lastRun;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastRun = {
        at: new Date().toISOString(),
        ok: false,
        error: message,
        uploaded,
        pruned,
        triggeredBy,
      };
      throw err;
    } finally {
      this.running = false;
      if (cleanup) await cleanup().catch(() => undefined);
    }
  }

  private tiersForToday(timezone: string): S3BackupTier[] {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const day = Number(parts.find((p) => p.type === 'day')?.value ?? '0');

    const tiers: S3BackupTier[] = ['daily'];
    if (weekday === 'Sun') tiers.push('weekly');
    if (day === 1) tiers.push('monthly');
    return tiers;
  }

  private async pruneTier(
    client: S3Client,
    bucket: string,
    prefixRoot: string,
    tier: S3BackupTier,
    keep: number,
  ): Promise<number> {
    if (keep < 1) return 0;
    const prefix = `${prefixRoot}/${tier}/`;
    const objects = await this.listAll(client, bucket, prefix);
    objects.sort((a, b) => {
      const ta = a.LastModified?.getTime() ?? 0;
      const tb = b.LastModified?.getTime() ?? 0;
      return tb - ta;
    });
    const toDelete = objects.slice(keep).filter((o) => o.Key);
    if (!toDelete.length) return 0;

    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 1000) {
      const chunk = toDelete.slice(i, i + 1000);
      const res = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((o) => ({ Key: o.Key! })),
            Quiet: true,
          },
        }),
      );
      deleted += chunk.length - (res.Errors?.length ?? 0);
      if (res.Errors?.length) {
        this.logger.warn(
          `Falha ao apagar ${res.Errors.length} objeto(s) em ${prefix}: ${res.Errors[0]?.Message}`,
        );
      }
    }
    if (deleted > 0) {
      this.logger.log(`Retenção ${tier}: removidos ${deleted} backup(s) antigos (keep=${keep})`);
    }
    return deleted;
  }

  private async listAll(
    client: S3Client,
    bucket: string,
    prefix: string,
  ): Promise<_Object[]> {
    const out: _Object[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      if (res.Contents?.length) out.push(...res.Contents);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out.filter((o) => o.Key && !o.Key.endsWith('/'));
  }

  private ensureClient(runtime: RuntimeConfig): S3Client {
    const fp = [
      runtime.region,
      runtime.accessKeyId,
      runtime.secretAccessKey,
      runtime.endpoint ?? '',
      String(runtime.forcePathStyle),
    ].join('|');
    if (!this.client || this.clientFingerprint !== fp) {
      this.client = new S3Client({
        region: runtime.region,
        credentials: {
          accessKeyId: runtime.accessKeyId,
          secretAccessKey: runtime.secretAccessKey,
        },
        ...(runtime.endpoint
          ? { endpoint: runtime.endpoint, forcePathStyle: runtime.forcePathStyle }
          : {}),
      });
      this.clientFingerprint = fp;
    }
    return this.client;
  }

  private rescheduleCron() {
    const row = this.cachedRow;
    try {
      this.schedulerRegistry.deleteCronJob(CRON_JOB_NAME);
    } catch {
      // job ainda não existia
    }

    if (!row?.enabled || !this.isRowConfigured(row)) {
      this.logger.log('Agendamento S3 parado (desabilitado ou incompleto)');
      return;
    }

    try {
      this.assertValidTimezone(row.timezone);
    } catch {
      this.logger.warn(`Fuso inválido (${row.timezone}); agendamento não iniciado`);
      return;
    }

    const cronTime = this.cronFromHour(row.hour);
    const job = CronJob.from({
      cronTime,
      onTick: () => {
        void this.handleCron();
      },
      start: false,
      timeZone: row.timezone,
    });
    this.schedulerRegistry.addCronJob(CRON_JOB_NAME, job);
    job.start();
    this.logger.log(`Agendamento S3: ${cronTime} (${row.timezone})`);
  }

  private cronFromHour(hour: number) {
    const h = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : 3;
    return `0 ${h} * * *`;
  }

  private assertValidTimezone(tz: string) {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
  }

  private async ensureRow() {
    await this.prisma.s3BackupConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, updatedAt: new Date() },
      update: {},
    });
  }

  private async refreshCache() {
    this.cachedRow = await this.prisma.s3BackupConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    if (!this.cachedRow) {
      await this.ensureRow();
      this.cachedRow = await this.prisma.s3BackupConfig.findUniqueOrThrow({
        where: { id: CONFIG_ID },
      });
    }
  }

  /** Migração única: se a UI ainda estiver vazia e o env antigo estiver preenchido. */
  private async maybeImportFromEnv() {
    const row = await this.prisma.s3BackupConfig.findUnique({ where: { id: CONFIG_ID } });
    if (!row || row.bucket || row.accessKeyId || row.secretAccessKeyEnc) return;

    const bucket = process.env.S3_BACKUP_BUCKET?.trim();
    const region = process.env.S3_BACKUP_REGION?.trim();
    const accessKeyId = process.env.S3_BACKUP_ACCESS_KEY_ID?.trim();
    const secret = process.env.S3_BACKUP_SECRET_ACCESS_KEY?.trim();
    if (!bucket || !region || !accessKeyId || !secret) return;

    // Parse cron "m h ..." → hour
    const parts = (process.env.S3_BACKUP_CRON?.trim() || '0 3 * * *').split(/\s+/);
    const hour = Number(parts[1] ?? 3);

    await this.prisma.s3BackupConfig.update({
      where: { id: CONFIG_ID },
      data: {
        enabled: (process.env.S3_BACKUP_ENABLED ?? '').toLowerCase() === 'true',
        bucket,
        region,
        accessKeyId,
        secretAccessKeyEnc: encryptSecret(secret),
        endpoint: process.env.S3_BACKUP_ENDPOINT?.trim() || null,
        forcePathStyle:
          (process.env.S3_BACKUP_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
        prefix: (process.env.S3_BACKUP_PREFIX?.trim() || 'siglm/backups').replace(
          /^\/+|\/+$/g,
          '',
        ),
        hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 3,
        timezone: process.env.S3_BACKUP_TZ?.trim() || 'America/Sao_Paulo',
        keepDaily: Number(process.env.S3_BACKUP_KEEP_DAILY ?? 7) || 7,
        keepWeekly: Number(process.env.S3_BACKUP_KEEP_WEEKLY ?? 5) || 5,
        keepMonthly: Number(process.env.S3_BACKUP_KEEP_MONTHLY ?? 12) || 12,
      },
    });
    this.logger.log('Config S3 importada das variáveis de ambiente (única vez)');
  }

  private isRowConfigured(row: S3BackupConfig) {
    return Boolean(
      row.bucket?.trim() &&
        row.region?.trim() &&
        row.accessKeyId?.trim() &&
        row.secretAccessKeyEnc,
    );
  }

  private isRuntimeConfigured(runtime: RuntimeConfig) {
    return Boolean(
      runtime.bucket &&
        runtime.region &&
        runtime.accessKeyId &&
        runtime.secretAccessKey,
    );
  }

  private toRuntime(row: S3BackupConfig): RuntimeConfig {
    let secretAccessKey = '';
    if (row.secretAccessKeyEnc) {
      try {
        secretAccessKey = decryptSecret(row.secretAccessKeyEnc);
      } catch (err) {
        this.logger.error(
          `Não foi possível descriptografar a chave S3 (JWT_SECRET mudou?): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return {
      enabled: row.enabled,
      bucket: row.bucket.trim(),
      region: row.region.trim(),
      accessKeyId: row.accessKeyId.trim(),
      secretAccessKey,
      endpoint: row.endpoint?.trim() || null,
      forcePathStyle: row.forcePathStyle,
      prefix: (row.prefix.trim() || 'siglm/backups').replace(/^\/+|\/+$/g, ''),
      hour: row.hour,
      timezone: row.timezone.trim() || 'America/Sao_Paulo',
      keepDaily: row.keepDaily,
      keepWeekly: row.keepWeekly,
      keepMonthly: row.keepMonthly,
    };
  }
}
