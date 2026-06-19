# Prompt para o Cursor — Portal de Legislação Municipal (Franca/SP)

> Copie tudo abaixo (a partir da linha `---`) e cole no Cursor, anexando: `README.md` (especificação completa) e `Portal de Legislação (protótipo).html` (referência visual/comportamental). Os assets de marca estão em `assets/`.

---

Você é um(a) engenheiro(a) full-stack sênior. Vamos construir do zero o **Portal de Legislação Municipal da Prefeitura de Franca/SP** — um sistema para divulgação, consulta, cadastro, importação, OCR, consolidação e publicação de atos normativos (Leis, Leis Complementares, Decretos, Portarias, Resoluções, Instruções Normativas). Modelo de referência: portal do Planalto.

Anexei o `README.md` (**fonte de verdade** — tokens, telas, modelo de dados, requisitos, fluxo e regras) e um **protótipo HTML interativo** que mostra o visual e o comportamento exatos (busca, abas, drag-and-drop, importação, OCR, consolidação). O HTML é **referência de design**, não para copiar — recrie as telas na stack abaixo.

## Stack
- **Backend:** Node.js + NestJS · **PostgreSQL** (full-text search com `tsvector`; opcionalmente Meilisearch depois) · TypeORM/Prisma para migrations.
- **Frontend:** Next.js (App Router) + React + TypeScript · Tailwind CSS · Lucide icons.
- **Auth:** JWT + refresh; **RBAC** por perfil (admin_geral, editor, revisor, publicador, consulta_publica).
- **Importação:** `mammoth.js` (DOCX), `pdf-parse`/`pdf.js` (PDF pesquisável), **Tesseract OCR** (`por`/pt-BR) para PDF digitalizado.
- pt-BR · **light mode apenas** · acessível (WCAG 2.1 AA, foco visível, contraste, toque ≥44px).

## Identidade visual (não inventar cores)
Cole os tokens da seção 1 do README em `globals.css` e crie o `@theme inline` do Tailwind. Azul da marca **#0066CC**; neutros cool-slate; semânticas ok/warn/danger. Fontes: **IBM Plex Sans** (UI) + **IBM Plex Mono** (números/códigos, sempre `tnum`) + **IBM Plex Serif** (corpo do texto legal). Números, códigos de norma, datas e % sempre em mono.

## Regras de domínio invioláveis (seções 4–5 do README)
- Dispositivos **nunca** são excluídos — só marcados revogado/alterado/incluído/substituído; sempre manter **histórico** e a **norma responsável**.
- **Arquivo original nunca substituído**, apenas complementado.
- **Versionamento completo** dos textos (tabela `normative_versions`, validade por data, restaurar versões).
- **Revisão humana obrigatória** antes de publicar texto importado por OCR.
- Consulta pública **sem login**; URLs amigáveis `/legislacao/{tipo}/{ano}/{numero}`.
- **Auditoria** de toda alteração administrativa.

## Ordem de implementação (siga e me mostre o diff a cada etapa)
1. **Modelo de dados + migrations** — as 11 tabelas da seção 4 do README (users, roles, permissions, normative_acts, normative_units, normative_versions, normative_changes, attachments, imports, ocr_results, audit_logs). + **seed**: LC 312/2024 (Código Tributário, consolidada), Decreto 12.450/2026 (revoga o Art. 4º) e Lei 4.987/2026 (nova redação do Art. 3º + inclui Art. 5º).
2. **Auth + RBAC** — login JWT, 5 perfis, guards de permissão, audit log middleware.
3. **API** dos atos e unidades normativas — CRUD, busca full-text, versões, consolidação, importação, OCR.
4. **Design system / componentes** — tokens + Button, Badge, StatusBadge, Chip, Input/Select/Textarea (foco brand-soft), Tabela, Tabs, Toast, Sidebar admin (item ativo com barra brand).
5. **Portal público** — P1 Home/Busca (busca + filtros tipo/situação/ano/assunto) e P2 Página do ato (sumário âncora, abas Consolidado/Original/Histórico, marcações de revogado/alterado/incluído com notas, imprimir, PDF original). Estilo Planalto, corpo em serif.
6. **Painel admin** — A1 Listagem (KPIs + tabela + ações), A2 Editor estruturado (drag-and-drop + validação de hierarquia), A3 Importação DOC/DOCX/PDF com tela de conferência e % de confiança, A4 OCR (scan × texto reconhecido lado a lado, baixa confiança destacada, revisão obrigatória), A5 Consolidação (anterior × nova + nota gerada).
7. **Exportação** consolidada em HTML e PDF; busca textual; responsivo/mobile.

## Entregas
- Commits incrementais por etapa; reaproveite componentes; não recrie do zero o que já existe.
- README de instalação + dados de exemplo funcionando.
- Ao final de cada etapa, liste arquivos criados/alterados e decisões pendentes.

Comece pela **etapa 1 (modelo de dados + migrations + seed)** e me mostre o schema e as migrations antes de seguir.
</content>
