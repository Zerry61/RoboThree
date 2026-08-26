import type { MessageProjection } from "@robothree/contracts";

export type StreamingAssistantPresentationInput = Readonly<{
  text: string;
}>;

export type MessagePresentationInput =
  | MessageProjection
  | StreamingAssistantPresentationInput;

export type MessagePresentation = Readonly<{
  roleClass: string;
  avatar: string;
  authorName: string;
  statusLabel: string;
  content: string;
  isStreaming: boolean;
}>;

export function presentDurableMessage(
  message: MessageProjection,
): MessagePresentation {
  return {
    roleClass: `message-${message.role}`,
    avatar: messageAvatar(message.role),
    authorName: messageAuthorName(message.role),
    statusLabel: messageStatusLabel(message.status),
    content: message.content,
    isStreaming: false,
  };
}

export function presentStreamingAssistant(
  assistant: StreamingAssistantPresentationInput,
): MessagePresentation {
  return {
    roleClass: "message-assistant",
    avatar: "R3",
    authorName: "RoboThree",
    statusLabel: "生成中",
    content: assistant.text,
    isStreaming: true,
  };
}

export function messageAvatar(role: MessageProjection["role"]): string {
  switch (role) {
    case "user":
      return "你";
    case "assistant":
      return "R3";
    case "tool":
      return "T";
    default:
      return assertNever(role);
  }
}

export function messageAuthorName(role: MessageProjection["role"]): string {
  switch (role) {
    case "user":
      return "你";
    case "assistant":
    case "tool":
      return "RoboThree";
    default:
      return assertNever(role);
  }
}

export function messageStatusLabel(
  status: MessageProjection["status"],
): string {
  switch (status) {
    case "completed":
      return "已持久化";
    case "pending":
    case "streaming":
    case "failed":
      return status;
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled message presentation value: ${String(value)}`);
}
