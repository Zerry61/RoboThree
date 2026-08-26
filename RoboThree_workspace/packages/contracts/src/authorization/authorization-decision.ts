import { z } from "zod";

import { CurrentContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { UserConfirmationRequestSchema } from "./user-confirmation.js";

const DecisionBase = {
  schemaVersion: CurrentContractVersionSchema,
  decisionDigest: Sha256DigestSchema,
};

export const AuthorizationDecisionSchema = z.discriminatedUnion("outcome", [
  z.object({ ...DecisionBase, outcome: z.literal("allowed") }).strict(),
  z.object({
    ...DecisionBase,
    outcome: z.literal("denied"),
    reasonCode: z.string().trim().min(1).max(160),
  }).strict(),
  z.object({
    ...DecisionBase,
    outcome: z.literal("user_confirmation_required"),
    request: UserConfirmationRequestSchema,
  }).strict(),
]);

export type AuthorizationDecision = z.infer<typeof AuthorizationDecisionSchema>;
