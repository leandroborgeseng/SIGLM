-- Tipos de anexo ampliados (original, topo, final, histórico)
DO $$ BEGIN
  ALTER TYPE "AttachmentType" ADD VALUE 'anexo_topo';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AttachmentType" ADD VALUE 'anexo_final';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AttachmentType" ADD VALUE 'arquivo_historico';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "attachments"
  ADD COLUMN IF NOT EXISTS "titulo" TEXT,
  ADD COLUMN IF NOT EXISTS "href" TEXT,
  ADD COLUMN IF NOT EXISTS "ordem" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "substituido_em" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "attachments_act_id_ativo_idx" ON "attachments"("act_id", "ativo");
CREATE INDEX IF NOT EXISTS "attachments_act_id_tipo_idx" ON "attachments"("act_id", "tipo");
