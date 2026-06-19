# Handoff — Portal de Legislação Municipal (Prefeitura de Franca/SP)

Sistema web para **divulgação, consulta, cadastro, organização, consolidação e publicação de atos normativos municipais** (Leis, Leis Complementares, Decretos, Portarias, Resoluções, Instruções Normativas e demais atos). Modelo de referência: portal de legislação do Planalto, com cada ato em HTML limpo, pesquisável e navegável por artigos, parágrafos, incisos, alíneas e itens.

---

## 0. Sobre os arquivos deste pacote

Os arquivos `.html` aqui são **referências de design criadas em HTML** — protótipos que mostram o visual e o comportamento pretendidos, **não código de produção para copiar**. A tarefa é **recriar estas telas no ambiente do projeto** (a stack escolhida abaixo), usando padrões e bibliotecas próprias. O protótipo demonstra layout, estados, interações (busca filtra, abas, drag-and-drop, OCR, consolidação) e a identidade visual.

| Arquivo | O que é |
|---|---|
| `Portal de Legislação (protótipo).html` | Protótipo interativo de todas as telas (público + admin). Abra no navegador; use a barra inferior para navegar entre telas. **Fonte de verdade visual/comportamental.** |
| `assets/franca-mark.png` | Marca da Prefeitura (cata-vento). |
| `assets/franca-lockup.png` | Lockup institucional completo. |
| `PROMPT-CURSOR.md` | Prompt pronto para colar no Cursor. |

**Fidelidade:** alta (hifi). Cores, tipografia, espaçamentos e interações são finais — recrie pixel-a-pixel com as bibliotecas da stack.

---

## 1. Identidade visual GestOP (design tokens)

Idioma **pt-BR**, **light mode apenas**. Sensação gov-tech institucional, limpa e legível.

```css
:root {
  /* Marca */
  --brand: #0066CC;        /* primária: botões, links, nav ativo */
  --brand-hover: #005BB5;  /* hover */
  --brand-bright: #1E7BD6; /* acento / dados secundários */
  --brand-soft: #E8F1FC;   /* fundo tonal: chips, nav ativo, ícones */

  /* Neutros (cool slate) */
  --canvas: #F3F6FB;       /* fundo da aplicação */
  --surface: #FFFFFF;      /* cards, painéis */
  --surface-2: #FAFBFD;    /* fundo sutil / hover de linhas */
  --ink: #0F1B2D;          /* texto principal */
  --ink-2: #36465B;        /* texto secundário forte */
  --ink-3: #647389;        /* texto secundário / descrições */
  --ink-4: #97A3B6;        /* terciário / placeholders */
  --line: #E5EAF1;         /* bordas */
  --line-2: #EEF2F8;       /* divisores sutis */

  /* Semânticas — texto / fundo / borda */
  --ok: #15924E;     --ok-bg: #E5F4EB;     --ok-bd: #BFE4CD;     /* vigente / sucesso */
  --warn: #B5680A;   --warn-bg: #FBF0DD;   --warn-bd: #F0D8AE;   /* alterado / atenção / baixa confiança */
  --danger: #D62B2B; --danger-bg: #FBE9E9; --danger-bd: #F2C9C9; /* revogado / crítico */
  --muted: #5B6B82;  --muted-bg: #EDF1F6;                        /* neutro */
  --off: #8A97A8;                                                /* inativo */

  /* Raio */
  --r-card: 14px; --r-md: 10px; --r-sm: 8px; --r-pill: 999px;

  /* Elevação */
  --sh-sm: 0 1px 2px rgba(15,27,45,.06), 0 1px 1px rgba(15,27,45,.03);
  --sh-md: 0 6px 22px -8px rgba(15,27,45,.14), 0 2px 6px -2px rgba(15,27,45,.06);
  --sh-lg: 0 22px 54px -16px rgba(15,27,45,.28);

  /* Layout */
  --sb-w: 264px; --topbar-h: 60px;

  --font: "IBM Plex Sans", system-ui, -apple-system, Segoe UI, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --serif: "IBM Plex Serif", Georgia, serif; /* corpo do texto legal (estilo Planalto) */
}
```

