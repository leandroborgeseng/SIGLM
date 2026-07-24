-- OriginOrg: sigla opcional
ALTER TABLE "origin_orgs" ADD COLUMN IF NOT EXISTS "sigla" TEXT;

-- Meios de publicação
CREATE TABLE IF NOT EXISTS "publication_mediums" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_mediums_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "publication_mediums_nome_key" ON "publication_mediums"("nome");

-- Signatários cadastrados
CREATE TABLE IF NOT EXISTS "signatories" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "orgao_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "signatories_orgao_id_idx" ON "signatories"("orgao_id");
CREATE INDEX IF NOT EXISTS "signatories_ativo_idx" ON "signatories"("ativo");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signatories_orgao_id_fkey'
  ) THEN
    ALTER TABLE "signatories"
      ADD CONSTRAINT "signatories_orgao_id_fkey"
      FOREIGN KEY ("orgao_id") REFERENCES "origin_orgs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Join N:N órgãos de origem do ato
CREATE TABLE IF NOT EXISTS "act_origin_orgs" (
    "act_id" TEXT NOT NULL,
    "orgao_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "act_origin_orgs_pkey" PRIMARY KEY ("act_id","orgao_id")
);

CREATE INDEX IF NOT EXISTS "act_origin_orgs_orgao_id_idx" ON "act_origin_orgs"("orgao_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'act_origin_orgs_act_id_fkey'
  ) THEN
    ALTER TABLE "act_origin_orgs"
      ADD CONSTRAINT "act_origin_orgs_act_id_fkey"
      FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'act_origin_orgs_orgao_id_fkey'
  ) THEN
    ALTER TABLE "act_origin_orgs"
      ADD CONSTRAINT "act_origin_orgs_orgao_id_fkey"
      FOREIGN KEY ("orgao_id") REFERENCES "origin_orgs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Copia órgão único legado → join com ordem=0
INSERT INTO "act_origin_orgs" ("act_id", "orgao_id", "ordem")
SELECT na.id, na.orgao_origem_id, 0
FROM "normative_acts" na
WHERE na.orgao_origem_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "act_origin_orgs" aoo
    WHERE aoo.act_id = na.id AND aoo.orgao_id = na.orgao_origem_id
  );

-- Signatários vinculados ao ato (snapshot nome/cargo)
CREATE TABLE IF NOT EXISTS "act_signatories" (
    "id" TEXT NOT NULL,
    "act_id" TEXT NOT NULL,
    "signatory_id" TEXT,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "act_signatories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "act_signatories_act_id_ordem_idx" ON "act_signatories"("act_id", "ordem");
CREATE INDEX IF NOT EXISTS "act_signatories_signatory_id_idx" ON "act_signatories"("signatory_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'act_signatories_act_id_fkey'
  ) THEN
    ALTER TABLE "act_signatories"
      ADD CONSTRAINT "act_signatories_act_id_fkey"
      FOREIGN KEY ("act_id") REFERENCES "normative_acts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'act_signatories_signatory_id_fkey'
  ) THEN
    ALTER TABLE "act_signatories"
      ADD CONSTRAINT "act_signatories_signatory_id_fkey"
      FOREIGN KEY ("signatory_id") REFERENCES "signatories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Campos novos em normative_acts (preserva data_publicacao existente)
ALTER TABLE "normative_acts"
  ADD COLUMN IF NOT EXISTS "meio_publicacao_id" TEXT,
  ADD COLUMN IF NOT EXISTS "prefixo_titulo_modo" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "prefixo_titulo" TEXT,
  ADD COLUMN IF NOT EXISTS "ato_conjunto" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'normative_acts_meio_publicacao_id_fkey'
  ) THEN
    ALTER TABLE "normative_acts"
      ADD CONSTRAINT "normative_acts_meio_publicacao_id_fkey"
      FOREIGN KEY ("meio_publicacao_id") REFERENCES "publication_mediums"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "normative_acts_meio_publicacao_id_idx" ON "normative_acts"("meio_publicacao_id");

-- Tipo de anexo: arquivo da publicação oficial
DO $$ BEGIN
  ALTER TYPE "AttachmentType" ADD VALUE 'arquivo_publicacao';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
