import {
  SubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
  type SubmitTurnRecord,
  type SubmitTurnRecordV1Alpha2,
} from "@robothree/contracts";
import {
  SubmitTurnRecordV1Alpha3Schema,
  type SubmitTurnRecordV1Alpha3,
} from "@robothree/contracts/submit-turn-coordination/v1alpha3";
import {
  SubmitTurnRecordV1Alpha4Schema,
  type ReadableSubmitTurnRecordV1Alpha4,
  type SubmitTurnRecordV1Alpha4,
} from "@robothree/contracts/submit-turn-coordination/v1alpha4";

export const R2D3_COORDINATION_V1ALPHA4_PRODUCTION_CONSUMER_ENABLED = false;

export function createSubmitTurnRecordV1Alpha4(
  input: SubmitTurnRecordV1Alpha4,
): SubmitTurnRecordV1Alpha4 {
  return SubmitTurnRecordV1Alpha4Schema.parse(input);
}

export function parseReadableSubmitTurnRecordV1Alpha4(
  input: unknown,
): ReadableSubmitTurnRecordV1Alpha4 {
  const schemaVersion = readSchemaVersion(input);
  if (schemaVersion === "v1alpha1") {
    const parsed: SubmitTurnRecord = SubmitTurnRecordSchema.parse(input);
    return parsed;
  }
  if (schemaVersion === "v1alpha2") {
    const parsed: SubmitTurnRecordV1Alpha2 = SubmitTurnRecordV1Alpha2Schema.parse(input);
    return parsed;
  }
  if (schemaVersion === "v1alpha3") {
    const parsed: SubmitTurnRecordV1Alpha3 = SubmitTurnRecordV1Alpha3Schema.parse(input);
    return parsed;
  }
  if (schemaVersion === "v1alpha4") {
    return SubmitTurnRecordV1Alpha4Schema.parse(input);
  }
  throw new Error("SubmitTurn coordination schema version is unsupported");
}

function readSchemaVersion(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("SubmitTurn coordination record is invalid");
  }
  return Reflect.get(input, "schemaVersion");
}
