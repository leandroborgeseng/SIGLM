import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string;
  acao: string;
  entidade: string;
  entidadeId?: string;
  diff?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        acao: entry.acao,
        entidade: entry.entidade,
        entidadeId: entry.entidadeId,
        diff: entry.diff ?? undefined,
        ip: entry.ip,
      },
    });
  }
}
