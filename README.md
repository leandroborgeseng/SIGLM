# LeisMunicipais

Sistema web para **divulgação, consulta, cadastro, importação, OCR, consolidação e publicação de atos normativos municipais** — Prefeitura de Franca/SP.

> O design visual deriva de um projeto anterior (GestOP); o produto se chama **LeisMunicipais**.

## Stack

| Camada | Tecnologia |
|--------|------------|
| API | NestJS + Prisma |
| Banco | PostgreSQL 16 (full-text `tsvector`) |
| Frontend | Next.js 15 + Tailwind CSS 4 + Lucide |
| Auth | JWT + RBAC (próxima etapa) |

## Pré-requisitos

- Node.js ≥ 20
- Docker (para PostgreSQL)

## Instalação

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local   # quando o frontend estiver ativo

# 3. Banco de dados
npm run db:up
npm run db:migrate
npm run db:seed

# 4. API + Frontend
npm run dev:api   # http://localhost:3001/api
npm run dev:web   # http://localhost:3000
```

A API sobe em `http://localhost:3001/api`. O frontend em `http://localhost:3000`.

### URLs do frontend

| URL | Tela |
|-----|------|
| http://localhost:3000/legislacao | Portal público — busca e filtros |
| http://localhost:3000/legislacao/lei-complementar/2024/312 | Página do ato (LC 312/2024) |
| http://localhost:3000/admin/login | Login administrativo |
| http://localhost:3000/admin/atos | Listagem de atos (KPIs + tabela) |
| http://localhost:3000/admin/importar | Importação e conferência (OCR automático em PDF digitalizado) |
| http://localhost:3000/admin/consolidar | Consolidação normativa |

### Endpoints de verificação

- `GET /api/health` — status da API
- `GET /api/stats` — contagem de atos, dispositivos e usuários
- `POST /api/auth/login` — `{ "email", "senha" }` → JWT access + refresh
- `POST /api/auth/refresh` — `{ "refreshToken" }`
- `GET /api/auth/me` — usuário autenticado (header `Authorization: Bearer`)

- `GET /api/public/acts?q=ISS` — busca full-text (ementa, assunto, palavras-chave e texto dos dispositivos)
- `GET /api/public/acts/:tipo/:ano/:numero/export.html` — exportar texto consolidado em HTML
- `GET /api/public/acts/:tipo/:ano/:numero/export.pdf` — exportar texto consolidado em PDF
- `GET /api/public/attachments/:id/file` — download do PDF do Diário Oficial / anexos

Rotas `/api/admin/*` exigem JWT e permissão RBAC (`acts:read`, etc.).

### Credenciais de demonstração

| Campo | Valor |
|-------|-------|
| E-mail | `admin@franca.sp.gov.br` |
| Senha | `admin123` |

## Dados de exemplo (seed)

| Norma | Slug | Papel no cenário |
|-------|------|------------------|
| LC 312/2024 | `lei-complementar/2024/312` | Código Tributário (texto base) |
| Lei 4.987/2026 | `lei/2026/4987` | Altera Art. 3º + inclui Art. 5º |
| Decreto 12.450/2026 | `decreto/2026/12450` | Revoga Art. 4º |

## Modelo de dados

11 tabelas conforme especificação do handoff:

`users` · `roles` · `permissions` · `role_permissions` · `normative_acts` · `normative_units` · `normative_versions` · `normative_changes` · `attachments` · `imports` · `ocr_results` · `audit_logs`

Schema em [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma).

## Estrutura do monorepo

```
LeisMunicipais/
├── apps/
│   ├── api/          # NestJS + Prisma
│   └── web/          # Next.js (etapas futuras)
├── design_handoff_portal_legislacao/   # protótipo e spec visual
├── docker-compose.yml
└── package.json
```

## Próximas etapas

Todas as etapas do MVP foram concluídas:

1. ~~Modelo de dados + migrations + seed~~
2. ~~Auth + RBAC (JWT, guards, audit log)~~
3. ~~CRUD atos/dispositivos + editor funcional~~
4. ~~Consolidação end-to-end (A5)~~
5. ~~Importação DOC/DOCX/PDF (A3) + OCR (A4)~~
6. ~~Busca full-text (tsvector)~~
7. ~~Exportação HTML/PDF + download Diário Oficial~~
8. ~~Mobile/responsivo + WCAG + marca Franca~~

### Melhorias implementadas (pós-MVP)

- Filtros avançados na busca pública (número, assunto, data de publicação)
- Preview DOCX na importação
- RBAC na UI do painel admin (menu e ações por permissão)
- Restaurar versões anteriores de dispositivos no editor
- Processamento assíncrono de importação/OCR (status `processando` + polling)

### Melhorias futuras

- Fila Bull/Redis dedicada para OCR em alta escala (opcional `REDIS_URL`)

## Deploy (Railway / Coolify)

Dockerfiles em `apps/api/Dockerfile` e `apps/web/Dockerfile`. Stack completa:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Guia passo a passo: [`COOLIFY.md`](COOLIFY.md) (Coolify) · [`RAILWAY.md`](RAILWAY.md) (Railway) · [`DEPLOY.md`](DEPLOY.md) (referência geral) · [`BACKUP.md`](BACKUP.md) (Restic).

## Design

Tokens visuais e telas estão em [`design_handoff_portal_legislacao/README.md`](design_handoff_portal_legislacao/README.md). Abra o protótipo HTML no navegador como referência visual.
