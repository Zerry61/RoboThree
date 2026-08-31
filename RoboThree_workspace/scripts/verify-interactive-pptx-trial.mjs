import { DatabaseSync } from "node:sqlite";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const [, , databasePath, workspaceRoot, startedAtValue] = process.argv;
const startedAtMs = Number(startedAtValue);
if (!databasePath || !workspaceRoot || !Number.isFinite(startedAtMs)) {
  throw new Error("interactive_trial_verifier_input_invalid");
}

const database = new DatabaseSync(databasePath, { readOnly: true });
try {
  const taskFacts = database.prepare(`
    SELECT
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN status IN ('created', 'running', 'waiting') THEN 1 ELSE 0 END)
        AS nonterminal_count
    FROM task_heads
    WHERE updated_at >= ?
  `).get(new Date(startedAtMs).toISOString());
  const pptxFiles = await recentPptxFiles(workspaceRoot, startedAtMs);
  const result = {
    status: Number(taskFacts?.completed_count ?? 0) > 0
      && Number(taskFacts?.nonterminal_count ?? 0) === 0
      && pptxFiles.length > 0
      ? "PASS"
      : "FAIL",
    completedTaskCount: Number(taskFacts?.completed_count ?? 0),
    nonterminalTaskCount: Number(taskFacts?.nonterminal_count ?? 0),
    pptxArtifactCount: pptxFiles.length,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
} finally {
  database.close();
}

async function recentPptxFiles(root, startedAt) {
  const matches = [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pptx")) continue;
    const parentPath = entry.parentPath ?? entry.path;
    const filePath = join(parentPath, entry.name);
    const metadata = await stat(filePath).catch(() => undefined);
    if (metadata !== undefined && metadata.mtimeMs >= startedAt) matches.push(filePath);
  }
  return matches;
}
