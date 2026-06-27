# Backup SIGLM — Restic

Backup **completo e consistente** da aplicação, pronto para [Restic](https://restic.net):

| Componente | Conteúdo |
|------------|----------|
| **PostgreSQL** | `pg_dump` comprimido (`.sql.gz`) |
| **Uploads** | PDFs, anexos importados (`/app/apps/api/uploads`) |
| **Manifest** | Metadados JSON (data, tamanhos, instruções de restore) |

Código e imagens Docker **não** entram no backup — vêm do Git. Variáveis de ambiente (JWT, senhas) ficam no Coolify — **exporte e guarde separadamente**.

---

## Pré-requisitos no servidor

```bash
# Debian/Ubuntu
sudo apt install restic docker.io

# macOS
brew install restic
```

No servidor Coolify/VPS onde roda `docker compose -f docker-compose.coolify.yml`.

---

## Configuração (uma vez)

```bash
cd /caminho/do/SIGLM
cp scripts/backup/restic.env.example scripts/backup/restic.env
chmod +x scripts/backup/*.sh
nano scripts/backup/restic.env
```

Preencha:

| Variável | Exemplo |
|----------|---------|
| `RESTIC_REPOSITORY` | `s3:s3.amazonaws.com/bucket/siglm` ou `/mnt/backups/restic/siglm` |
| `RESTIC_PASSWORD` | senha forte do repositório restic |
| `SIGLM_ROOT` | `/data/coolify/.../SIGLM` (caminho absoluto do repo) |
| `BACKUP_STAGING` | `/var/lib/siglm-backup/staging` |

Inicialize o repositório (automático no primeiro backup, ou manual):

```bash
source scripts/backup/restic.env
export RESTIC_REPOSITORY RESTIC_PASSWORD
restic init   # só na primeira vez
```

---

## Backup manual

```bash
./scripts/backup/restic-backup.sh
```

Fluxo interno:

1. `prepare-snapshot.sh` — dump Postgres + export uploads
2. `restic backup` — envia snapshot ao repositório
3. `restic forget --prune` — aplica retenção (30 dias / 12 semanas / 12 meses)

---

## Agendamento (cron)

```bash
sudo crontab -e
```

```cron
# Backup diário 03:00 UTC
0 3 * * * /caminho/SIGLM/scripts/backup/restic-backup.sh >> /var/log/siglm-backup.log 2>&1

# Verificação semanal domingo 04:00
0 4 * * 0 /caminho/SIGLM/scripts/backup/restic-check.sh >> /var/log/siglm-restic-check.log 2>&1
```

---

## Restaurar

### 1. Listar snapshots

```bash
./scripts/backup/restic-restore.sh list
```

### 2. Baixar snapshot para disco

```bash
./scripts/backup/restic-restore.sh latest /var/lib/siglm-backup/restore
```

### 3. Aplicar no Docker Compose (produção)

```bash
# Pare tráfego se possível (modo manutenção)
docker compose -f docker-compose.coolify.yml stop web api

./scripts/backup/restic-restore.sh apply /var/lib/siglm-backup/restore
# Digite RESTAURAR quando solicitado

docker compose -f docker-compose.coolify.yml up -d
```

---

## Estrutura do snapshot

```
staging/20250625-030000/
├── manifest.json
├── postgres/
│   └── siglm-20250625-030000.sql.gz
└── uploads/
    ├── attachments/
    └── ...
```

---

## Destinos Restic comuns

| Backend | `RESTIC_REPOSITORY` |
|---------|---------------------|
| **S3 AWS** | `s3:s3.amazonaws.com/bucket/siglm` |
| **MinIO** | `s3:https://minio.example.com/bucket/siglm` |
| **SFTP** | `sftp:user@host:/backups/siglm` |
| **Disco local/NFS** | `/mnt/backups/restic/siglm` |
| **Backblaze B2** | `s3:s3.us-west-000.backblazeb2.com/bucket/siglm` |

---

## Checklist de disaster recovery

- [ ] `restic.env` configurado e testado
- [ ] Primeiro backup manual OK
- [ ] Teste de restore em ambiente separado (não produção)
- [ ] Cron ativo
- [ ] `restic-check` semanal
- [ ] Cópia offline das variáveis Coolify (JWT, POSTGRES_PASSWORD)
- [ ] Documentar URL do repositório e senha restic em cofre seguro

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `postgres não está rodando` | Execute no host do Coolify com compose ativo |
| `restic: repository does not exist` | `restic init` |
| Dump vazio | Verifique `POSTGRES_USER` / `POSTGRES_DB` |
| Uploads vazios | Confirme volume `api_uploads` e serviço `api` |
| Restore falha no psql | Pare `api` antes; use `apply` que recria o banco |

---

Ver também: [`COOLIFY.md`](COOLIFY.md) (deploy) · [`docker-compose.coolify.yml`](docker-compose.coolify.yml)
