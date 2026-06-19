# Deploy — Railway e Coolify

Guia para publicar o **LeisMunicipais** com Docker.

## Arquitetura

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| **postgres** | 5432 | PostgreSQL 16 |
| **api** | 3001 | NestJS + Prisma |
| **web** | 3000 | Next.js (standalone) |

Volume persistente: `api_uploads` (PDFs e anexos importados).

---

## 1. GitHub

```bash
cd LeisMunicipais
git init
git add .
git commit -m "LeisMunicipais — portal de legislação municipal"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/leis-municipais.git
git push -u origin main
```

O workflow `.github/workflows/ci.yml` valida build da API e do Web em cada push/PR.

**Não commite:** `.env`, `apps/api/.env`, `apps/web/.env.local`, `apps/api/uploads/*`.

---

## 2. Variáveis de ambiente (produção)

| Variável | Onde | Exemplo |
|----------|------|---------|
| `DATABASE_URL` | API | `postgresql://user:pass@host:5432/leis_municipais?schema=public` |
| `JWT_SECRET` | API | string longa aleatória (32+ chars) |
| `JWT_REFRESH_SECRET` | API | outra string longa |
| `CORS_ORIGIN` | API | `https://leis.seudominio.gov.br` |
| `PORT` | API | `3001` (Railway injeta `PORT` — já suportado) |
| `RUN_SEED` | API | `true` só no **primeiro** deploy |
| `NEXT_PUBLIC_API_URL` | Web (build) | `https://api.seudominio.gov.br/api` |
| `API_INTERNAL_URL` | Web (runtime) | `http://api:3001/api` (Coolify Compose) |

Gere segredos:

```bash
openssl rand -base64 48
```

---

## 3. Coolify (recomendado — Compose)

1. Novo **Project** → **Docker Compose**
2. Conecte o repositório GitHub
3. Compose file: `docker-compose.prod.yml`
4. Crie `.env` no Coolify com:

```env
POSTGRES_PASSWORD=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
CORS_ORIGIN=https://leis.seudominio.gov.br
NEXT_PUBLIC_API_URL=https://api.seudominio.gov.br/api
RUN_SEED=true
```

5. Domínios:
   - `web` → `https://leis.seudominio.gov.br`
   - `api` → `https://api.seudominio.gov.br`
6. Deploy. Após o primeiro deploy com seed, defina `RUN_SEED=false` e redeploy.

**Login demo:** `admin@franca.sp.gov.br` / `admin123` (altere em produção).

---

## 4. Railway (passo a passo — SIGLM)

Repositório: `https://github.com/leandroborgeseng/SIGLM`

### Visão geral

| Serviço Railway | Dockerfile | Domínio |
|-----------------|------------|---------|
| **Postgres** | template Railway | interno |
| **api** | `apps/api/Dockerfile` | `https://siglm-api.up.railway.app` |
| **web** | `apps/web/Dockerfile` | `https://siglm.up.railway.app` |

Ordem recomendada: **Postgres → API → Web → ajustar CORS**.

---

### Passo 1 — Criar projeto

