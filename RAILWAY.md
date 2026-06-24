# Deploy no Railway — SIGLM

Guia definitivo para o projeto **SIGLM** (`leandroborgeseng/SIGLM`).

## Arquitetura no Railway

```
Postgres  →  siglm-backend (API NestJS)  →  web (Next.js)
```

| Serviço Railway | Config File | Dockerfile |
|-----------------|-------------|------------|
| **Postgres** | — | template Railway |
| **siglm-backend** | `railway.api.toml` | `apps/api/Dockerfile` |
| **web** | `apps/web/railway.toml` | `apps/web/Dockerfile` |

---

## 1. Postgres

Criado via **+ New → Database → PostgreSQL**. Não precisa de variables manuais.

---

## 2. siglm-backend (API)

### Settings → Build

| Campo | Valor |
|-------|-------|
| Config File | `railway.api.toml` |
| Dockerfile Path | `apps/api/Dockerfile` |
| Root Directory | *(vazio)* |

### Settings → Networking

- **Generate Domain** → anote a URL pública  
  Ex.: `https://backend-production-xxxx.up.railway.app`

### Settings → Volumes

- Mount path: `/app/apps/api/uploads`

### Variables (Raw Editor)

**Apague tudo** e deixe **somente** isto:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=1HOYyqtuN4GUzgu6STch7yvP//i8VUmYW3b/X/IrLrHQdHI88QW/gWEDXu9aHfsx
JWT_REFRESH_SECRET=CsD5+oSJFVUZryJg7BlMW5OG2patCLyRPPIbj0nrZK2tO/vbFrpodC6e48VKXZtX
CORS_ORIGIN=https://siglm.up.railway.app
RUN_SEED=false
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | ✅ | `3001` — porta interna para `siglm-backend.railway.internal:3001` |
| `DATABASE_URL` | ✅ | Add Reference → Postgres |
| `JWT_SECRET` | ✅ | Chave longa aleatória |
| `JWT_REFRESH_SECRET` | ✅ | Outra chave longa |
| `CORS_ORIGIN` | ✅ | `https://siglm.up.railway.app` — só domínio, sem `/legislacao` |
| `RUN_SEED` | ⚠️ | `true` só no **primeiro** deploy; depois `false` |

### Migrations (automático)

A cada deploy/restart do **siglm-backend**, o container executa `prisma migrate deploy` **antes** de subir a API (`prestart` no `npm start`). Não é necessário rodar migration manualmente.

O CI também aplica todas as migrations em Postgres efêmero a cada push na `main`, garantindo que o SQL commitado é válido.

### O que NÃO colocar no siglm-backend

```env
API_URL              ❌ (só no web)
API_INTERNAL_URL     ❌ (só no web)
NEXT_PUBLIC_API_URL  ❌ (só no web)
POSTGRES_*           ❌ (só no Postgres)
API_PORT             ❌ (use PORT=3001)
```

### Teste

```
GET https://SEU-DOMINIO-BACKEND/api/health
→ {"status":"ok","service":"leis-municipais-api"}
```

---

## 3. Web (frontend)

### Settings → Build

| Campo | Valor |
|-------|-------|
| Config File | `apps/web/railway.toml` |
| Dockerfile Path | `apps/web/Dockerfile` |
| Root Directory | *(vazio)* |

### Settings → Networking

- **Generate Domain**  
  Ex.: `https://siglm.up.railway.app`

### Variables (Raw Editor)

**Apague tudo** e deixe **somente** isto (use **Add Reference** no domínio privado):

```env
NODE_ENV=production
API_INTERNAL_URL=http://${{siglm-backend.RAILWAY_PRIVATE_DOMAIN}}:3001/api
API_URL=https://${{siglm-backend.RAILWAY_PUBLIC_DOMAIN}}/api
```

> `API_INTERNAL_URL` tenta rede privada (sem egress). `API_URL` é **fallback** se a privada falhar.
>
> O serviço da API no Railway se chama **`siglm-backend`** → domínio privado `siglm-backend.railway.internal`.
> Use `${{siglm-backend.RAILWAY_PRIVATE_DOMAIN}}` nas referências (nome exato do serviço).

Ou cole a URL fixa (se Add Reference não resolver):

```env
API_INTERNAL_URL=http://siglm-backend.railway.internal:3001/api
```

### O que NÃO colocar no web

```env
NEXT_PUBLIC_API_URL   ❌
DATABASE_URL          ❌
JWT_*                 ❌
```

---

## 4. Ordem de deploy

1. Postgres (Active)
2. **siglm-backend** — aguarde `/api/health` OK
3. Atualize `CORS_ORIGIN` na API com URL exata do web
4. **web** — redeploy após API no ar
5. `RUN_SEED=false` na API

---

## 5. Checklist pós-deploy

- [ ] `GET /api/health` → OK
- [ ] Migrations aplicadas no deploy (logs: `prisma migrate deploy`)
- [ ] `/legislacao` lista atos
- [ ] `/admin/login` funciona
- [ ] `CORS_ORIGIN` = URL exata do web (https, sem barra final)
- [ ] Volume `/app/apps/api/uploads` na API
- [ ] `RUN_SEED=false` após seed
- [ ] Web **não** tem `DATABASE_URL`
- [ ] `./scripts/smoke-test.sh` com `API_URL` e `WEB_URL` de produção

---

## 5.1 Higiene de produção (obrigatório)

1. Definir `RUN_SEED=false` no siglm-backend após o primeiro deploy com seed
2. Trocar senha do usuário admin (não usar `admin123`)
3. Confirmar volume persistente em `/app/apps/api/uploads`
4. Configurar backup do Postgres (Railway ou externo)
5. Verificar logs: `prisma migrate deploy` aplicado com sucesso

- URL: `https://siglm.up.railway.app/admin/login`
- E-mail: `admin@franca.sp.gov.br`
- Senha: `admin123` *(altere em produção)*

---

## 7. Troubleshooting

| Sintoma | Causa | Solução |
|---------|-------|---------|
| `No start command detected` | Railpack em vez de Docker | Config File + Dockerfile corretos |
| `DATABASE_URL not found` | Variável só no Postgres | Add Reference no **siglm-backend** |
| `siglm.railway.internal` (nome errado) | Serviço se chama `siglm-backend` | Use `siglm-backend.railway.internal:3001` |
| `siglm.railway.internal:/api` (porta vazia) | `${{*.PORT}}` não existe entre serviços | Use `:3001` fixo e `PORT=3001` no siglm-backend |
| `http://api:3001/api` no web | `API_INTERNAL_URL` errada | `http://siglm-backend.railway.internal:3001/api` |
| `ts-node ENOENT` no seed | Versão antiga | Pull `main` (seed compila para JS) |
| Application error no web | API offline ou URL errada | Confira `API_URL` e health da API |
| CORS bloqueado | `CORS_ORIGIN` incorreto | URL exata do web na API |
| Uploads somem | Sem volume | Volume em `/app/apps/api/uploads` |

---

## 8. Variáveis de referência Railway

| Sintaxe | Uso |
|---------|-----|
| `${{Postgres.DATABASE_URL}}` | API → banco |
| `${{siglm-backend.RAILWAY_PRIVATE_DOMAIN}}` | → `siglm-backend.railway.internal` |
| `${{siglm-backend.RAILWAY_PUBLIC_DOMAIN}}` | URL pública da API (fallback) |
| `:3001` | Porta fixa (`PORT=3001` no siglm-backend) |
