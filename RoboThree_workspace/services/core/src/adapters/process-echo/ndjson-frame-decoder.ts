export class NdjsonFrameError extends Error {
  public readonly code: "process_echo.frame_too_large" | "process_echo.incomplete_frame";

  public constructor(code: NdjsonFrameError["code"], message: string) {
    super(message);
    this.name = "NdjsonFrameError";
    this.code = code;
  }
}

export class NdjsonFrameDecoder {
  readonly #maxFrameBytes: number;
  #buffer = Buffer.alloc(0);

  public constructor(maxFrameBytes: number) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
      throw new Error("maxFrameBytes must be a positive safe integer");
    }
    this.#maxFrameBytes = maxFrameBytes;
  }

  public push(chunk: Buffer): readonly string[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const frames: string[] = [];
    let newline = this.#buffer.indexOf(0x0a);
    while (newline >= 0) {
      if (newline > this.#maxFrameBytes) {
        throw new NdjsonFrameError(
          "process_echo.frame_too_large",
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
        "process_echo.frame_too_large",
        `Incomplete NDJSON frame exceeds ${this.#maxFrameBytes} bytes`,
      );
    }
    return frames;
  }

  public finish(): void {
    if (this.#buffer.length > 0) {
      throw new NdjsonFrameError(
        "process_echo.incomplete_frame",
        "Process ended with an incomplete NDJSON frame",
      );
    }
  }
}
