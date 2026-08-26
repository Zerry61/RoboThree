import { createHash } from "node:crypto";

import {
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
} from "@robothree/contracts";
import { z } from "zod";

import type { Clock } from "../ports/clock.js";
import type {
  ApplicationLocaleSource,
} from "../ports/application-locale.js";
import type {
  OperatingSystemTimezoneSource,
} from "../ports/operating-system-timezone.js";
import type { ModelProvider } from "../ports/model-provider.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const OFFSET_ONLY_TIMEZONE_PATTERN = /^(?:UTC|GMT)?[+-]\d{1,2}(?::?\d{2})?$/iu;

export const R2D_DYNAMIC_REQUEST_FACTS_DEFAULT_ENABLED = false as const;
export const DYNAMIC_REQUEST_FACTS_DIGEST_DOMAIN =
  "robothree.dynamic-request-facts.v1\n";
export const REQUEST_SCOPED_SYSTEM_MESSAGE_DIGEST_DOMAIN =
  "robothree.request-scoped-system-message.v1\n";

export const DynamicRequestFactsSubjectSchema = z.discriminatedUnion(
  "invocationKind",
  [
    z.object({
      invocationKind: z.literal("main"),
      invocationSubjectId: EntityIdSchema,
      taskId: EntityIdSchema,
      runId: EntityIdSchema,
      round: z.number().int().positive().max(64),
    }).strict(),
    z.object({
      invocationKind: z.literal("compaction"),
      invocationSubjectId: EntityIdSchema,
      compactionJobId: EntityIdSchema,
    }).strict(),
  ],
);

const DynamicRequestFactsMaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  invocationKind: z.enum(["main", "compaction"]),
  invocationSubjectId: EntityIdSchema,
  currentTime: z.string().regex(UTC_MILLISECOND_PATTERN).refine(
    (value) => {
      try { return new Date(value).toISOString() === value; } catch { return false; }
    },
    { message: "Dynamic request time must be a canonical UTC millisecond timestamp" },
  ),
  locale: z.string().trim().min(2).max(64),
  timezone: z.string().trim().min(1).max(128),
  sourceRevision: Sha256DigestSchema,
}).strict();

export const DynamicRequestFactsV1Schema = DynamicRequestFactsMaterialSchema.extend({
  factsDigest: Sha256DigestSchema,
}).strict().superRefine((facts, context) => {
  const { factsDigest, ...material } = facts;
  if (factsDigest !== calculateDynamicRequestFactsDigest(material)) {
    context.addIssue({ code: "custom", message: "Dynamic request facts digest mismatch" });
  }
  if (!isBcp47Locale(facts.locale)) {
    context.addIssue({ code: "custom", message: "Dynamic request locale is invalid" });
  }
  if (!isIanaTimezone(facts.timezone)) {
    context.addIssue({ code: "custom", message: "Dynamic request timezone is invalid" });
  }
});

export const DynamicRequestFactsEvidenceV1Schema = z.object({
  schemaVersion: z.literal("v1"),
  invocationKind: z.enum(["main", "compaction"]),
  invocationSubjectId: EntityIdSchema,
  factsDigest: Sha256DigestSchema,
  sourceRevision: Sha256DigestSchema,
}).strict();

export type DynamicRequestFactsSubject = z.infer<typeof DynamicRequestFactsSubjectSchema>;
export type DynamicRequestFactsV1 = z.infer<typeof DynamicRequestFactsV1Schema>;
export type DynamicRequestFactsEvidenceV1 = z.infer<
  typeof DynamicRequestFactsEvidenceV1Schema
>;
type DynamicRequestFactsMaterial = z.infer<typeof DynamicRequestFactsMaterialSchema>;

export type DynamicRequestFactsErrorCode =
  | "context.dynamic_facts_unavailable"
  | "context.dynamic_facts_invalid"
  | "context.dynamic_facts_drift"
  | "context.dynamic_facts_subject_mismatch"
  | "context.dynamic_facts_budget_exceeded";

export class DynamicRequestFactsError extends Error {
  public constructor(
    public readonly code: DynamicRequestFactsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DynamicRequestFactsError";
  }
}

export class CodeOwnedApplicationLocaleSource implements ApplicationLocaleSource {
  readonly #fact = Object.freeze({
    locale: "zh-CN",
    sourceRevision: sha256CanonicalJson(JsonValueSchema.parse({
      domain: "robothree.application-locale-source.v1\n",
      locale: "zh-CN",
    })),
  });

  public requireCurrent() { return this.#fact; }
}

export class RuntimeOperatingSystemTimezoneSource
implements OperatingSystemTimezoneSource {
  public requireCurrent() {
    let timezone: string;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      throw new DynamicRequestFactsError(
        "context.dynamic_facts_unavailable",
        "The Core runtime timezone is unavailable",
      );
    }
    if (!isIanaTimezone(timezone)) {
      throw new DynamicRequestFactsError(
        "context.dynamic_facts_unavailable",
        "The Core runtime timezone is unavailable",
      );
    }
    return Object.freeze({
      timezone,
      sourceRevision: sha256CanonicalJson(JsonValueSchema.parse({
        domain: "robothree.operating-system-timezone-source.v1\n",
        timezone,
      })),
    });
  }
}

export class DynamicRequestFactsMaterializer {
  readonly #clock: Clock;
  readonly #locale: ApplicationLocaleSource;
  readonly #timezone: OperatingSystemTimezoneSource;

  public constructor(input: Readonly<{
    clock: Clock;
    locale: ApplicationLocaleSource;
    timezone: OperatingSystemTimezoneSource;
  }>) {
    this.#clock = input.clock;
    this.#locale = input.locale;
    this.#timezone = input.timezone;
  }