1. Acesse [railway.app](https://railway.app) → **New Project**
2. Escolha **Deploy from GitHub repo**
3. Autorize o GitHub e selecione **`leandroborgeseng/SIGLM`** (branch `main`)

---

### Passo 2 — PostgreSQL

1. No projeto: **+ New** → **Database** → **PostgreSQL**
2. Aguarde provisionar (fica com nome tipo `Postgres`)
3. Na aba **Variables** do Postgres, anote que existe `DATABASE_URL` (uso interno)

---

### Passo 3 — Serviço API

1. **+ New** → **GitHub Repo** → mesmo repo `SIGLM` (ou duplique o serviço já criado)
2. Renomeie o serviço para **`api`**
3. **Settings** → **Build**:
   - **Root Directory:** *(vazio — raiz do repo)*
   - **Config File:** `railway.api.toml`
   - **Dockerfile Path:** `apps/api/Dockerfile` *(confirme que está assim)*
4. **Settings** → **Networking** → **Generate Domain**  
   Exemplo: `siglm-api-production.up.railway.app`  
   Teste depois: `https://SIGLM-API-DOMINIO/api/health`
5. **Variables** — use **Add Reference** (não cole a URL manualmente):
   - Clique **+ New Variable** → **Add Reference**
   - Serviço Postgres → variável **`DATABASE_URL`**
   - Adicione também (Raw Editor ou uma a uma) e clique **Apply Changes**:

```env
JWT_SECRET=<sua chave>
JWT_REFRESH_SECRET=<sua chave>
RUN_SEED=true
CORS_ORIGIN=https://temporario.up.railway.app
NODE_ENV=production
```

> Se `DATABASE_URL` não aparecer, o nome do serviço Postgres pode ser outro (ex.: `PostgreSQL`). Use **Add Reference** e selecione o serviço do banco — não digite `${{Postgres.DATABASE_URL}}` à mão se o nome não bater.

6. **Settings** → **Volumes** → **Add Volume**:
   - Mount path: `/app/apps/api/uploads`
   - (Persiste PDFs e anexos importados)

7. **Deploy** — nos logs deve aparecer:
   - `Aplicando migrations...`
   - `Executando seed...` (se `RUN_SEED=true`)
   - `LeisMunicipais API em http://0.0.0.0:...`

8. Confirme: abra `https://SEU-DOMINIO-API/api/health` → deve retornar OK.

---

### Passo 4 — Serviço Web

1. **+ New** → **GitHub Repo** → `SIGLM`
2. Renomeie para **`web`**
3. **Settings** → **Build**:
   - **Config File:** `apps/web/railway.toml`
   - **Dockerfile Path:** `apps/web/Dockerfile` *(não use o da API!)*
4. **Variables** (importante: usadas no **build** do Next.js):

```env
NEXT_PUBLIC_API_URL=https://SEU-DOMINIO-API/api
```

Substitua `SEU-DOMINIO-API` pelo domínio real gerado no passo 3 (sem barra no final antes de `/api`).

5. **Settings** → **Networking** → **Generate Domain**  
   Exemplo: `siglm-production.up.railway.app`
6. **Deploy** e abra o domínio → `/legislacao` deve listar os atos do seed.

---

### Passo 5 — Ajustar CORS e desligar seed

No serviço **api**, atualize as variables:

```env
CORS_ORIGIN=https://SEU-DOMINIO-WEB
RUN_SEED=false
```

(use a URL exata do web, com `https://`, sem barra final)

**Redeploy** o serviço **api**.

---

### Passo 6 — Login admin

- URL: `https://SEU-DOMINIO-WEB/admin/login`
- Demo: `admin@franca.sp.gov.br` / `admin123`
- **Troque a senha em produção.**

---

### Variáveis de referência Railway

| Sintaxe | Uso |
|---------|-----|
| `${{Postgres.DATABASE_URL}}` | API → banco |
| `${{api.RAILWAY_PUBLIC_DOMAIN}}` | Referência cruzada (opcional) |

### Rede privada (opcional, SSR mais rápido)

No serviço **web**, em runtime você pode definir:

```env
API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}/api
```

Se der erro, use só a URL pública em `NEXT_PUBLIC_API_URL` (funciona normalmente).

---

### Custos e limites

- Plano gratuito: créditos mensais limitados — 3 serviços + Postgres consomem rápido
- OCR/importação PDF: considere plano com mais RAM
- Volume obrigatório para não perder uploads entre deploys

---

## 5. Teste local (stack Docker)

```bash
cp .env.example .env
# Edite JWT_SECRET, POSTGRES_PASSWORD, etc.

docker compose -f docker-compose.prod.yml up -d --build
```

- Portal: http://localhost:3000
- API: http://localhost:3001/api/health

Primeiro deploy com seed:

```bash
RUN_SEED=true docker compose -f docker-compose.prod.yml up -d --build
```

---

## 6. Checklist pós-deploy

- [ ] `GET /api/health` retorna OK
- [ ] Portal `/legislacao` carrega atos
- [ ] Login admin funciona
- [ ] `CORS_ORIGIN` aponta para o domínio do frontend (HTTPS)
- [ ] Volume de uploads persistido
- [ ] `RUN_SEED=false` após seed inicial
- [ ] Trocar senha do usuário admin

---

## 7. Troubleshooting

| Problema | Solução |
|----------|---------|
| **Web pede DATABASE_URL** | O serviço web está usando o Dockerfile da API. Em **web → Settings → Build**, defina Config File `apps/web/railway.toml` e Dockerfile `apps/web/Dockerfile`. Remova `DATABASE_URL` das variables do web. |
| **DATABASE_URL not found (P1012)** | Só no serviço **API** → Variables → **Add Reference** → Postgres → `DATABASE_URL` → **Apply Changes** → Redeploy. |
| **Railpack: No start command detected** | O Railway tentou build Node automático. Em **Settings → Build**, mude o builder para **Dockerfile** e defina `apps/api/Dockerfile` (API) ou `apps/web/Dockerfile` (Web). O repo inclui `railway.toml` para forçar Docker na API. |
| Web 500 / não conecta API | Confira `NEXT_PUBLIC_API_URL` e `API_INTERNAL_URL` |
| CORS bloqueado | `CORS_ORIGIN` deve ser exatamente a URL do frontend |
| Migrations falham | Verifique `DATABASE_URL` e se Postgres está acessível |
| Uploads somem | Monte volume em `/app/apps/api/uploads` |
| OCR lento | Normal em container pequeno; considere mais RAM |
