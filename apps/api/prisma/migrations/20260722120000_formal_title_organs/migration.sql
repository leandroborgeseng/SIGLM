-- UnitType: considerandos
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'considerando';

-- Cadastro de órgãos de origem
CREATE TABLE IF NOT EXISTS "origin_orgs" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "origin_orgs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "origin_orgs_nome_key" ON "origin_orgs"("nome");

ALTER TABLE "normative_acts"
  ADD COLUMN IF NOT EXISTS "orgao_origem_id" TEXT;

-- Migra órgãos já cadastrados como texto livre (grafias idênticas consolidam)
INSERT INTO "origin_orgs" ("id", "nome", "ativo", "created_at", "updated_at")
SELECT gen_random_uuid()::text, trimmed, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT TRIM(orgao_origem) AS trimmed
  FROM normative_acts
  WHERE orgao_origem IS NOT NULL AND TRIM(orgao_origem) <> ''
) src
WHERE NOT EXISTS (
  SELECT 1 FROM origin_orgs o WHERE o.nome = src.trimmed
);

UPDATE normative_acts na
SET orgao_origem_id = o.id
FROM origin_orgs o
WHERE na.orgao_origem IS NOT NULL
  AND TRIM(na.orgao_origem) = o.nome
  AND na.orgao_origem_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'normative_acts_orgao_origem_id_fkey'
  ) THEN
    ALTER TABLE "normative_acts"
      ADD CONSTRAINT "normative_acts_orgao_origem_id_fkey"
      FOREIGN KEY ("orgao_origem_id") REFERENCES "origin_orgs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "normative_acts_orgao_origem_id_idx" ON "normative_acts"("orgao_origem_id");
