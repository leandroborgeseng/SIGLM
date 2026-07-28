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
  canSubmitReview: boolean;
  canApproveReview: boolean;
  canReturnToStructuring: boolean;
  hasStructuralChanges: boolean;
  requiresReviewBeforePublish: boolean;
  /** Informativo (item 85) — não bloqueia mais por responsável exclusivo. */
  structureHint?: string;
  reviewHint?: string;
  /** @deprecated use structureHint — mantido para UI antiga */
  structureBlockedReason?: string;
  /** @deprecated use reviewHint */
  reviewBlockedReason?: string;
};

function responsavelNome(
  id: string | null,
  user: { id: string; nome: string } | null | undefined,
): string {
  if (!id) return 'outro usuário';
  return user?.nome ?? 'outro usuário';
}

/**
 * Item 85: responsáveis são organizacionais — não restringem autorização.
 * Bloqueios restantes: permissão geral + estágio do fluxo editorial.
 */
export function structureBlockedReason(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
): string | null {
  if (!user.permissions.includes('acts:write')) {
    return 'Sem permissão para editar o texto estruturado';
  }

  // Em aguardando revisão, quem só estrutura sem poder revisar não altera até devolução.
  if (
    act.etapaEditorial === EditorialStage.aguardando_revisao &&
    !user.permissions.includes('acts:publish') &&
    !user.permissions.includes('acts:write')
  ) {
    return 'Aguardando revisão — devolva para estruturação ou conclua a revisão';
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
  return null;
}

function structureHint(act: ActResponsibleFields): string | undefined {
  if (
    act.etapaEditorial === EditorialStage.em_estruturacao &&
    act.responsavelEstruturacaoId
  ) {
    return `Responsável preferencial pela estruturação: ${responsavelNome(
      act.responsavelEstruturacaoId,
      act.responsavelEstruturacao,
    )}`;
  }
  if (
    act.etapaEditorial === EditorialStage.aguardando_revisao &&
    act.responsavelRevisaoId
  ) {
    return `Responsável preferencial pela revisão: ${responsavelNome(
      act.responsavelRevisaoId,
      act.responsavelRevisao,
    )}`;
  }
  return undefined;
}

export function buildActAccessHints(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
  options?: {
    hasStructuralChanges?: boolean;
    editable?: boolean;
    fileOnly?: boolean;
  },
): ActAccessHints {
  const hasStructuralChanges = Boolean(options?.hasStructuralChanges);
  const editable = options?.editable ?? true;
  const fileOnly = options?.fileOnly ?? act.etapaEditorial === EditorialStage.somente_arquivo_original;

  const structureReason = structureBlockedReason(act, user);
  const reviewReason = reviewBlockedReason(act, user);
  const publishReason = reviewBlockedReason(act, user, { requirePublish: true });

  const canWrite = user.permissions.includes('acts:write');
  const canPublishPerm = user.permissions.includes('acts:publish');
  const canReviewPerm = canWrite || canPublishPerm;

  const requiresReviewBeforePublish = hasStructuralChanges && !fileOnly;

  const canSubmitReview =
    canWrite &&
    editable &&
    !fileOnly &&
    hasStructuralChanges &&
    (act.etapaEditorial === EditorialStage.em_estruturacao ||
      act.etapaEditorial === EditorialStage.estruturado ||
      (act.editionOpen &&
        act.etapaEditorial !== EditorialStage.aguardando_revisao &&
        act.etapaEditorial !== EditorialStage.revisado));

  const canApproveReview =
    canReviewPerm && act.etapaEditorial === EditorialStage.aguardando_revisao;

  const canReturnToStructuring =
    canReviewPerm && act.etapaEditorial === EditorialStage.aguardando_revisao;

  const canPublishByStage = (() => {
    if (!canPublishPerm || publishReason) return false;
    if (fileOnly) return editable || act.editionOpen || act.statusPublicacao === PublicationStatus.rascunho;
    if (!requiresReviewBeforePublish) {
      // Só metadados (ou sem estrutura) — publicação direta permitida
      return editable || act.editionOpen || act.statusPublicacao === PublicationStatus.em_revisao;
    }
    // Estrutural: só após revisão formal
    return act.etapaEditorial === EditorialStage.revisado;
  })();

  const hint = structureHint(act);

  return {
    canEditStructure: !structureReason,
    canReview: !reviewReason,
    canPublish: canPublishByStage,
    canSubmitReview:
      canSubmitReview &&
      act.etapaEditorial !== EditorialStage.aguardando_revisao &&
      act.etapaEditorial !== EditorialStage.revisado,
    canApproveReview,
    canReturnToStructuring,
    hasStructuralChanges,
    requiresReviewBeforePublish,
    structureHint: hint,
    reviewHint: hint,
    structureBlockedReason: structureReason ?? undefined,
    reviewBlockedReason: publishReason ?? reviewReason ?? undefined,
  };
}

export function assertCanEditStructureForUser(
  act: ActResponsibleFields,
  user: Pick<AuthUser, 'id' | 'permissions'>,
) {
  const reason = structureBlockedReason(act, user);
  if (reason) throw new ForbiddenException(reason);

  // Em aguardando revisão, exige permissão de revisão (write ou publish) — já coberto por write.
  // Qualquer usuário com acts:write pode estruturar; responsáveis não excluem.
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
