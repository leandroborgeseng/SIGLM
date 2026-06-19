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

## 4. Railway

Crie **3 serviços** no mesmo projeto:

### A) PostgreSQL
- Add-on **PostgreSQL**
- Copie `DATABASE_URL` para o serviço API

### B) API
- **New Service** → GitHub repo
- **Root Directory:** `/` (raiz do monorepo)
- **Dockerfile Path:** `apps/api/Dockerfile`
- Variables:
  - `DATABASE_URL` (referência ao Postgres)
  - `JWT_SECRET`, `JWT_REFRESH_SECRET`
  - `CORS_ORIGIN` = URL pública do frontend
  - `RUN_SEED=true` (primeiro deploy)
- Gere domínio público, ex.: `https://leis-api.up.railway.app`
- A API responde em `/api/health`

### C) Web
- **New Service** → mesmo repo
- **Dockerfile Path:** `apps/web/Dockerfile`
- **Build Args:** `NEXT_PUBLIC_API_URL=https://leis-api.up.railway.app/api`
- **Runtime Variables:** `API_INTERNAL_URL` não é necessário se SSR usar URL pública; para rede privada Railway use a URL interna do serviço API + `/api`
- Domínio público do frontend

> Railway: use a URL **pública** da API em `NEXT_PUBLIC_API_URL` (com sufixo `/api`).

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
| Web 500 / não conecta API | Confira `NEXT_PUBLIC_API_URL` e `API_INTERNAL_URL` |
| CORS bloqueado | `CORS_ORIGIN` deve ser exatamente a URL do frontend |
| Migrations falham | Verifique `DATABASE_URL` e se Postgres está acessível |
| Uploads somem | Monte volume em `/app/apps/api/uploads` |
| OCR lento | Normal em container pequeno; considere mais RAM |
