import { z } from "zod";

export const LEGACY_CONTRACT_VERSION = "v1alpha1" as const;
export const CONTRACT_VERSION = "v1alpha2" as const;

export const ReadableContractVersionSchema = z.enum([
  LEGACY_CONTRACT_VERSION,
  CONTRACT_VERSION,
]);
export const ContractVersionSchema = ReadableContractVersionSchema;
export const CurrentContractVersionSchema = z.literal(CONTRACT_VERSION);

export type ContractVersion = z.infer<typeof ContractVersionSchema>;
export type ReadableContractVersion = z.infer<typeof ReadableContractVersionSchema>;