  public materialize(subjectInput: DynamicRequestFactsSubject): DynamicRequestFactsV1 {
    const subject = DynamicRequestFactsSubjectSchema.parse(subjectInput);
    try {
      const locale = this.#locale.requireCurrent();
      const timezone = this.#timezone.requireCurrent();
      const material = DynamicRequestFactsMaterialSchema.parse({
        schemaVersion: "v1",
        invocationKind: subject.invocationKind,
        invocationSubjectId: subject.invocationSubjectId,
        currentTime: this.#clock.now(),
        locale: locale.locale,
        timezone: timezone.timezone,
        sourceRevision: sha256CanonicalJson(JsonValueSchema.parse({
          domain: "robothree.dynamic-request-facts-source.v1\n",
          localeSourceRevision: locale.sourceRevision,
          timezoneSourceRevision: timezone.sourceRevision,
          clockSemantics: "utc_millisecond_single_sample",
        })),
      });
      return DynamicRequestFactsV1Schema.parse({
        ...material,
        factsDigest: calculateDynamicRequestFactsDigest(material),
      });
    } catch (error) {
      if (error instanceof DynamicRequestFactsError) throw error;
      throw new DynamicRequestFactsError(
        "context.dynamic_facts_invalid",
        "The controlled request facts are invalid",
      );
    }
  }
}

export class DynamicRequestFactsRuntime {
  readonly #materializer: DynamicRequestFactsMaterializer;

  public constructor(materializer: DynamicRequestFactsMaterializer) {
    this.#materializer = materializer;
  }

  public async resolve(input: Readonly<{
    provider: ModelProvider;
    subject: DynamicRequestFactsSubject;
  }>): Promise<DynamicRequestFactsV1> {
    const subject = DynamicRequestFactsSubjectSchema.parse(input.subject);
    if (input.provider.loadDynamicRequestFacts === undefined) {
      throw new DynamicRequestFactsError(
        "context.dynamic_facts_unavailable",
        "The locked Provider cannot recover controlled request facts",
      );
    }
    const durable = await input.provider.loadDynamicRequestFacts(subject);
    return durable === undefined
      ? this.#materializer.materialize(subject)
      : validateDynamicRequestFacts(durable, subject);
  }
}

export function dynamicRequestFactsSafeSummary(
  code: DynamicRequestFactsErrorCode,
): string {
  switch (code) {
    case "context.dynamic_facts_unavailable":
      return "本轮受控上下文事实暂不可用";
    case "context.dynamic_facts_invalid":
    case "context.dynamic_facts_drift":
    case "context.dynamic_facts_subject_mismatch":
      return "本轮受控上下文事实不一致";
    case "context.dynamic_facts_budget_exceeded":
      return "本轮受控上下文事实超过可用上下文预算";
  }
}

export function calculateDynamicRequestFactsDigest(
  input: DynamicRequestFactsMaterial,
): string {
  const material = DynamicRequestFactsMaterialSchema.parse(input);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: DYNAMIC_REQUEST_FACTS_DIGEST_DOMAIN,
    material,
  }));
}

export function validateDynamicRequestFacts(
  input: DynamicRequestFactsV1,
  subject?: DynamicRequestFactsSubject,
): DynamicRequestFactsV1 {
  let facts: DynamicRequestFactsV1;
  try {
    facts = DynamicRequestFactsV1Schema.parse(input);
  } catch {
    throw new DynamicRequestFactsError(
      "context.dynamic_facts_drift",
      "The durable request facts are inconsistent",
    );
  }
  if (subject !== undefined) {
    const exact = DynamicRequestFactsSubjectSchema.parse(subject);
    if (
      facts.invocationKind !== exact.invocationKind
      || facts.invocationSubjectId !== exact.invocationSubjectId
    ) {
      throw new DynamicRequestFactsError(
        "context.dynamic_facts_subject_mismatch",
        "The durable request facts belong to another invocation",
      );
    }
  }
  return facts;
}

export function dynamicRequestFactsEvidence(
  input: DynamicRequestFactsV1,
): DynamicRequestFactsEvidenceV1 {
  const facts = validateDynamicRequestFacts(input);
  return DynamicRequestFactsEvidenceV1Schema.parse({
    schemaVersion: "v1",
    invocationKind: facts.invocationKind,
    invocationSubjectId: facts.invocationSubjectId,
    factsDigest: facts.factsDigest,
    sourceRevision: facts.sourceRevision,
  });
}

export function mainDynamicRequestFactsSubject(input: Readonly<{
  taskId: string;
  runId: string;
  round: number;
}>): DynamicRequestFactsSubject {
  return DynamicRequestFactsSubjectSchema.parse({
    invocationKind: "main",
    invocationSubjectId: stableUuid(
      `${input.taskId}:${input.runId}:${input.round}`,
      "r2d-main-invocation-subject",
    ),
    ...input,
  });
}

export function compactionDynamicRequestFactsSubject(
  compactionJobId: string,
): DynamicRequestFactsSubject {
  return DynamicRequestFactsSubjectSchema.parse({
    invocationKind: "compaction",
    invocationSubjectId: stableUuid(
      compactionJobId,
      "r2d-compaction-invocation-subject",
    ),
    compactionJobId,
  });
}

function isBcp47Locale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

function isIanaTimezone(value: string): boolean {
  if (OFFSET_ONLY_TIMEZONE_PATTERN.test(value)) {
    return false;
  }
  try {
    return Intl.DateTimeFormat("en-US", { timeZone: value })
      .resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

function stableUuid(value: string, domain: string): string {
  const bytes = createHash("sha256").update(`${domain}\u0000${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
