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

Aba **Environment** — copie de [`.env.coolify.example`](.env.coolify.example).

> **Crítico no Coolify:** marque **Available at Buildtime** (Build Variable) em `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` e, se definir manualmente, `NEXT_PUBLIC_API_URL` e `CORS_ORIGIN`.
>
> **Não use texto placeholder** (ex.: `Defina JWT_SECRET`) — o deploy aceita, mas a API não funciona de verdade.

**URLs automáticas:** se você configurou domínios no Coolify, `SERVICE_URL_API` e `SERVICE_URL_WEB` são injetados automaticamente. O compose usa isso como fallback — `NEXT_PUBLIC_API_URL` e `CORS_ORIGIN` **podem ficar vazios** na primeira tentativa (desde que api e web tenham domínio/sslip.io).

```env
POSTGRES_PASSWORD=senha-forte-unica
JWT_SECRET=...          # openssl rand -base64 48
JWT_REFRESH_SECRET=...  # openssl rand -base64 48
CORS_ORIGIN=            # opcional se SERVICE_URL_WEB existir
NEXT_PUBLIC_API_URL=    # opcional se SERVICE_URL_API existir (compose adiciona /api)
RUN_SEED=true
```

| Variável | Build + Runtime | Notas |
|----------|-----------------|-------|
| `POSTGRES_PASSWORD` | ✅ ambos | Senha do Postgres interno |
| `JWT_SECRET` | ✅ ambos | Nunca commitar |
| `JWT_REFRESH_SECRET` | ✅ ambos | Nunca commitar |
| `CORS_ORIGIN` | ✅ ambos | URL do **portal** (HTTPS, sem `/` final) |
| `NEXT_PUBLIC_API_URL` | ✅ **build obrigatório** | URL da **API** com `/api` |
| `RUN_SEED` | runtime ok | `true` só no **1º** deploy |

Opcionais (padrão já ok): `POSTGRES_USER=siglm`, `POSTGRES_DB=siglm`

**Ordem recomendada:** configure domínios da **api** e **web** → defina `NEXT_PUBLIC_API_URL` e `CORS_ORIGIN` com URLs finais → marque Build Variable → Deploy.

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

### Atos de exemplo (após seed)

| Ato | URL no portal |
|-----|----------------|
| LC 312/2024 — Código Tributário | `/legislacao/lei-complementar/2024/312` |
| Lei 4.987/2026 — altera LC 312 | `/legislacao/lei/2026/4987` |
| Decreto 12.450/2026 — revoga art. 4º | `/legislacao/decreto/2026/12450` |

---

## Ambiente de demonstração (senha no portal)

Para mostrar o sistema a terceiros sem deixar o portal aberto:

1. **Popule o banco** (se ainda vazio): `RUN_SEED=true` → Deploy → depois `RUN_SEED=false`
2. No Coolify → **Environment**:

```env
NEXT_PUBLIC_STAGING_GATE=true
STAGING_ACCESS_PASSWORD=siglm-demo
```

| Variável | Build Variable | Função |
|----------|----------------|--------|
| `NEXT_PUBLIC_STAGING_GATE` | ✅ sim | Ativa tela `/acesso` (rebuild) |
| `STAGING_ACCESS_PASSWORD` | não | Senha da demo (runtime) |

3. **Redeploy** (rebuild do **web** para aplicar a flag)
4. Acesse o portal → senha `siglm-demo` (ou a que você definiu)
5. Painel admin: `admin@franca.sp.gov.br` / `admin123`

Para **produção formal**: `NEXT_PUBLIC_STAGING_GATE=false` e rebuild.

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
| `No space left on device` | **Libere disco no servidor** (veja abaixo) antes de redeploy |
| Build web falha (`npm run build`) | Disco cheio ou RAM baixa — libere espaço; api precisa ~2 GB RAM no build |
| `NEXT_PUBLIC_API_URL is missing a value` | Defina a variável ou configure domínio da **api** (Coolify injeta `SERVICE_URL_API`) |
| Variáveis com `Defina JWT_SECRET` etc. | Substitua por valores reais (`openssl rand -base64 48`) |
| `POSTGRES_PASSWORD` / JWT vazios | Preencha variáveis e marque Build + Runtime |
| API não sobe | Logs api — Postgres healthy? `POSTGRES_PASSWORD` definida? |
| CORS | `CORS_ORIGIN` = URL exata do web (https, sem barra) |
| Portal 500 | `NEXT_PUBLIC_API_URL` e `API_URL` apontam para API pública |
| Uploads sumiram | Volume `api_uploads` deve persistir no Coolify |
| Build web falha | Veja logs — geralmente variável faltando |
| OCR lento | Aumente RAM do container **api** |

### Disco cheio no servidor (`No space left on device`)

Builds Docker consomem muito espaço. No **WEBX-PMF-SRV01** (SSH), execute com cuidado:

```bash
# Ver uso
df -h / /data /var/lib/docker

# Remover imagens/containers/build cache não usados
sudo docker system df
sudo docker builder prune -af
sudo docker image prune -af
sudo docker container prune -f

# Deploys antigos do Coolify (se /data estiver cheio)
sudo du -sh /data/coolify/* | sort -h | tail -20
```

Depois de liberar **pelo menos 5–10 GB**, redeploy no Coolify.

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
