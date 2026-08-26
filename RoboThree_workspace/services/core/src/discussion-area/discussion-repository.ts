// Discussion file-system repository.
//
// Files are stored in daily subdirectories: <base>/YYYYMMDD/NNN-topic-agent.md
// The day folder is auto-created on first write of the day.
//
// Listing scans all YYYYMMDD/ folders and returns entries sorted by
// full path (day folder + file name) for stable chronological order.

import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import type { Clock } from "../ports/clock.js";

import type {
  DiscussionReadEntry,
  DiscussionReadResult,
  DiscussionSkippedFile,
} from "./discussion-entry.js";
import {
  DISCUSSION_FILE_NAME_PATTERN,
} from "./discussion-entry.js";
import {
  DiscussionFileNameGenerator,
} from "./discussion-file-name.js";
import { DiscussionMarkdownCodec } from "./discussion-markdown-codec.js";

export interface RepositoryWriteTarget {
  directory: string;
  fileName: string;
  content: string;
}

export interface DiscussionRepositoryOptions {
  directory: string;
  workspaceRoot: string;
  maxSequenceAttempts?: number;
}

export class DiscussionRepository {
  readonly #workspaceRoot: string;
  readonly #baseDir: string;
  readonly #directoryReady: Promise<void>;
  readonly #fileNames: DiscussionFileNameGenerator;
  readonly #codec: DiscussionMarkdownCodec;
  readonly #maxSequenceAttempts: number;
  readonly #pendingTempFiles = new Set<string>();

  constructor(clock: Clock, options: DiscussionRepositoryOptions) {
    if (!isAbsolute(options.directory)) throw new Error(`Discussion directory must be absolute: ${options.directory}`);
    if (!isAbsolute(options.workspaceRoot)) throw new Error(`Workspace root must be absolute: ${options.workspaceRoot}`);
    this.#baseDir = resolve(options.directory);
    this.#workspaceRoot = safeRealpathSync(resolve(options.workspaceRoot));
    this.#maxSequenceAttempts = options.maxSequenceAttempts ?? 1_000;
    this.#fileNames = new DiscussionFileNameGenerator(clock);
    this.#codec = new DiscussionMarkdownCodec();
    this.#directoryReady = mkdir(this.#baseDir, { recursive: true }).then(() => undefined);
  }

