import type { MaterializedResourceRevision } from "@robothree/contracts";

export type LockedSkillInstructionMaterial = Readonly<{
  skillId: string;
  revision: string;
  sourceContentDigest: string;
  mainBody: string;
  mainBodyDigest: string;
}>;

export interface LockedSkillInstructionResolver {
  loadExact(
    reference: MaterializedResourceRevision,
  ): Promise<LockedSkillInstructionMaterial | undefined>;
}
