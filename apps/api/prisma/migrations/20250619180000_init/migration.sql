-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ActType" AS ENUM ('lei_complementar', 'lei', 'decreto', 'portaria', 'resolucao', 'instrucao_normativa');

-- CreateEnum
CREATE TYPE "ActSituacao" AS ENUM ('vigente', 'revogado', 'parcialmente_revogado', 'alterado', 'consolidado');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('rascunho', 'em_revisao', 'publicado');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('titulo', 'livro', 'capitulo', 'secao', 'subsecao', 'artigo', 'paragrafo', 'inciso', 'alinea', 'item', 'anexo', 'preambulo', 'ementa');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('vigente', 'revogada', 'alterada', 'incluida');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('inclusao', 'alteracao_redacao', 'revogacao_parcial', 'revogacao_total');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('pdf_original', 'digitalizado', 'anexo');

-- CreateEnum
CREATE TYPE "ImportFormat" AS ENUM ('doc', 'docx', 'pdf', 'pdf_ocr');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('upload', 'conferencia', 'rascunho', 'publicado', 'erro');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hash_senha" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "normative_acts" (
    "id" TEXT NOT NULL,
    "tipo" "ActType" NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "data_ato" DATE,
    "data_publicacao" DATE,
    "ementa" TEXT NOT NULL,
    "assunto" TEXT,
    "palavras_chave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "situacao" "ActSituacao" NOT NULL DEFAULT 'vigente',
    "orgao_origem" TEXT,
    "autoridade_signataria" TEXT,
    "slug" TEXT NOT NULL,
    "observacoes_internas" TEXT,
    "status_publicacao" "PublicationStatus" NOT NULL DEFAULT 'rascunho',
    "search_vector" tsvector,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "normative_acts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normative_units" (
    "id" TEXT NOT NULL,
    "act_id" TEXT NOT NULL,
    "tipo_unidade" "UnitType" NOT NULL,
    "identificacao" TEXT,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "parent_unit_id" TEXT,
    "status" "UnitStatus" NOT NULL DEFAULT 'vigente',
    "origem_act_id" TEXT,
    "alterado_por_act_id" TEXT,
    "data_alteracao" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "normative_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normative_versions" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "valido_de" DATE NOT NULL,
    "valido_ate" DATE,
    "origem_act_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normative_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normative_changes" (
    "id" TEXT NOT NULL,
    "norma_alteradora_act_id" TEXT NOT NULL,
    "norma_alterada_act_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "tipo_alteracao" "ChangeType" NOT NULL,
    "texto_anterior" TEXT,
    "texto_novo" TEXT,
    "nota_gerada" TEXT,
    "fundamento" TEXT,
    "data" DATE NOT NULL,
    "autor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normative_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "act_id" TEXT NOT NULL,
    "tipo" "AttachmentType" NOT NULL,
    "url" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tamanho" INTEGER,
    "hash" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "act_id" TEXT,
    "arquivo" TEXT NOT NULL,
    "formato" "ImportFormat" NOT NULL,
    "lib" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'upload',
    "estrutura_detectada" JSONB,
    "criado_por" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_results" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "pagina" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "confianca" JSONB NOT NULL,
    "revisado_por" TEXT,
    "revisado_em" TIMESTAMP(3),

    CONSTRAINT "ocr_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nome_key" ON "roles"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_chave_key" ON "permissions"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "normative_acts_slug_key" ON "normative_acts"("slug");

-- CreateIndex
CREATE INDEX "normative_acts_tipo_ano_numero_idx" ON "normative_acts"("tipo", "ano", "numero");

-- CreateIndex
CREATE INDEX "normative_acts_situacao_idx" ON "normative_acts"("situacao");

-- CreateIndex
CREATE INDEX "normative_acts_status_publicacao_idx" ON "normative_acts"("status_publicacao");

-- CreateIndex
CREATE UNIQUE INDEX "normative_acts_tipo_numero_ano_key" ON "normative_acts"("tipo", "numero", "ano");

-- CreateIndex
CREATE INDEX "normative_units_act_id_ordem_idx" ON "normative_units"("act_id", "ordem");

-- CreateIndex
CREATE INDEX "normative_units_parent_unit_id_idx" ON "normative_units"("parent_unit_id");

-- CreateIndex
CREATE INDEX "normative_versions_unit_id_valido_de_idx" ON "normative_versions"("unit_id", "valido_de");

-- CreateIndex
CREATE INDEX "normative_changes_norma_alterada_act_id_idx" ON "normative_changes"("norma_alterada_act_id");

-- CreateIndex
CREATE INDEX "normative_changes_norma_alteradora_act_id_idx" ON "normative_changes"("norma_alteradora_act_id");

-- CreateIndex
CREATE INDEX "attachments_act_id_idx" ON "attachments"("act_id");

-- CreateIndex
CREATE INDEX "ocr_results_import_id_pagina_idx" ON "ocr_results"("import_id", "pagina");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidade_id_idx" ON "audit_logs"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_criado_em_idx" ON "audit_logs"("criado_em");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_units" ADD CONSTRAINT "normative_units_act_id_fkey" FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_units" ADD CONSTRAINT "normative_units_parent_unit_id_fkey" FOREIGN KEY ("parent_unit_id") REFERENCES "normative_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_units" ADD CONSTRAINT "normative_units_origem_act_id_fkey" FOREIGN KEY ("origem_act_id") REFERENCES "normative_acts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_units" ADD CONSTRAINT "normative_units_alterado_por_act_id_fkey" FOREIGN KEY ("alterado_por_act_id") REFERENCES "normative_acts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_versions" ADD CONSTRAINT "normative_versions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "normative_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_versions" ADD CONSTRAINT "normative_versions_origem_act_id_fkey" FOREIGN KEY ("origem_act_id") REFERENCES "normative_acts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_changes" ADD CONSTRAINT "normative_changes_norma_alteradora_act_id_fkey" FOREIGN KEY ("norma_alteradora_act_id") REFERENCES "normative_acts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_changes" ADD CONSTRAINT "normative_changes_norma_alterada_act_id_fkey" FOREIGN KEY ("norma_alterada_act_id") REFERENCES "normative_acts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_changes" ADD CONSTRAINT "normative_changes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "normative_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_changes" ADD CONSTRAINT "normative_changes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_act_id_fkey" FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_act_id_fkey" FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_results" ADD CONSTRAINT "ocr_results_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_results" ADD CONSTRAINT "ocr_results_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Full-text search (português)
CREATE INDEX "normative_acts_search_vector_idx" ON "normative_acts" USING GIN ("search_vector");