  ready(): Promise<void> { return this.#directoryReady; }
  baseDirectory(): string { return this.#baseDir; }
  workspaceRoot(): string { return this.#workspaceRoot; }

  // Returns today's day-directory path.
  dayDir(): string { return join(this.#baseDir, this.#fileNames.todayYyyymmdd()); }

  async allocateFileName(from: string, topic?: string): Promise<{ fileName: string; discussionId: string; dayDir: string }> {
    await this.#directoryReady;
    const todayDir = this.dayDir();
    await this.#ensureDayDir(todayDir);
    await this.#syncDailySeqFromDisk(todayDir);

    for (let attempt = 0; attempt < this.#maxSequenceAttempts; attempt += 1) {
      const candidate = this.#fileNames.next(from as "codex" | "claude-code" | "kimi" | "minimax", topic);
      const target = join(todayDir, candidate.fileName);
      try {
        await this.#probeNonExisting(target);
        return { fileName: candidate.fileName, discussionId: candidate.discussionId, dayDir: todayDir };
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          this.#fileNames.observeExisting(candidate.yyyymmdd, candidate.dailySeq);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Unable to allocate a unique discussion file name after ${this.#maxSequenceAttempts} attempts`);
  }

  async write(target: RepositoryWriteTarget): Promise<{ finalPath: string }> {
    await this.#directoryReady;
    if (target.fileName.includes("..")) throw new Error(`Path traversal in file name: ${target.fileName}`);
    const finalPath = resolve(target.directory, target.fileName);
    await this.#assertWithinWorkspace(finalPath);
    await this.#assertNoSymlinkEscape(finalPath);
    const tempPath = join(dirname(finalPath), `.${randomUUID()}.tmp`);
    this.#pendingTempFiles.add(tempPath);
    try {
      await writeFile(tempPath, target.content, { encoding: "utf8", flag: "wx" });
      await rename(tempPath, finalPath);
      return { finalPath };
    } finally {
      this.#pendingTempFiles.delete(tempPath);
      try { await rm(tempPath, { force: true }); } catch { /* best-effort */ }
    }
  }

  async list(): Promise<DiscussionReadResult> {
    await this.#directoryReady;
    const realBase = await this.#assertWithinWorkspace(this.#baseDir);
    const dayEntries = await readdir(realBase, { withFileTypes: true });
    const skipped: DiscussionSkippedFile[] = [];
    const valid: DiscussionReadEntry[] = [];

    for (const dayEntry of dayEntries) {
      if (!dayEntry.isDirectory() || dayEntry.name.startsWith(".")) continue;
      if (!/^\d{8}$/u.test(dayEntry.name)) continue; // YYYYMMDD folders only
      const dayDir = join(realBase, dayEntry.name);
      const files = await readdir(dayDir, { withFileTypes: true });

      for (const f of files) {
        if (f.isSymbolicLink()) {
          skipped.push({ fileName: `${dayEntry.name}/${f.name}`, reason: "symbolic-link-skipped" });
          continue;
        }
        if (!f.isFile()) continue;
        if (f.name.startsWith(".")) {
          skipped.push({ fileName: `${dayEntry.name}/${f.name}`, reason: "hidden-file-skipped" });
          continue;
        }
        // Accept both old (MMDD-NNN-...) and new (NNN-...) file names
        if (!DISCUSSION_FILE_NAME_PATTERN.test(f.name) &&
            !/^\d{4}-\d{3}-[a-z0-9一-鿿㐀-䶿]+(?:-[a-z0-9一-鿿㐀-䶿]+)*?-[a-z]{2,4}\.md$/u.test(f.name)) {
          skipped.push({ fileName: `${dayEntry.name}/${f.name}`, reason: "unexpected-file-name" });
          continue;
        }
        const target = join(dayDir, f.name);
        let targetForRead: string;
        try { targetForRead = await this.#assertWithinWorkspace(target); }
        catch (error) {
          skipped.push({ fileName: `${dayEntry.name}/${f.name}`, reason: error instanceof Error ? error.message : "outside-workspace" });
          continue;
        }
        const parsed = DiscussionFileNameGenerator.parseFileName(f.name);
        if (parsed === null) {
          skipped.push({ fileName: `${dayEntry.name}/${f.name}`, reason: "filename-parse-failed" });
          continue;
        }
        try {
          const body = await readFile(targetForRead, "utf8");
          const decoded = this.#codec.decode(body, f.name);
          valid.push(decoded);
        } catch (error) {
          skipped.push({ fileName: `${dayEntry.name}/${f.name}`, reason: error instanceof Error ? `decode-failed: ${error.message}` : "decode-failed" });
        }
      }
    }

    valid.sort(comparatorByDayAndName);
    return { entries: valid, skipped };
  }

  async appendToEntry(entryId: string, fileName: string, replySection: string): Promise<void> {
    await this.#directoryReady;
    const dayFolder = this.#dayFolderFor(entryId);
    const finalPath = resolve(this.#baseDir, dayFolder, fileName);
    await this.#assertWithinWorkspace(finalPath);

    let existing: string;
    try { existing = await readFile(finalPath, "utf8"); }
    catch (error) { if (isNotFoundError(error)) throw new Error(`Cannot append: file not found: ${fileName}`); throw error; }

    const updated = existing + "\n" + replySection + "\n";
    const tempPath = join(dirname(finalPath), `.${randomUUID()}.tmp`);
    try {
      await writeFile(tempPath, updated, { encoding: "utf8", flag: "wx" });
      await rename(tempPath, finalPath);
    } finally {
      try { await rm(tempPath, { force: true }); } catch { /* best-effort */ }
    }
  }

  async readById(entryId: string): Promise<DiscussionReadEntry | null> {
    const listing = await this.list();
    return listing.entries.find(e => e.id === entryId) ?? null;
  }

  async clean(): Promise<void> {
    await this.#directoryReady;
    const dayEntries = await readdir(this.#baseDir, { withFileTypes: true });
    for (const de of dayEntries) {
      if (!de.isDirectory()) continue;
      const dayDir = join(this.#baseDir, de.name);
      const files = await readdir(dayDir, { withFileTypes: true });
      for (const f of files) {
        if (f.isFile() && f.name.startsWith(".") && f.name.endsWith(".tmp")) {
          await rm(join(dayDir, f.name), { force: true });
        }
      }
    }
  }

  async #ensureDayDir(dir: string): Promise<void> {
    await this.#assertWithinWorkspace(dir);
    await mkdir(dir, { recursive: true });
  }

  async #syncDailySeqFromDisk(todayDir: string): Promise<void> {
    let maxSeq = 0;
    try {
      const files = await readdir(todayDir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile() || f.name.startsWith(".")) continue;
        const parsed = DiscussionFileNameGenerator.parseFileName(f.name);
        if (parsed !== null && parsed.dailySeq > maxSeq) maxSeq = parsed.dailySeq;
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    if (maxSeq > 0) {
      this.#fileNames.observeExisting(this.#fileNames.todayYyyymmdd(), maxSeq);
    }
  }

  #dayFolderFor(entryId: string): string {
    // Extract YYYYMMDD from ID.  New IDs use 8 digits; old IDs use 4
    // digits (MMDD) which we normalise to 2026MMDD.
    const match = /^DISC-(\d{4,8})-/u.exec(entryId);
    const raw = match?.[1] ?? "";
    if (raw.length === 4) return `2026${raw}`;
    return raw.padStart(8, "0");
  }

  async #probeNonExisting(target: string): Promise<void> {
    await lstat(await this.#assertWithinWorkspace(target)).then((info) => {
      if (info.isSymbolicLink()) throw new Error(`Refusing symlink: ${target}`);
      const err = new Error("Already exists") as NodeJS.ErrnoException;
      err.code = "EEXIST";
      throw err;
    }).catch((error) => {
      if (isAlreadyExistsError(error)) throw error;
      if (error instanceof Error && /ENOENT/iu.test(error.message)) return;
      throw error;
    });
  }

  async #assertWithinWorkspace(target: string): Promise<string> {
    if (target.includes("..")) {
      let depth = 0;
      for (const seg of target.split(sep)) { if (seg === ".." && ++depth > 0) throw new Error(`Path traversal: ${target}`); }
    }
    try {
      const real = await realpath(target);
      if (!isWithin(real, this.#workspaceRoot)) throw new Error(`Path escapes workspace: ${target} -> ${real}`);
      return real;
    } catch (error) {
      if (isNotFoundError(error)) {
        if (target.includes(`/.${randomUUID.toString().slice(0, 4)}`)) return target; // temp file
        const parent = dirname(target);
        try {
          const realParent = await realpath(parent);
          if (!isWithin(realParent, this.#workspaceRoot)) throw new Error(`Parent path escapes: ${parent}`);
        } catch { /* parent may not exist yet — checked by #ensureDayDir first */ }
        return target;
      }
      throw error;
    }
  }

  async #assertNoSymlinkEscape(target: string): Promise<void> {
    let current = target;
    while (true) {
      const parent = dirname(current);
      if (parent === current) return;
      try {
        const stat = await lstat(parent);
        if (stat.isSymbolicLink()) {
          const real = await realpath(parent);
          if (!isWithin(real, this.#workspaceRoot)) throw new Error(`Symlink escapes: ${parent}`);
        }
        return;
      } catch (error) { if (isNotFoundError(error)) { current = parent; continue; } throw error; }
    }
  }
}

async function realpath(p: string): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(p);
}

function safeRealpathSync(path: string): string {
  try { return realpathSync(path); } catch { return path; }
}

function isWithin(candidate: string, root: string): boolean {
  if (candidate === root) return true;
  return candidate.startsWith(root.endsWith(sep) ? root : root + sep);
}

function isAlreadyExistsError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "EEXIST");
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT");
}

function comparatorByDayAndName(a: DiscussionReadEntry, b: DiscussionReadEntry): number {
  // Normalise extracted date to 8-digit YYYYMMDD.  Old IDs use 4-digit
  // MMDD; new IDs use 8-digit YYYYMMDD.
  const norm = (id: string): string => {
    const m = /^DISC-(\d{4,8})-/u.exec(id);
    const raw = m?.[1] ?? "";
    if (raw.length === 4) return `2026${raw}`; // infer year for old format
    return raw.padStart(8, "0");
  };
  const da = norm(a.id);
  const db = norm(b.id);
  if (da !== db) return da < db ? -1 : 1;
  if (a.fileName === b.fileName) return 0;
  return a.fileName < b.fileName ? -1 : 1;
}
