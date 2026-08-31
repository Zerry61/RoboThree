import type { MaterializedResourceRevision } from "@robothree/contracts";

export type PortableLockedSkillRevision = Readonly<{
  id: string;
  revision: string;
  contentDigest: string;
}>;

export type LockedSkillRevision =
  | MaterializedResourceRevision
  | PortableLockedSkillRevision;

export type LockedSkillInstructionMaterial = Readonly<{
  skillId: string;
  revision: string;
  sourceContentDigest: string;
  mainBody: string;
  mainBodyDigest: string;
}>;

export interface LockedSkillInstructionResolver {
  loadExact(
    reference: LockedSkillRevision,
  ): Promise<LockedSkillInstructionMaterial | undefined>;
}
