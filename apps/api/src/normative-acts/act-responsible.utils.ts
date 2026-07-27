import { ForbiddenException } from '@nestjs/common';
import { EditorialStage, PublicationStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.constants';

export type ActResponsibleFields = {
  etapaEditorial: EditorialStage;
  statusPublicacao: PublicationStatus;
  editionOpen: boolean;
  responsavelEstruturacaoId: string | null;
  responsavelRevisaoId: string | null;
  responsavelEstruturacao?: { id: string; nome: string; ativo: boolean } | null;
  responsavelRevisao?: { id: string; nome: string; ativo: boolean } | null;
};

export type ActAccessHints = {
  canEditStructure: boolean;
  canReview: boolean;
  canPublish: boolean;
  structureBlockedReason?: string;
  reviewBlockedReason?: string;
};

function responsavelNome(
  id: string | null,
  user: { id: string; nome: string } | null | undefined,
): string {
  if (!id) return 'outro usuário';
  return user?.nome ?? 'outro usuário';
}

export function structureBlockedReason(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
): string | null {
  if (!user.permissions.includes('acts:write')) {
    return 'Sem permissão para editar o texto estruturado';
  }

  if (
    act.etapaEditorial === EditorialStage.em_estruturacao &&
    act.responsavelEstruturacaoId &&
    act.responsavelEstruturacaoId !== user.id
  ) {
    return `Estruturação atribuída a ${responsavelNome(act.responsavelEstruturacaoId, act.responsavelEstruturacao)}`;
  }

  if (
    act.etapaEditorial === EditorialStage.aguardando_revisao &&
    act.responsavelEstruturacaoId &&
    act.responsavelEstruturacaoId === user.id
  ) {
    return 'Aguardando revisão — a estruturação só pode ser retomada após devolução formal';
  }

  if (act.responsavelEstruturacao?.ativo === false && act.responsavelEstruturacaoId === user.id) {
    return 'Usuário responsável pela estruturação está inativo';
  }

  return null;
}

export function reviewBlockedReason(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
  options?: { requirePublish?: boolean },
): string | null {
  if (options?.requirePublish && !user.permissions.includes('acts:publish')) {
    return 'Sem permissão para publicar atos normativos';
  }
  if (
    !user.permissions.includes('acts:write') &&
    !user.permissions.includes('acts:publish')
  ) {
    return 'Sem permissão para revisar ou publicar';
  }

  if (act.responsavelRevisaoId && act.responsavelRevisaoId !== user.id) {
    return `Revisão/publicação atribuída a ${responsavelNome(act.responsavelRevisaoId, act.responsavelRevisao)}`;
  }

  if (act.responsavelRevisao?.ativo === false && act.responsavelRevisaoId === user.id) {
    return 'Usuário responsável pela revisão está inativo';
  }

  return null;
}

export function buildActAccessHints(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
): ActAccessHints {
  const structureReason = structureBlockedReason(act, user);
  const reviewReason = reviewBlockedReason(act, user);
  const publishReason = reviewBlockedReason(act, user, { requirePublish: true });

  return {
    canEditStructure: !structureReason,
    canReview: !reviewReason,
    canPublish: !publishReason && user.permissions.includes('acts:publish'),
    structureBlockedReason: structureReason ?? undefined,
    reviewBlockedReason: reviewReason ?? undefined,
  };
}

export function assertCanEditStructureForUser(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
) {
  const reason = structureBlockedReason(act, user);
  if (reason) throw new ForbiddenException(reason);
}

export function assertCanReviewForUser(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
) {
  const reason = reviewBlockedReason(act, user);
  if (reason) throw new ForbiddenException(reason);
}

export function assertCanPublishForUser(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
) {
  const reason = reviewBlockedReason(act, user, { requirePublish: true });
  if (reason) throw new ForbiddenException(reason);
}

export function assignmentPermissionWarnings(
  userId: string,
  permissions: string[],
): string[] {
  const warnings: string[] = [];
  if (!permissions.includes('acts:write')) {
    warnings.push('O usuário designado não possui permissão para editar atos (acts:write).');
  }
  if (!permissions.includes('acts:publish')) {
    warnings.push(
      'O usuário designado não possui permissão para publicar atos (acts:publish).',
    );
  }
  return warnings;
}