### Tipografia
- **IBM Plex Sans** — UI, títulos, controles. Pesos 400/500/600/700.
- **IBM Plex Mono** — números, códigos (LC 312/2024), datas, % de confiança, IDs. Sempre `font-feature-settings: "tnum" 1`.
- **IBM Plex Serif** — corpo do texto da norma na página pública e nas comparações (leitura tipo Planalto). Pesos 400/500/600.
- Import Google Fonts: `IBM+Plex+Sans:wght@400;500;600;700` + `IBM+Plex+Mono:wght@400;500;600` + `IBM+Plex+Serif:wght@400;500;600`.
- Escala: page-title 23px/700/-.025em · kicker 11.5px/600/.07em/uppercase/brand · ementa (serif) 26px/600 · body 13.5–14px · KPI value 28–30px/600 mono · meta 11.5–12px/ink-3 · section 11px/700/uppercase/ink-4. Texto nunca < 11px; toque mínimo mobile 44px.

### Componentes base (já especificados visualmente no protótipo)
- **Button** — h 38px (md)/36px(sm)/34px(xs), radius 10px, 13.5px/600, gap 7px p/ ícone. Variantes: `filled` (brand/branco, hover #005BB5), `tonal` (brand-soft), `outlined`, `ghost`, `danger`.
- **IconButton** — 30–36px quadrado, radius 8–10px, hover muda borda/cor p/ brand.
- **StatusBadge** (situação) — pílula com dot. Mapas: vigente=ok, consolidado=brand, alterado/parc. revogado=warn, revogado=off.
- **Badge** — pílula sólida pequena (info/warn/danger/ok/neutral).
- **Chip / item de filtro** — togglável; ativo = fundo brand-soft + texto brand; count em mono.
- **Input/Select/Textarea** — h 38px, radius 10px, foco = borda brand + `box-shadow: 0 0 0 3px #E8F1FC`.
- **Tabela** — cabeçalho ink-4 uppercase sobre surface-2; linhas divisor line-2; hover surface-2.
- **Tabs** — sublinhado animado 2px brand na aba ativa.
- **Toast** — fundo `--ink`, inferior-centro, ~2.6s.
- **Sidebar** (admin) 264px: marca + nav agrupada (Gestão/Configuração) + rodapé usuário; item ativo = fundo brand-soft, texto brand-hover, barra 3px brand à esquerda.

---

## 2. Telas (views)

> No protótipo, navegue por: **Público** → Home/Busca, Página do ato · **Admin** → Login, Atos, Editor, Importar, OCR, Consolidar.

### PÚBLICO

**P1 · Home / Busca** — `/legislacao`
- Header branco (marca + “Portal de Legislação · Prefeitura de Franca/SP” + botão “Área administrativa”).
- Hero brand (gradiente `#0066CC→#1E7BD6`): título, campo de busca grande (branco, radius 14px) + buscas frequentes (chips).
- Corpo 2 colunas: **filtros** (sticky, esquerda) + **resultados** (direita).
  - Filtros: **Tipo do ato** (Todos, Lei Complementar, Lei, Decreto, Portaria, Resolução, Instrução Normativa) com contagem; **Situação** (vigente, consolidado, parcialmente revogado, revogado) com dot colorido. Também previstos no spec: filtro por número, ano, data de publicação, assunto/palavras-chave.
  - Resultado = card clicável: código (mono, ex. `Lei Complementar nº 312/2024`), badge de situação, data de publicação, ementa, órgão. Hover destaca borda brand.
- Estado vazio quando filtros não retornam nada.

**P2 · Página do ato** — `/legislacao/{tipo}/{ano}/{numero}` (URLs amigáveis, ex.: `/legislacao/lei-complementar/2024/312`, `/legislacao/decreto/2026/12450`)
- Header sticky compacto + ações: **Imprimir** (`window.print()`), **PDF do Diário Oficial** (download do original).
- 2 colunas: **sumário** lateral sticky (links âncora para cada artigo) + **artigo** (coluna central).
- Cabeçalho: código (mono) + badge situação; **ementa em serif 26px**; metadados (data, publicação, órgão, assunto).
- **Abas:** `Texto consolidado` | `Texto original` | `Histórico de alterações`.
- Corpo do texto (serif, line-height 1.75), hierárquico: preâmbulo centralizado em itálico → TÍTULO/CAPÍTULO (centralizado, 600) → artigos (`Art. Nº` em bold + texto) → incisos/alíneas/itens indentados.
- **Marcação de alterações:**
  - *Consolidado:* dispositivo revogado = texto tachado (ink-4) + nota; alterado = nova redação + nota; incluído = texto + nota.
  - *Original:* alterado mostra a redação original; incluído mostra “(dispositivo não constava do texto original)”.
  - Notas (pílula sob o dispositivo): “Redação dada pela Lei nº X/AAAA” (warn), “Revogado pelo Decreto nº X/AAAA” (danger), “Incluído pela Lei nº X/AAAA” (ok).
- **Histórico:** timeline cronológica (publicação original → alterações → revogações) com norma responsável, data e descrição.

### ADMIN

**A0 · Login** — split: painel marca gradiente (lockup, headline) + card form (e-mail funcional, senha, “Entrar no painel”, perfil de demonstração). Estados previstos: loading, erro, sessão expirada, força de senha.

**A1 · Atos normativos (listagem)** — shell admin (sidebar 264px + topbar). KPIs (total, vigentes, aguardando revisão, importações no mês). Tabela: Norma (mono) · Ementa · Situação (badge) · Publicação (mono) · Ações (Editar, Consolidar, Ver público). Botões de topo: **Importar arquivo**, **Novo ato**. Filtros/chips por situação.

**A2 · Editor de texto estruturado** — topbar (voltar, “Salvar rascunho”, “Enviar para revisão”). 2 colunas:
- **Metadados:** tipo, número, ano, data do ato, publicação, ementa, situação, assunto, órgão, palavras-chave, autoridade signatária, observações internas, **arquivo original PDF** (preservado, nunca substituído) e arquivo digitalizado.
- **Texto estruturado:** lista de dispositivos, cada um = unidade independente (tipo · identificação · status badge · texto). **Reordenável por arrastar-e-soltar** (HTML5 drag-and-drop) e por setas ↑/↓. Botão “Adicionar dispositivo”. Indicador de **validação da hierarquia** (“Hierarquia válida”). Incisos indentados.

**A3 · Importação e conferência** — `DOC/DOCX/PDF pesquisável/PDF digitalizado`. Stepper (Upload → **Conferência** → Publicação). Chip do arquivo (ex.: `lei-4987-2026.docx`, lib usada). 2 colunas: **arquivo original** (preview) × **estrutura identificada** (cada parte com tag — Ementa/Preâmbulo/Art. — e **% de confiança**; baixa confiança <80% sinalizada em warn “revise manualmente”). Ações: “Corrigir no editor”, “Confirmar e salvar como rascunho”. Tela de conferência **obrigatória** antes de publicar.

**A4 · OCR (PDF digitalizado)** — Tesseract OCR, idioma por-BR. Banner **revisão humana obrigatória**. 2 colunas lado a lado: **PDF original (scan)** × **texto reconhecido (editável)**, com % de confiança por linha e **trechos de baixa confiança destacados** (fundo warn). Ações: “Reprocessar OCR”, “Revisar e aprovar”.

**A5 · Consolidação normativa** — definição da alteração (norma alteradora, norma alterada, dispositivo, **tipo**: inclusão / alteração de redação / revogação parcial / revogação total). Comparação **redação anterior** (tachada, painel danger) × **nova redação** (painel ok). **Nota de alteração gerada automaticamente** (“Redação dada pela Lei nº X/2026”). Regra: original preservado; nova redação vinculada à norma alteradora com data e fundamento. Ação “Aplicar consolidação”.

---

## 3. Interações & comportamento (no protótipo)
- **Busca** filtra a lista em tempo real (número, ementa, assunto, palavras-chave) combinada com filtros de tipo e situação.
- **Abas do ato** trocam o corpo (consolidado/original/histórico) recomputando marcações.
- **Editor:** drag-and-drop reordena dispositivos (`onDragStart/onDragOver/onDrop`), setas ↑/↓ como alternativa, “Adicionar dispositivo” insere unidade.
- **Toasts** confirmam ações (salvar, enviar, confirmar import, aprovar OCR, aplicar consolidação).
- **Responsivo:** <920px o sumário/sidebar recolhem e grids empilham (1 coluna). Mobile: app bar + navegação inferior.
- Transições suaves (fade/slide ~.2–.26s).

---

## 4. Modelagem do banco de dados (PostgreSQL)

Tabelas mínimas (relacional, com versionamento e auditoria):

1. **users** — id, nome, email, hash_senha, role_id, ativo, timestamps.
2. **roles** — id, nome (admin_geral, editor, revisor, publicador, consulta).
3. **permissions** — id, chave; + **role_permissions** (N:N).
4. **normative_acts** — id, tipo, numero, ano, data_ato, data_publicacao, ementa, assunto, palavras_chave[], situacao (vigente/revogado/parcialmente_revogado/alterado/consolidado), orgao_origem, autoridade_signataria, slug (URL amigável), observacoes_internas, status_publicacao (rascunho/em_revisao/publicado), timestamps.
5. **normative_units** — id, act_id→acts, tipo_unidade (titulo/livro/capitulo/secao/subsecao/artigo/paragrafo/inciso/alinea/item/anexo), identificacao (ex. “Art. 3º”, “I”), texto, ordem, parent_unit_id (hierarquia), status (vigente/revogada/alterada/incluida), origem_act_id (norma de origem), alterado_por_act_id, data_alteracao.
6. **normative_versions** — id, unit_id, texto, valido_de, valido_ate, origem_act_id, criado_em (versão por data; permite restaurar versões anteriores).
7. **normative_changes** — id, norma_alteradora_act_id, norma_alterada_act_id, unit_id, tipo_alteracao (inclusao/alteracao_redacao/revogacao_parcial/revogacao_total), texto_anterior, texto_novo, nota_gerada, fundamento, data, autor_id.
8. **attachments** — id, act_id, tipo (pdf_original/digitalizado/anexo), url, nome, tamanho, hash, criado_em. (Original **nunca** substituído, apenas complementado.)
9. **imports** — id, act_id, arquivo, formato (doc/docx/pdf/pdf_ocr), lib, status, estrutura_detectada (jsonb), criado_por, criado_em.
10. **ocr_results** — id, import_id, pagina, texto, confianca (por linha/bloco jsonb), revisado_por, revisado_em.
11. **audit_logs** — id, user_id, acao, entidade, entidade_id, diff (jsonb), ip, criado_em (toda alteração administrativa).

---

## 5. Requisitos técnicos

1. **Stack sugerida:** Backend Node.js (NestJS ou Express) **ou** Laravel **ou** Django · Frontend React/Next.js ou Vue · **PostgreSQL** · **Tesseract OCR** · extração DOCX **mammoth.js** · extração PDF **pdf-parse / pdf.js**.
2. **API** REST ou GraphQL.
3. **Auth** JWT ou sessão segura; **controle de permissões por perfil** (RBAC).
4. **Auditoria** de toda alteração administrativa.
5. **Design responsivo**; interface pública limpa, acessível (WCAG 2.1 AA) e rápida.
6. **Busca textual** no PostgreSQL (full-text/`tsvector`) ou Meilisearch/Elasticsearch — por qualquer palavra do texto da norma.
7. **Versionamento completo** dos textos; **arquivo original nunca substituído**.
8. **URLs amigáveis** por slug (`/legislacao/{tipo}/{ano}/{numero}`).

### Perfis de usuário
Administrador geral · Editor legislativo · Revisor · Publicador · Consulta pública.

### Fluxo ideal
1. Cadastra ou importa a norma → 2. Sistema extrai texto → 3. Separa dispositivos automaticamente → 4. Usuário revisa estrutura → 5. Salva rascunho → 6. Revisor valida → 7. Publicador publica → 8. Ato disponível em HTML no portal → 9. Alterações futuras alimentam a consolidação.

### Regras invioláveis
1. Não excluir dispositivos — apenas marcar revogado/alterado/substituído.
2. Sempre manter histórico e indicar a norma responsável por cada alteração.
3. Consulta pública em HTML **sem login**.
4. Anexar PDF original do Diário Oficial (preservado).
5. Exportar versão consolidada em HTML e PDF.
6. Busca por qualquer palavra do texto.
7. Cadastrar leis antigas digitalizadas via OCR.
8. **Revisão humana obrigatória** antes de publicar textos importados por OCR.

---

## 6. Entregáveis esperados (backend a construir)
Estrutura do projeto · modelagem + migrations · backend funcional · frontend público · painel admin · módulo importação DOC/DOCX/PDF · módulo OCR · módulo de consolidação · README de instalação · dados de exemplo (uma lei, um decreto e uma lei alteradora — ver os exemplos já modelados no protótipo: LC 312/2024, Decreto 12.450/2026 e Lei 4.987/2026).

Priorize **arquitetura limpa, segurança, versionamento, rastreabilidade** e **facilidade de uso para servidores sem conhecimento técnico**.
</content>
