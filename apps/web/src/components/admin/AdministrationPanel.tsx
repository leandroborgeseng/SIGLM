'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, Download, Upload } from 'lucide-react';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  createOrgan,
  createPublicationMedium,
  createSignatory,
  createUser,
  downloadSystemBackup,
  getS3BackupStatus,
  listOrgans,
  listPermissions,
  listPublicationMedia,
  listRoles,
  listSignatories,
  listUsers,
  repairOriginalAttachments,
  restoreSystemBackup,
  runS3BackupNow,
  saveS3BackupConfig,
  updateOrgan,
  updatePublicationMedium,
  updateSignatory,
  updateUser,
  type AdminRole,
  type AdminSignatory,
  type AdminUser,
  type OriginOrg,
  type PublicationMedium,
  type S3BackupStatus,
} from '@/lib/admin-api';
import { cn } from '@/lib/format';
import { KeywordExportTab } from '@/components/admin/KeywordExportTab';
import { PasswordField } from '@/components/admin/PasswordField';
import { PermissionsTab } from '@/components/admin/PermissionsTab';
import { passwordPolicyMessage } from '@/lib/password-policy';

type Tab =
  | 'usuarios'
  | 'orgaos'
  | 'meios'
  | 'signatarios'
  | 'permissoes'
  | 'exportar'
  | 'backup';

export function AdministrationPanel() {
  const { toast } = useToast();
  const { user, can } = useAdminAuth();
  const isSystemAdmin = user?.role === 'admin_geral' && can('users:manage');
  const [tab, setTab] = useState<Tab>('usuarios');
  const [loading, setLoading] = useState(true);

  const tabs = useMemo(() => {
    const base: { id: Tab; label: string }[] = [
      { id: 'usuarios', label: 'Usuários' },
      { id: 'orgaos', label: 'Órgãos de Origem' },
      { id: 'meios', label: 'Meios de publicação' },
      { id: 'signatarios', label: 'Signatários' },
      { id: 'permissoes', label: 'Permissões' },
      { id: 'exportar', label: 'Exportar por palavra-chave' },
    ];
    if (isSystemAdmin) {
      base.push({ id: 'backup', label: 'Backup e migração' });
    }
    return base;
  }, [isSystemAdmin]);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organs, setOrgans] = useState<OriginOrg[]>([]);
  const [media, setMedia] = useState<PublicationMedium[]>([]);
  const [signatories, setSignatories] = useState<AdminSignatory[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<{ id: string; chave: string }[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [u, o, m, s, r, p] = await Promise.all([
        listUsers(),
        listOrgans(false),
        listPublicationMedia(false),
        listSignatories(false),
        listRoles(),
        listPermissions(),
      ]);
      setUsers(u);
      setOrgans(o);
      setMedia(m);
      setSignatories(s);
      setRoles(r);
      setPermissions(p);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao carregar administração', 'danger');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTopbar title="Administração" />

      <div className="border-b border-line bg-surface px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 border-b-2 px-4 py-3 text-[13.5px] font-semibold transition-colors',
                tab === t.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {tab === 'exportar' ? (
          <KeywordExportTab />
        ) : tab === 'backup' && isSystemAdmin ? (
          <BackupTab />
        ) : loading ? (
          <p className="text-[14px] text-ink-3">Carregando…</p>
        ) : tab === 'usuarios' ? (
          <UsersTab users={users} roles={roles} organs={organs} onChanged={reload} />
        ) : tab === 'orgaos' ? (
          <OrgansTab organs={organs} onChanged={reload} />
        ) : tab === 'meios' ? (
          <PublicationMediaTab media={media} onChanged={reload} />
        ) : tab === 'signatarios' ? (
          <SignatoriesTab signatories={signatories} organs={organs} onChanged={reload} />
        ) : (
          <PermissionsTab
            roles={roles}
            users={users}
            permissions={permissions}
            onChanged={reload}
          />
        )}
      </div>
    </div>
  );
}

type S3FormState = {
  enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  forcePathStyle: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
};

const defaultS3Form = (): S3FormState => ({
  enabled: false,
  bucket: '',
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
  endpoint: '',
  forcePathStyle: true,
  prefix: 'siglm/backups',
  hour: 3,
  timezone: 'America/Sao_Paulo',
  keepDaily: 7,
  keepWeekly: 5,
  keepMonthly: 12,
});

