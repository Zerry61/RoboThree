export class NdjsonFrameError extends Error {
  public readonly code:
    | "document_worker.frame_too_large"
    | "document_worker.incomplete_frame";

  public constructor(code: NdjsonFrameError["code"], message: string) {
    super(message);
    this.name = "NdjsonFrameError";
    this.code = code;
  }
}

/**
 * Stream decoder for newline-delimited JSON frames.
 *
 * Buffers incoming chunks and emits complete frames split on `\n`.
 * Rejects frames that exceed `maxFrameBytes` at the point the newline
 * is detected, or buffered incomplete data exceeding the limit.
 */
export class NdjsonFrameDecoder {
  readonly #maxFrameBytes: number;
  #buffer = Buffer.alloc(0);

  public constructor(maxFrameBytes: number) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
      throw new Error("maxFrameBytes must be a positive safe integer");
    }
    this.#maxFrameBytes = maxFrameBytes;
  }

  /**
   * Push a chunk of raw bytes. Returns zero or more complete frame strings.
   * Throws `NdjsonFrameError` if a frame exceeds the configured limit.
   */
  public push(chunk: Buffer): readonly string[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const frames: string[] = [];
    let newline = this.#buffer.indexOf(0x0a);
    while (newline >= 0) {
      if (newline > this.#maxFrameBytes) {
        throw new NdjsonFrameError(
          "document_worker.frame_too_large",
          `NDJSON frame exceeds ${this.#maxFrameBytes} bytes`,
        );
      }
      const frame = this.#buffer.subarray(0, newline);
      this.#buffer = this.#buffer.subarray(newline + 1);
      if (frame.length > 0) {
        frames.push(frame.toString("utf8"));
      }
      newline = this.#buffer.indexOf(0x0a);
    }
    if (this.#buffer.length > this.#maxFrameBytes) {
      throw new NdjsonFrameError(
        "document_worker.frame_too_large",
        `Incomplete NDJSON frame exceeds ${this.#maxFrameBytes} bytes`,
      );
    }
    return frames;
  }

  /**
   * Call when the input stream ends. Throws if unprocessed data remains
   * (truncated / half-frame).
   */
  public finish(): void {
    if (this.#buffer.length > 0) {
      throw new NdjsonFrameError(
        "document_worker.incomplete_frame",
        "Stream ended with an incomplete NDJSON frame",
      );
    }
  }
}
