import {
  PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
  PersonalCredentialBrokerResponseHeaderSchema,
  type PersonalCredentialBrokerResponseHeader,
} from "@robothree/contracts/desktop-private/personal-credential-broker-v1";

import {
  type PersonalCredentialBrokerClient,
  type PersonalCredentialBrokerCommand,
} from "./personal-credential-broker-client.js";

export type PersonalCredentialRevealCommand = PersonalCredentialBrokerCommand & Readonly<{
  commandType: "reveal";
  expectedConfigurationRevision: string;
  expectedExecutionDefinitionDigest: string;
  secret?: never;
}>;

export interface PersonalCredentialRevealConsumer {
  consume(secret: Uint8Array): Promise<void>;
}

export class PersonalCredentialRevealDelivery {
  public constructor(private readonly broker: PersonalCredentialBrokerClient) {}

  public async deliver(
    command: PersonalCredentialRevealCommand,
    consumer: PersonalCredentialRevealConsumer,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<PersonalCredentialBrokerResponseHeader> {
    const result = await this.broker.execute(command, options);
    if (result.header.status !== "completed" || result.secret === undefined) {
      result.secret?.fill(0);
      return result.header;
    }
    const working = Uint8Array.from(result.secret);
    result.secret.fill(0);
    try {
      const terminal = await consumeWithinDeadline(
        consumer,
        working,
        Date.parse(command.deadlineAt),
        options.signal,
      );
      if (terminal === "completed") {
        return PersonalCredentialBrokerResponseHeaderSchema.parse({
          ...result.header,
          secretByteLength: 0,
        });
      }
      return PersonalCredentialBrokerResponseHeaderSchema.parse({
        protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
        channelInstanceId: result.header.channelInstanceId,
        commandId: result.header.commandId,
        transportRequestId: result.header.transportRequestId,
        status: terminal,
        typedErrorCode: terminal === "cancelled"
          ? "credential_store_cancelled"
          : "credential_operation_uncertain",
        secretByteLength: 0,
      });
    } finally {
      working.fill(0);
    }
  }
}

async function consumeWithinDeadline(
  consumer: PersonalCredentialRevealConsumer,
  secret: Uint8Array,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<"completed" | "cancelled" | "uncertain"> {
  if (signal?.aborted === true) return "cancelled";
  const remaining = deadline - Date.now();
  if (!Number.isFinite(deadline) || remaining <= 0) return "uncertain";
  return new Promise((resolve) => {
    let settled = false;
    const finish = (terminal: "completed" | "cancelled" | "uncertain") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(terminal);
    };
    const timer = setTimeout(() => finish("uncertain"), remaining);
    const onAbort = () => finish("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    void consumer.consume(secret).then(
      () => finish("completed"),
      () => finish("uncertain"),
    );
  });
}
