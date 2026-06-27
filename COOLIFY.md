# Deploy no Coolify — SIGLM

**Um recurso, um compose, deploy automático via Git** — a forma mais simples de manter.

Repositório: `https://github.com/leandroborgeseng/SIGLM` · branch `main`

```
Git push main → Coolify rebuild → postgres + api + web
```

---

## O que sobe no compose

| Serviço | Função | Porta |
|---------|--------|-------|
| **postgres** | PostgreSQL 16 (dados persistidos) | interno |
| **api** | NestJS + Prisma + migrations automáticas | 3001 |
| **web** | Next.js (portal + admin) | 3000 |

Arquivo: [`docker-compose.coolify.yml`](docker-compose.coolify.yml)

> Se você criou um Postgres **separado** no Coolify, pode ignorá-lo — este compose traz o banco **dentro do stack** e é mais fácil de manter (backup via volume `pgdata`, sem `DATABASE_URL` manual).

---

## Passo a passo (15 min)

### 1. Criar recurso no Coolify

1. **+ New Resource** → **Docker Compose**
2. Conecte **GitHub** → repositório **SIGLM** → branch **main**
3. **Base Directory:** *(vazio)*
4. **Docker Compose Location:** `docker-compose.coolify.yml`
5. **Settings → Git** → ative **Auto Deploy** (deploy a cada push, igual Railway)

### 2. Variáveis de ambiente

Aba **Environment** — copie de [`.env.coolify.example`](.env.coolify.example):

```env
POSTGRES_PASSWORD=senha-forte-unica
JWT_SECRET=...          # openssl rand -base64 48
JWT_REFRESH_SECRET=...  # openssl rand -base64 48
CORS_ORIGIN=https://legislacao.seudominio.gov.br
NEXT_PUBLIC_API_URL=https://api.seudominio.gov.br/api
RUN_SEED=true
```

| Variável | Obrigatória | Notas |
|----------|-------------|-------|
| `POSTGRES_PASSWORD` | ✅ | Senha do Postgres interno |
| `JWT_SECRET` | ✅ | Nunca commitar |
| `JWT_REFRESH_SECRET` | ✅ | Nunca commitar |
| `CORS_ORIGIN` | ✅ | URL do **portal** (HTTPS, sem `/` final) |
| `NEXT_PUBLIC_API_URL` | ✅ | URL da **API** com `/api` |
| `RUN_SEED` | ⚠️ | `true` só no **1º** deploy |

Opcionais (padrão já ok): `POSTGRES_USER=siglm`, `POSTGRES_DB=siglm`

### 3. Domínios

No Coolify, associe domínios aos serviços:

| Serviço | Exemplo | Porta container |
|---------|---------|-----------------|
| **web** | `https://legislacao.seudominio.gov.br` | 3000 |
| **api** | `https://api.seudominio.gov.br` | 3001 |

A **api** precisa de domínio público para o browser e para o build do web (`NEXT_PUBLIC_API_URL`).

### 4. Primeiro deploy

1. Clique **Deploy**
2. Logs da **api**:
   - `prisma migrate deploy`
   - `Executando seed...` (se `RUN_SEED=true`)
3. Testes:
   - `GET https://api.seudominio.gov.br/api/health` → OK
   - `https://legislacao.seudominio.gov.br/legislacao` → lista atos
   - `https://legislacao.seudominio.gov.br/admin/login`

### 5. Após o seed

```env
RUN_SEED=false
```

Redeploy da api (ou redeploy do compose inteiro).

---

## Ciclo de manutenção (dia a dia)

| Ação | Como |
|------|------|
| **Publicar código** | `git push origin main` → Coolify deploya sozinho |
| **Redeploy manual** | Botão **Redeploy** no Coolify |
| **Ver logs** | Coolify → serviço **api** ou **web** → Logs |
| **Migrations** | Automáticas no deploy (`prestart`) |
| **Backup banco** | Volume `pgdata` — veja [`BACKUP.md`](BACKUP.md) (Restic) |
| **Uploads PDF** | Volume `api_uploads` — incluído no backup Restic |

---

## Login inicial (seed)

| Campo | Valor |
|-------|-------|
| E-mail | `admin@franca.sp.gov.br` |
| Senha | `admin123` |

**Troque a senha antes de produção formal.**

---

## Checklist pós-deploy

- [ ] `/api/health` OK
- [ ] `/legislacao` lista atos
- [ ] Login admin funciona
- [ ] `CORS_ORIGIN` = URL exata do portal
- [ ] `RUN_SEED=false`
- [ ] Senha admin alterada
- [ ] `npm run smoke` com URLs de produção

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| API não sobe | Logs api — Postgres healthy? `POSTGRES_PASSWORD` definida? |
| CORS | `CORS_ORIGIN` = URL exata do web (https, sem barra) |
| Portal 500 | `NEXT_PUBLIC_API_URL` e `API_URL` apontam para API pública |
| Uploads sumiram | Volume `api_uploads` deve persistir no Coolify |
| Build web falha | Veja logs — geralmente variável faltando |
| OCR lento | Aumente RAM do container **api** |

---

## Teste local (mesmo compose)

```bash
cp .env.coolify.example .env
# Edite POSTGRES_PASSWORD, JWT_*, etc.

export $(grep -v '^#' .env | xargs)
export RUN_SEED=true

docker compose -f docker-compose.coolify.yml up -d --build
```

Adicione portas temporárias se quiser acessar localhost (ou use `docker-compose.prod.yml` que já expõe 3000/3001).

---

## Alternativa: dois apps separados (estilo Railway)

Só use se precisar escalar api e web independentemente. Para a prefeitura, o **compose único** acima é o recomendado.

Detalhes legados: [`DEPLOY.md`](DEPLOY.md)
