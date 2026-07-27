-- AlterTable
ALTER TABLE "normative_acts" ADD COLUMN "responsavel_estruturacao_id" TEXT;
ALTER TABLE "normative_acts" ADD COLUMN "responsavel_revisao_id" TEXT;

-- AddForeignKey
ALTER TABLE "normative_acts" ADD CONSTRAINT "normative_acts_responsavel_estruturacao_id_fkey" FOREIGN KEY ("responsavel_estruturacao_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "normative_acts" ADD CONSTRAINT "normative_acts_responsavel_revisao_id_fkey" FOREIGN KEY ("responsavel_revisao_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "normative_acts_responsavel_estruturacao_id_idx" ON "normative_acts"("responsavel_estruturacao_id");
CREATE INDEX "normative_acts_responsavel_revisao_id_idx" ON "normative_acts"("responsavel_revisao_id");
