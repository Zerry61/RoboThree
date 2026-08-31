export class AdminApiError extends Error {
  readonly code: string;
  readonly correlationId: string | undefined;

  constructor(code: string, message: string, correlationId?: string) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.correlationId = correlationId;
  }
}