function BackupTab() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [s3Running, setS3Running] = useState(false);
  const [s3Saving, setS3Saving] = useState(false);
  const [s3Loading, setS3Loading] = useState(true);
  const [s3Status, setS3Status] = useState<S3BackupStatus | null>(null);
  const [s3Form, setS3Form] = useState<S3FormState>(defaultS3Form);
  const [confirmText, setConfirmText] = useState('');

  const [repairReport, setRepairReport] = useState<{
    total: number;
    ok: number;
    repaired: { actId: string; slug: string; newUrl: string }[];
    missing: { actId: string; slug: string; motivo: string }[];
  } | null>(null);

  const applyS3Status = useCallback((status: S3BackupStatus) => {
    setS3Status(status);
    setS3Form({
      enabled: status.enabled,
      bucket: status.bucket || '',
      region: status.region || 'us-east-1',
      accessKeyId: status.accessKeyId || '',
      secretAccessKey: '',
      endpoint: status.endpoint || '',
      forcePathStyle: status.forcePathStyle,
      prefix: status.prefix || 'siglm/backups',
      hour: status.hour ?? 3,
      timezone: status.timezone || 'America/Sao_Paulo',
      keepDaily: status.keepDaily,
      keepWeekly: status.keepWeekly,
      keepMonthly: status.keepMonthly,
    });
  }, []);

  const refreshS3Status = useCallback(async () => {
    try {
      const status = await getS3BackupStatus();
      applyS3Status(status);
    } catch {
      setS3Status(null);
    } finally {
      setS3Loading(false);
    }
  }, [applyS3Status]);

  useEffect(() => {
    void refreshS3Status();
  }, [refreshS3Status]);

  const onS3Save = async () => {
    setS3Saving(true);
    try {
      const status = await saveS3BackupConfig({
        enabled: s3Form.enabled,
        bucket: s3Form.bucket.trim(),
        region: s3Form.region.trim(),
        accessKeyId: s3Form.accessKeyId.trim(),
        ...(s3Form.secretAccessKey.trim()
          ? { secretAccessKey: s3Form.secretAccessKey.trim() }
          : {}),
        endpoint: s3Form.endpoint.trim() || null,
        forcePathStyle: s3Form.forcePathStyle,
        prefix: s3Form.prefix.trim() || 'siglm/backups',
        hour: s3Form.hour,
        timezone: s3Form.timezone.trim() || 'America/Sao_Paulo',
        keepDaily: s3Form.keepDaily,
        keepWeekly: s3Form.keepWeekly,
        keepMonthly: s3Form.keepMonthly,
      });
      applyS3Status(status);
      toast('Configuração de backup S3 salva', 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar configuração S3', 'danger');
    } finally {
      setS3Saving(false);
    }
  };

  const onS3Run = async () => {
    setS3Running(true);
    try {
      const result = await runS3BackupNow();
      await refreshS3Status();
      const tiers = result.uploaded?.map((u) => u.tier).join(', ') || '—';
      toast(
        result.ok
          ? `Backup S3 concluído (${tiers})`
          : result.error || 'Backup S3 falhou',
        result.ok ? 'ok' : 'danger',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro no backup S3', 'danger');
      await refreshS3Status();
    } finally {
      setS3Running(false);
    }
  };

  const setS3Field = <K extends keyof S3FormState>(key: K, value: S3FormState[K]) => {
    setS3Form((prev) => ({ ...prev, [key]: value }));
  };

  const onRepairOriginals = async () => {
    setRepairing(true);
    try {
      const report = await repairOriginalAttachments();
      setRepairReport({
        total: report.total,
        ok: report.ok,
        repaired: report.repaired.map((r) => ({
          actId: r.actId,
          slug: r.slug,
          newUrl: r.newUrl,
        })),
        missing: report.missing.map((m) => ({
          actId: m.actId,
          slug: m.slug,
          motivo: m.motivo,
        })),
      });
      const parts = [
        `${report.ok} ok`,
        `${report.repaired.length} reparado(s)`,
        `${report.missing.length} sem arquivo`,
      ];
      toast(
        `Verificação de arquivos originais: ${parts.join(' · ')} (total ${report.total})`,
        report.missing.length ? 'warn' : 'ok',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao verificar anexos', 'danger');
    } finally {
      setRepairing(false);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      await downloadSystemBackup();
      toast('Backup gerado e download iniciado', 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao exportar backup', 'danger');
    } finally {
      setExporting(false);
    }
  };

  const onRestore = async (file: File | null) => {
    if (!file) return;
    if (confirmText.trim().toUpperCase() !== 'RESTAURAR') {
      toast('Digite RESTAURAR para confirmar a importação', 'warn');
      return;
    }
    const ok = window.confirm(
      'Atenção: a restauração SUBSTITUI todo o banco de dados e os arquivos enviados deste servidor pelo conteúdo do backup. Esta ação não pode ser desfeita. Continuar?',
    );
    if (!ok) return;

    setRestoring(true);
    try {
      const result = await restoreSystemBackup(file);
      toast(result.message || 'Backup restaurado', 'ok');
      setConfirmText('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao restaurar backup', 'danger');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Backup e migração</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          Exporte o banco de dados e os arquivos (PDFs/anexos) deste servidor para migrar para
          outro ambiente (por exemplo, Railway → Coolify). Variáveis de ambiente (JWT, senhas do
          Postgres, URLs) não entram no arquivo — configure-as no painel do Coolify.
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          Disponível apenas para o perfil <strong>Administrador geral</strong>.
        </p>
      </div>

      <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ink">
              Verificar arquivos originais
            </h3>
            <p className="mt-1 text-[13.5px] text-ink-3">
              Localiza vínculos quebrados ou temporários. Se o documento ainda existir no
              armazenamento (importação/acervo), o vínculo permanente é corrigido
              automaticamente.
            </p>
            <Button
              className="mt-4"
              size="sm"
              variant="outlined"
              onClick={() => void onRepairOriginals()}
              disabled={repairing || exporting || restoring}
            >
              {repairing ? 'Verificando…' : 'Verificar e reparar vínculos'}
            </Button>
            {repairReport && (
              <div className="mt-4 space-y-2 rounded-[10px] border border-line bg-surface-2 px-3 py-3 text-[12.5px]">
                <p className="font-medium text-ink">
                  Resultado: {repairReport.ok} ok · {repairReport.repaired.length}{' '}
                  reparado(s) · {repairReport.missing.length} sem arquivo
                </p>
                {repairReport.repaired.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ok">
                      Reparados
                    </p>
                    <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto font-mono text-[11.5px] text-ink-2">
                      {repairReport.repaired.map((r) => (
                        <li key={r.actId}>{r.slug}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {repairReport.missing.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-danger">
                      Sem arquivo — regularizar (substituir no editor)
                    </p>
                    <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto text-[11.5px] text-ink-2">
                      {repairReport.missing.map((m) => (
                        <li key={m.actId}>
                          <Link
                            href={`/admin/atos/${m.actId}/editor`}
                            className="font-mono text-brand hover:underline"
                            title={m.motivo}
                          >
                            {m.slug}
                          </Link>
                          <span className="ml-1 text-ink-4">— {m.motivo}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ink">Backup automático (S3)</h3>
            <p className="mt-1 text-[13.5px] text-ink-3">
              Configure aqui o repositório S3 (AWS, MinIO, Cloudflare R2…). O sistema envia o
              backup todos os dias e mantém: diários, 1 por semana e 1 por mês — apagando os
              mais antigos automaticamente. Não é necessário editar arquivo de configuração.
            </p>

            {s3Loading ? (
              <p className="mt-4 text-[13px] text-ink-3">Carregando configuração…</p>
            ) : !s3Status ? (
              <p className="mt-4 text-[13px] text-danger">
                Não foi possível carregar a configuração S3.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-[13.5px] text-ink">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-line"
                      checked={s3Form.enabled}
                      onChange={(e) => setS3Field('enabled', e.target.checked)}
                      disabled={s3Saving || s3Running}
                    />
                    Ativar backup diário automático
                  </label>
                  <Badge
                    variant={
                      s3Status.enabled && s3Status.configured ? 'ok' : 'warn'
                    }
                  >
                    {!s3Status.enabled
                      ? 'Desabilitado'
                      : !s3Status.configured
                        ? 'Incompleto'
                        : s3Status.running
                          ? 'Em execução'
                          : 'Ativo'}
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[12px] font-medium text-ink-2">
                    Nome do bucket
                    <Input
                      className="mt-1"
                      value={s3Form.bucket}
                      onChange={(e) => setS3Field('bucket', e.target.value)}
                      placeholder="meu-bucket-siglm"
                      disabled={s3Saving || s3Running}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink-2">
                    Região
                    <Input
                      className="mt-1"
                      value={s3Form.region}
                      onChange={(e) => setS3Field('region', e.target.value)}
                      placeholder="us-east-1"
                      disabled={s3Saving || s3Running}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink-2">
                    Access Key ID
                    <Input
                      className="mt-1 font-mono"
                      value={s3Form.accessKeyId}
                      onChange={(e) => setS3Field('accessKeyId', e.target.value)}
                      placeholder="AKIA…"
                      disabled={s3Saving || s3Running}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink-2">
                    Secret Access Key
                    <Input
                      className="mt-1 font-mono"
                      type="password"
                      value={s3Form.secretAccessKey}
                      onChange={(e) => setS3Field('secretAccessKey', e.target.value)}
                      placeholder={
                        s3Status.hasSecret
                          ? '•••••••• (deixe em branco para manter)'
                          : 'Cole a chave secreta'
                      }
                      disabled={s3Saving || s3Running}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink-2">
                    Pasta no bucket (prefixo)
                    <Input
                      className="mt-1 font-mono"
                      value={s3Form.prefix}
                      onChange={(e) => setS3Field('prefix', e.target.value)}
                      placeholder="siglm/backups"
                      disabled={s3Saving || s3Running}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink-2">
                    Horário do backup diário
                    <Select
                      className="mt-1"
                      value={String(s3Form.hour)}
                      onChange={(e) => setS3Field('hour', Number(e.target.value))}
                      disabled={s3Saving || s3Running}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>

                <div className="rounded-[10px] border border-line bg-surface-2 px-3 py-3">
                  <p className="text-[13px] font-semibold text-ink">Retenção de backups</p>
                  <p className="mt-1 text-[12.5px] text-ink-3">
                    Quantos arquivos manter no S3. Os mais antigos de cada tipo são apagados
                    automaticamente.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block text-[12px] font-medium text-ink-2">
                      Cópias diárias
                      <Input
                        className="mt-1"
                        type="number"
                        min={1}
                        max={90}
                        value={s3Form.keepDaily}
                        onChange={(e) =>
                          setS3Field('keepDaily', Number(e.target.value) || 7)
                        }
                        disabled={s3Saving || s3Running}
                      />
                      <span className="mt-1 block text-[11.5px] font-normal text-ink-4">
                        Ex.: 7 = uma por dia na última semana
                      </span>
                    </label>
                    <label className="block text-[12px] font-medium text-ink-2">
                      Cópias semanais
                      <Input
                        className="mt-1"
                        type="number"
                        min={1}
                        max={52}
                        value={s3Form.keepWeekly}
                        onChange={(e) =>
                          setS3Field('keepWeekly', Number(e.target.value) || 5)
                        }
                        disabled={s3Saving || s3Running}
                      />
                      <span className="mt-1 block text-[11.5px] font-normal text-ink-4">
                        Geradas todo domingo
                      </span>
                    </label>
                    <label className="block text-[12px] font-medium text-ink-2">
                      Cópias mensais
                      <Input
                        className="mt-1"
                        type="number"
                        min={1}
                        max={120}
                        value={s3Form.keepMonthly}
                        onChange={(e) =>
                          setS3Field('keepMonthly', Number(e.target.value) || 12)
                        }
                        disabled={s3Saving || s3Running}
                      />
                      <span className="mt-1 block text-[11.5px] font-normal text-ink-4">
                        Geradas no dia 1 de cada mês
                      </span>
                    </label>
                  </div>
                </div>

                <details className="rounded-[10px] border border-line bg-surface-2 px-3 py-2">
                  <summary className="cursor-pointer text-[13px] font-medium text-ink-2">
                    Opções avançadas (endpoint, fuso)
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block text-[12px] font-medium text-ink-2 sm:col-span-2">
                      Endpoint (MinIO / R2 — opcional)
                      <Input
                        className="mt-1 font-mono"
                        value={s3Form.endpoint}
                        onChange={(e) => setS3Field('endpoint', e.target.value)}
                        placeholder="https://….r2.cloudflarestorage.com"
                        disabled={s3Saving || s3Running}
                        autoComplete="off"
                      />
                    </label>
                    <label className="block text-[12px] font-medium text-ink-2">
                      Fuso horário
                      <Input
                        className="mt-1 font-mono"
                        value={s3Form.timezone}
                        onChange={(e) => setS3Field('timezone', e.target.value)}
                        placeholder="America/Sao_Paulo"
                        disabled={s3Saving || s3Running}
                        autoComplete="off"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-line"
                        checked={s3Form.forcePathStyle}
                        onChange={(e) => setS3Field('forcePathStyle', e.target.checked)}
                        disabled={s3Saving || s3Running}
                      />
                      Path-style (recomendado para MinIO / alguns endpoints compatíveis)
                    </label>
                  </div>
                </details>

                <div className="rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
                  {s3Status.lastRun ? (
                    <p>
                      Última execução:{' '}
                      {new Date(s3Status.lastRun.at).toLocaleString('pt-BR')} ·{' '}
                      {s3Status.lastRun.ok ? 'sucesso' : 'erro'} (
                      {s3Status.lastRun.triggeredBy})
                      {s3Status.lastRun.error
                        ? ` — ${s3Status.lastRun.error}`
                        : ''}
                    </p>
                  ) : (
                    <p>Ainda não houve execução neste servidor após o último restart.</p>
                  )}
                  <p className="mt-1">
                    Agendamento: todos os dias às{' '}
                    {String(s3Form.hour).padStart(2, '0')}:00 ({s3Form.timezone}). No
                    domingo também grava semanal; no dia 1, mensal.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => void onS3Save()}
                    disabled={s3Saving || s3Running || exporting || restoring}
                  >
                    {s3Saving ? 'Salvando…' : 'Salvar configuração'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => void onS3Run()}
                    disabled={
                      s3Running ||
                      s3Saving ||
                      exporting ||
                      restoring ||
                      !s3Status.enabled ||
                      !s3Status.configured ||
                      s3Status.running
                    }
                  >
                    {s3Running || s3Status.running
                      ? 'Enviando backup…'
                      : 'Executar backup agora'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ink">Exportar backup</h3>
            <p className="mt-1 text-[13.5px] text-ink-3">
              Gera um arquivo <code className="font-mono text-[12px]">.tar.gz</code> com dados do
              sistema (usuários, órgãos, atos, anexos, etc.) e a pasta de uploads.
            </p>
            <Button
              className="mt-4"
              size="sm"
              onClick={() => void onExport()}
              disabled={exporting || restoring || s3Running}
            >
              {exporting ? 'Gerando backup…' : 'Baixar backup completo'}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-danger/30 bg-danger/5 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Upload className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ink">Importar / restaurar backup</h3>
            <p className="mt-1 text-[13.5px] text-ink-3">
              Use no servidor de destino (Coolify) após o deploy e as migrations. A operação
              apaga os dados atuais deste ambiente e carrega o conteúdo do arquivo.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
              <li>Faça o deploy do SIGLM no Coolify e rode as migrations.</li>
              <li>Exporte o backup no Railway (botão acima).</li>
              <li>Neste servidor Coolify, selecione o arquivo e confirme digitando RESTAURAR.</li>
            </ol>
            <label className="mt-4 block text-[12px] font-medium text-ink-2">
              Digite <Badge variant="danger">RESTAURAR</Badge> para habilitar a importação
            </label>
            <Input
              className="mt-1.5 max-w-xs font-mono uppercase"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTAURAR"
              disabled={restoring || exporting}
              autoComplete="off"
            />
            <div className="mt-4">
              <Button
                size="sm"
                variant="danger"
                disabled={
                  restoring ||
                  exporting ||
                  s3Running ||
                  confirmText.trim().toUpperCase() !== 'RESTAURAR'
                }
                onClick={() => {
                  const input = document.getElementById(
                    'siglm-restore-file',
                  ) as HTMLInputElement | null;
                  input?.click();
                }}
              >
                {restoring ? 'Restaurando…' : 'Selecionar arquivo e restaurar'}
              </Button>
              <input
                id="siglm-restore-file"
                type="file"
                accept=".tar.gz,application/gzip,application/x-gzip,application/x-tar"
                className="hidden"
                disabled={restoring || exporting}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  void onRestore(file);
                }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MultiLinkSelector({
  label,
  options,
  selectedIds,
  primaryId,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selectedIds: string[];
  primaryId: string | null;
  onChange: (ids: string[], primaryId: string | null) => void;
}) {
  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    let nextPrimary = primaryId;
    if (!next.includes(id)) {
      if (primaryId === id) nextPrimary = next[0] ?? null;
    } else if (next.length === 1) {
      nextPrimary = next[0];
    } else if (!nextPrimary || !next.includes(nextPrimary)) {
      nextPrimary = next[0];
    }
    onChange(next, nextPrimary);
  };

  const setPrimary = (id: string) => {
    if (!selectedIds.includes(id)) return;
    onChange(selectedIds, id);
  };

  return (
    <div className="sm:col-span-2">
      <p className="mb-2 text-[12px] font-semibold text-ink-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = selectedIds.includes(opt.id);
          const isPrimary = primaryId === opt.id;
          return (
            <label
              key={opt.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-[12px]',
                checked ? 'border-brand/40 bg-brand-soft/40' : 'border-line bg-surface',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.id)}
                className="rounded border-line"
              />
              <span>{opt.label}</span>
              {checked && selectedIds.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPrimary(opt.id);
                  }}
                  className={cn(
                    'ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    isPrimary ? 'bg-brand text-white' : 'bg-canvas text-ink-4 hover:text-brand',
                  )}
                >
                  {isPrimary ? 'Principal' : 'Tornar principal'}
                </button>
              )}
              {checked && selectedIds.length === 1 && (
                <span className="ml-1 text-[10px] font-semibold uppercase text-brand">Principal</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function UsersTab({
  users,
  roles,
  organs,
  onChanged,
}: {
  users: AdminUser[];
  roles: AdminRole[];
  organs: OriginOrg[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<{
    nome: string;
    email: string;
    senha: string;
    roleIds: string[];
    primaryRoleId: string | null;
    orgaoIds: string[];
    primaryOrgaoId: string | null;
    mustChangePassword: boolean;
  }>({
    nome: '',
    email: '',
    senha: '',
    roleIds: roles[0]?.id ? [roles[0].id] : [],
    primaryRoleId: roles[0]?.id ?? null,
    orgaoIds: [],
    primaryOrgaoId: null,
    mustChangePassword: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSenha, setEditSenha] = useState('');
  const [editMustChange, setEditMustChange] = useState(false);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [editPrimaryRoleId, setEditPrimaryRoleId] = useState<string | null>(null);
  const [editOrgaoIds, setEditOrgaoIds] = useState<string[]>([]);
  const [editPrimaryOrgaoId, setEditPrimaryOrgaoId] = useState<string | null>(null);

  const roleOptions = roles.map((r) => ({ id: r.id, label: r.nome.replace(/_/g, ' ') }));
  const organOptions = organs.filter((o) => o.ativo).map((o) => ({
    id: o.id,
    label: o.sigla ? `${o.sigla} — ${o.nome}` : o.nome,
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.roleIds.length) {
      toast('Selecione ao menos um perfil', 'danger');
      return;
    }
    const policyError = passwordPolicyMessage(form.senha);
    if (policyError) {
      toast(policyError, 'danger');
      return;
    }
    try {
      await createUser({
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        roleIds: form.roleIds,
        primaryRoleId: form.primaryRoleId ?? undefined,
        orgaoIds: form.orgaoIds.length ? form.orgaoIds : undefined,
        primaryOrgaoId: form.primaryOrgaoId ?? undefined,
        mustChangePassword: form.mustChangePassword,
      });
      toast('Usuário criado', 'ok');
      setForm({
        nome: '',
        email: '',
        senha: '',
        roleIds: roles[0]?.id ? [roles[0].id] : [],
        primaryRoleId: roles[0]?.id ?? null,
        orgaoIds: [],
        primaryOrgaoId: null,
        mustChangePassword: true,
      });
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    }
  };

  const openEdit = (user: AdminUser) => {
    const roleIds = user.roleLinks?.length
      ? user.roleLinks.map((l) => l.roleId)
      : [user.role.id];
    const primaryRoleId =
      user.roleLinks?.find((l) => l.isPrimary)?.roleId ?? user.role.id;
    const orgaoIds = user.orgLinks?.map((l) => l.orgaoId) ?? [];
    const primaryOrgaoId = user.orgLinks?.find((l) => l.isPrimary)?.orgaoId ?? null;
    setEditingId(user.id);
    setEditSenha('');
    setEditMustChange(user.mustChangePassword);
    setEditRoleIds(roleIds);
    setEditPrimaryRoleId(primaryRoleId);
    setEditOrgaoIds(orgaoIds);
    setEditPrimaryOrgaoId(primaryOrgaoId);
  };

  const saveUserEdit = async (user: AdminUser) => {
    if (user.ativo && !editRoleIds.length) {
      toast('Usuário ativo deve ter ao menos um perfil', 'danger');
      return;
    }
    if (editSenha) {
      const policyError = passwordPolicyMessage(editSenha);
      if (policyError) {
        toast(policyError, 'danger');
        return;
      }
    }
    try {
      await updateUser(user.id, {
        senha: editSenha || undefined,
        mustChangePassword: editMustChange,
        roleIds: editRoleIds,
        primaryRoleId: editPrimaryRoleId ?? undefined,
        orgaoIds: editOrgaoIds,
        primaryOrgaoId: editPrimaryOrgaoId,
      });
      toast('Usuário atualizado', 'ok');
      setEditingId(null);
      setEditSenha('');
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <form onSubmit={submit} className="rounded-[14px] border border-line bg-surface p-4 shadow-sm">
        <h3 className="text-section mb-3">Novo usuário</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Nome"
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <Input
            type="email"
            placeholder="E-mail"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div className="sm:col-span-2">
            <PasswordField
              id="create-user-senha"
              label="Senha"
              value={form.senha}
              onChange={(senha) => setForm({ ...form, senha })}
              required
              autoComplete="new-password"
              showRequirements
            />
          </div>
          <MultiLinkSelector
            label="Perfis vinculados"
            options={roleOptions}
            selectedIds={form.roleIds}
            primaryId={form.primaryRoleId}
            onChange={(roleIds, primaryRoleId) =>
              setForm({ ...form, roleIds, primaryRoleId })
            }
          />
          <MultiLinkSelector
            label="Órgãos vinculados (opcional)"
            options={organOptions}
            selectedIds={form.orgaoIds}
            primaryId={form.primaryOrgaoId}
            onChange={(orgaoIds, primaryOrgaoId) =>
              setForm({ ...form, orgaoIds, primaryOrgaoId })
            }
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.mustChangePassword}
              onChange={(e) => setForm({ ...form, mustChangePassword: e.target.checked })}
              className="rounded border-line"
            />
            Exigir alteração de senha no primeiro acesso
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="submit" size="sm">
            Incluir usuário
          </Button>
        </div>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {users.map((u) => (
          <li key={u.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">{u.nome}</p>
                <p className="text-[12px] text-ink-3">{u.email}</p>
                <p className="mt-1 text-[11px] text-ink-3">
                  Perfil: <span className="font-medium text-ink-2">{u.role.nome.replace(/_/g, ' ')}</span>
                  {u.rolesCount > 1 && (
                    <span className="text-ink-4"> (+{u.rolesCount - 1})</span>
                  )}
                  {' · '}
                  Órgão:{' '}
                  <span className="font-medium text-ink-2">
                    {u.primaryOrg?.sigla ?? u.primaryOrg?.nome ?? '—'}
                  </span>
                  {u.orgsCount > 1 && (
                    <span className="text-ink-4"> (+{u.orgsCount - 1})</span>
                  )}
                </p>
                {u.mustChangePassword && (
                  <p className="mt-1 text-[11px] font-medium text-warn">
                    Deve alterar senha no próximo acesso
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={u.ativo ? 'ok' : 'danger'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (editingId === u.id) {
                      setEditingId(null);
                      setEditSenha('');
                      return;
                    }
                    openEdit(u);
                  }}
                >
                  {editingId === u.id ? 'Fechar' : 'Editar'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await updateUser(u.id, { ativo: !u.ativo });
                      toast(u.ativo ? 'Usuário inativado' : 'Usuário reativado', 'ok');
                      await onChanged();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Erro', 'danger');
                    }
                  }}
                >
                  {u.ativo ? 'Inativar' : 'Reativar'}
                </Button>
              </div>
            </div>

            {editingId === u.id && (
              <div className="mt-3 rounded-[10px] border border-line bg-canvas p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MultiLinkSelector
                    label="Perfis vinculados"
                    options={roleOptions}
                    selectedIds={editRoleIds}
                    primaryId={editPrimaryRoleId}
                    onChange={(roleIds, primaryRoleId) => {
                      setEditRoleIds(roleIds);
                      setEditPrimaryRoleId(primaryRoleId);
                    }}
                  />
                  <MultiLinkSelector
                    label="Órgãos vinculados"
                    options={organOptions}
                    selectedIds={editOrgaoIds}
                    primaryId={editPrimaryOrgaoId}
                    onChange={(orgaoIds, primaryOrgaoId) => {
                      setEditOrgaoIds(orgaoIds);
                      setEditPrimaryOrgaoId(primaryOrgaoId);
                    }}
                  />
                  <div className="sm:col-span-2">
                    <PasswordField
                      id={`edit-senha-${u.id}`}
                      label="Nova senha (deixe vazio para não alterar)"
                      value={editSenha}
                      onChange={setEditSenha}
                      autoComplete="new-password"
                      showRequirements={editSenha.length > 0}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={editMustChange}
                      onChange={(e) => setEditMustChange(e.target.checked)}
                      className="rounded border-line"
                    />
                    Exigir alteração de senha no primeiro acesso
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={() => void saveUserEdit(u)}>
                    Salvar alterações
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrgansTab({
  organs,
  onChanged,
}: {
  organs: OriginOrg[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editSigla, setEditSigla] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createOrgan(nome, sigla || null);
      toast('Órgão cadastrado', 'ok');
      setNome('');
      setSigla('');
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        onSubmit={submit}
        className="flex flex-wrap gap-2 rounded-[14px] border border-line bg-surface p-4 shadow-sm"
      >
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Nome do órgão"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Input
          className="w-28"
          placeholder="Sigla"
          value={sigla}
          onChange={(e) => setSigla(e.target.value.toUpperCase())}
        />
        <Button type="submit" size="sm">
          Incluir órgão
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {organs.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            {editing === o.id ? (
              <form
                className="flex flex-1 flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await updateOrgan(o.id, { nome: editNome, sigla: editSigla || null });
                    toast('Órgão atualizado', 'ok');
                    setEditing(null);
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                <Input
                  className="min-w-[180px] flex-1"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                />
                <Input
                  className="w-28"
                  value={editSigla}
                  onChange={(e) => setEditSigla(e.target.value.toUpperCase())}
                  placeholder="Sigla"
                />
                <Button type="submit" size="sm">
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              <>
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {o.sigla ? `${o.sigla} — ` : ''}
                    {o.nome}
                  </p>
                  <p className="text-[12px] text-ink-3">
                    {o._count?.acts ?? 0} ato(s) vinculado(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={o.ativo ? 'ok' : 'danger'}>
                    {o.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(o.id);
                      setEditNome(o.nome);
                      setEditSigla(o.sigla ?? '');
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await updateOrgan(o.id, { ativo: !o.ativo });
                        toast(o.ativo ? 'Órgão inativado' : 'Órgão reativado', 'ok');
                        await onChanged();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Erro', 'danger');
                      }
                    }}
                  >
                    {o.ativo ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">
        Órgãos vinculados a atos não são excluídos — apenas inativados, preservando o histórico. A
        sigla é usada no prefixo automático do título formal.
      </p>
    </div>
  );
}

function PublicationMediaTab({
  media,
  onChanged,
}: {
  media: PublicationMedium[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createPublicationMedium(nome);
            toast('Meio de publicação cadastrado', 'ok');
            setNome('');
            await onChanged();
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Erro', 'danger');
          }
        }}
        className="flex flex-wrap gap-2 rounded-[14px] border border-line bg-surface p-4 shadow-sm"
      >
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Ex.: Diário Oficial Eletrônico"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Button type="submit" size="sm">
          Incluir meio
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {media.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            {editing === m.id ? (
              <form
                className="flex flex-1 flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await updatePublicationMedium(m.id, { nome: editNome });
                    toast('Meio atualizado', 'ok');
                    setEditing(null);
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                <Input
                  className="min-w-[180px] flex-1"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                />
                <Button type="submit" size="sm">
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              <>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{m.nome}</p>
                  <p className="text-[12px] text-ink-3">
                    {m._count?.acts ?? 0} ato(s) vinculado(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.ativo ? 'ok' : 'danger'}>
                    {m.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(m.id);
                      setEditNome(m.nome);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await updatePublicationMedium(m.id, { ativo: !m.ativo });
                        toast(m.ativo ? 'Meio inativado' : 'Meio reativado', 'ok');
                        await onChanged();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Erro', 'danger');
                      }
                    }}
                  >
                    {m.ativo ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">
        Meios já vinculados a atos não podem ser excluídos — apenas inativados. Meios inativos
        continuam visíveis nos atos antigos.
      </p>
    </div>
  );
}

function SignatoriesTab({
  signatories,
  organs,
  onChanged,
}: {
  signatories: AdminSignatory[];
  organs: OriginOrg[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ nome: '', cargo: '', orgaoId: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ nome: '', cargo: '', orgaoId: '' });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createSignatory({
              nome: form.nome,
              cargo: form.cargo,
              orgaoId: form.orgaoId || null,
            });
            toast('Signatário cadastrado', 'ok');
            setForm({ nome: '', cargo: '', orgaoId: '' });
            await onChanged();
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Erro', 'danger');
          }
        }}
        className="space-y-3 rounded-[14px] border border-line bg-surface p-4 shadow-sm"
      >
        <h3 className="text-section">Novo signatário</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Nome completo"
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <Input
            placeholder="Cargo ou função"
            required
            value={form.cargo}
            onChange={(e) => setForm({ ...form, cargo: e.target.value })}
          />
          <Select
            value={form.orgaoId}
            onChange={(e) => setForm({ ...form, orgaoId: e.target.value })}
            className="sm:col-span-2"
          >
            <option value="">Órgão (opcional)</option>
            {organs
              .filter((o) => o.ativo)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.sigla ? `${o.sigla} — ${o.nome}` : o.nome}
                </option>
              ))}
          </Select>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm">
            Incluir signatário
          </Button>
        </div>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {signatories.map((s) => (
          <li key={s.id} className="px-4 py-3">
            {editing === s.id ? (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await updateSignatory(s.id, {
                      nome: edit.nome,
                      cargo: edit.cargo,
                      orgaoId: edit.orgaoId || null,
                    });
                    toast('Signatário atualizado', 'ok');
                    setEditing(null);
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={edit.nome}
                    onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                    required
                  />
                  <Input
                    value={edit.cargo}
                    onChange={(e) => setEdit({ ...edit, cargo: e.target.value })}
                    required
                  />
                  <Select
                    value={edit.orgaoId}
                    onChange={(e) => setEdit({ ...edit, orgaoId: e.target.value })}
                    className="sm:col-span-2"
                  >
                    <option value="">Órgão (opcional)</option>
                    {organs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.sigla ? `${o.sigla} — ${o.nome}` : o.nome}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Salvar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-ink">{s.nome}</p>
                  <p className="text-[12.5px] text-ink-2">{s.cargo}</p>
                  {s.orgao && (
                    <p className="text-[12px] text-ink-3">
                      {s.orgao.sigla ? `${s.orgao.sigla} — ` : ''}
                      {s.orgao.nome}
                    </p>
                  )}
                  <p className="text-[11px] text-ink-4">
                    {s._count?.links ?? 0} vínculo(s) em atos
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.ativo ? 'ok' : 'danger'}>
                    {s.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(s.id);
                      setEdit({
                        nome: s.nome,
                        cargo: s.cargo,
                        orgaoId: s.orgaoId ?? '',
                      });
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await updateSignatory(s.id, { ativo: !s.ativo });
                        toast(s.ativo ? 'Signatário inativado' : 'Signatário reativado', 'ok');
                        await onChanged();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Erro', 'danger');
                      }
                    }}
                  >
                    {s.ativo ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">
        Alterações no cadastro geral não modificam automaticamente os snapshots já vinculados a
        atos publicados.
      </p>
    </div>
  );
}
