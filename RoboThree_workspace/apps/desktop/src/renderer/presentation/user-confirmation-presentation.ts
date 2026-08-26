import type { UserConfirmationProjection } from "@robothree/contracts";

export type UserConfirmationPresentationInput = Readonly<
  Pick<
    UserConfirmationProjection,
    | "status"
    | "reasonSummary"
    | "riskSummary"
    | "targetSummary"
    | "consequenceSummary"
  >
>;

export type UserConfirmationMetaItem = Readonly<{
  label: string;
  value: string;
}>;

export type UserConfirmationPresentation = Readonly<{
  title: string;
  statusLabel: string;
  statusClass: UserConfirmationProjection["status"];
  reasonSummary: string;
  riskSummary: string;
  meta: readonly UserConfirmationMetaItem[];
  canShowDecisionActions: boolean;
}>;

export function presentUserConfirmation(
  confirmation: UserConfirmationPresentationInput,
): UserConfirmationPresentation {
  return {
    title: userConfirmationTitle(confirmation.status),
    statusLabel: userConfirmationStatusLabel(confirmation.status),
    statusClass: confirmation.status,
    reasonSummary: confirmation.reasonSummary,
    riskSummary: confirmation.riskSummary,
    meta: [
      { label: "目标", value: confirmation.targetSummary },
      { label: "确认后", value: confirmation.consequenceSummary },
    ],
    canShowDecisionActions: canShowConfirmationDecisionActions(confirmation),
  };
}

export function userConfirmationStatusLabel(
  status: UserConfirmationProjection["status"],
): string {
  switch (status) {
    case "pending":
      return "等待确认";
    case "confirmed":
      return "已允许";
    case "rejected":
      return "已拒绝";
    case "expired":
      return "已过期";
    default:
      return assertNever(status);
  }
}

export function userConfirmationTitle(
  status: UserConfirmationProjection["status"],
): string {
  switch (status) {
    case "pending":
      return "等待你的确认";
    case "confirmed":
    case "rejected":
    case "expired":
      return userConfirmationStatusLabel(status);
    default:
      return assertNever(status);
  }
}

export function canShowConfirmationDecisionActions(
  confirmation: Pick<UserConfirmationPresentationInput, "status">,
): boolean {
  switch (confirmation.status) {
    case "pending":
      return true;
    case "confirmed":
    case "rejected":
    case "expired":
      return false;
    default:
      return assertNever(confirmation.status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled user confirmation status: ${String(value)}`);
}
