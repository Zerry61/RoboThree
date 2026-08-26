import {
  JsonValueSchema,
  PersistenceSchemaVersion,
  TaskRunStateSchema,
  type Action,
  type Observation,
  type TaskRunState,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  projectArtifactIndexForTask,
  projectArtifactSurfaceRefs,
  projectArtifactTextPreview,
  sha256CanonicalJson,
  type PersistedTask,
} from "../src/index.js";

const entityId = (value: number) =>
  `019f9990-0000-7000-8000-${String(value).padStart(12, "0")}`;
const at = "2026-08-05T09:00:00.000Z";
const later = "2026-08-05T09:01:00.000Z";

describe("APV-1.0 Artifact Preview projection foundation", () => {
  it("projects XLSX write artifacts without leaking workbook payloads or absolute paths", () => {
    const observation = succeededObservation({
      observationId: entityId(20),
      actionId: entityId(10),
      output: xlsxWriteOutput({
        relativePath: "reports/out.xlsx",
        sha256: "a".repeat(64),
        logicalWorkbookDigest: "b".repeat(64),
      }),
    });
    const task = persistedTask([
      step({
        stepId: entityId(30),
        action: {
          actionId: entityId(10),
          kind: "tool.document.xlsx.write",
          payload: {
            workspaceRoot: "/Users/example/private-root",
            workbook: { sheets: [{ name: "Secrets", rows: [["do-not-leak"]] }] },
            relativePath: "ignored/action-path.xlsx",
          },
        },
        observation,
      }),
    ]);

    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop-a",
    });

    expect(entry).toMatchObject({
      schemaVersion: "robothree-artifact-preview/v1alpha1",
      taskId: `task:${task.head.taskId}`,
      sessionId: "session:desktop-a",
      sourceKind: "tool_observation",
      sourceId: observation.observationId,
      sourceDigest: sha256CanonicalJson(JsonValueSchema.parse(observation)),
      displayName: "out.xlsx",
      kind: "spreadsheet",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      relativePath: "reports/out.xlsx",
      byteSize: 4096,
      previewState: "available",
    });
    expect(entry?.artifactId).toMatch(/^artifact:[0-9a-f]{64}$/u);
    expect(entry?.metadata).toMatchObject({
      capabilityId: "tool.document.xlsx.write",
      status: "succeeded",
      fileSha256: "a".repeat(64),
      logicalWorkbookDigest: "b".repeat(64),
      sheetCount: 1,
      cellCount: 2,
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("/Users/example/private-root");
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain("workbook");
  });

  it("keeps sessionId as projection context rather than artifact identity", () => {
    const task = persistedTask([
      step({
        stepId: entityId(31),
        action: {
          actionId: entityId(11),
          kind: "tool.document.xlsx.write",
          payload: {},
        },
        observation: succeededObservation({
          observationId: entityId(21),
          actionId: entityId(11),
          output: xlsxWriteOutput({
            relativePath: "reports/same.xlsx",
            sha256: "c".repeat(64),
            logicalWorkbookDigest: "d".repeat(64),
          }),
        }),
      }),
    ]);

    const [first] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:first",
    });
    const [second] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:second",
    });

    expect(first?.artifactId).toBe(second?.artifactId);
    expect(first?.sourceDigest).toBe(second?.sourceDigest);
    expect(first?.sessionId).toBe("session:first");
    expect(second?.sessionId).toBe("session:second");
  });

  it("returns one stable artifact ref set for conversation cards, panel, and task detail", () => {
    const entries = projectArtifactIndexForTask({
      task: persistedTask([
        step({
          stepId: entityId(32),
          action: {
            actionId: entityId(12),
            kind: "tool.document.pdf.extract_text",
            payload: { relativePath: "docs/input.pdf" },
          },
          observation: succeededObservation({
            observationId: entityId(22),
            actionId: entityId(12),
            output: {
              status: "succeeded",
              result: { format: "pdf", pageCount: 1, pages: [] },
              metadata: {
                originalCount: 1,
                returnedCount: 1,
                truncated: false,
                resultDigest: "e".repeat(64),
                timingMs: 1,
              },
            },
          }),
        }),
      ]),
      desktopSessionId: "session:desktop",
    });

    const surfaces = projectArtifactSurfaceRefs(entries);

    expect(surfaces.conversationCards).toEqual(surfaces.artifactPanel);
    expect(surfaces.artifactPanel).toEqual(surfaces.taskDetail);
    expect(surfaces.conversationCards).toEqual([
      {
        artifactId: entries[0]?.artifactId,
        displayName: "input.pdf",
        kind: "document",
        previewState: "available",
      },
    ]);
  });

  it("projects PDF table artifacts as bounded document previews without raw table JSON", () => {
    const observation = succeededObservation({
      observationId: entityId(120),
      actionId: entityId(110),
      output: {
        status: "succeeded",
        result: {
          format: "pdf",
          extraction: "tables",
          pageCount: 1,
          selectedPageCount: 1,
          warnings: ["ambiguous_columns"],
          tables: [{
            pageNumber: 1,
            tableIndex: 1,
            rowCount: 2,
            columnCount: 2,
            confidence: 0.8,
            locator: { pageNumber: 1, tableIndex: 1 },
            warnings: [],
            rows: [
              {
                rowIndex: 1,
                cells: [
                  { rowIndex: 1, columnIndex: 1, text: "Region", confidence: 1, warnings: [] },
                  { rowIndex: 1, columnIndex: 2, text: "Q1", confidence: 1, warnings: [] },
                ],
              },
              {
                rowIndex: 2,
                cells: [
                  { rowIndex: 2, columnIndex: 1, text: "North", confidence: 1, warnings: [] },
                  { rowIndex: 2, columnIndex: 2, text: "120", confidence: 1, warnings: [] },
                ],
              },
            ],
          }],
        },
        metadata: {
          originalCount: 1,
          returnedCount: 1,
          truncated: false,
          resultDigest: "9".repeat(64),
          timingMs: 1,
        },
      },
    });
    const task = persistedTask([
      step({
        stepId: entityId(130),
        action: {
          actionId: entityId(110),
          kind: "tool.document.pdf.extract_tables",
          payload: {
            workspaceRoot: "/Users/example/private-root",
            relativePath: "reports/tables.pdf",
          },
        },
        observation,
      }),
    ]);

    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
    });

    expect(entry).toMatchObject({
      displayName: "tables.pdf",
      kind: "document",
      mediaType: "application/pdf",
      relativePath: "reports/tables.pdf",
      previewState: "available",
      metadata: {
        capabilityId: "tool.document.pdf.extract_tables",
        pageCount: 1,
        tableCount: 1,
        returnedCellCount: 4,
        warningCount: 1,
      },
    });
    expect(JSON.stringify(entry)).not.toContain("/Users/example/private-root");
    expect(JSON.stringify(entry)).not.toContain("\"tables\"");
    expect(JSON.stringify(entry)).not.toContain("North");

    const preview = projectArtifactTextPreview({
      task,
      desktopSessionId: "session:desktop",
      artifactId: entry!.artifactId,
      mode: "markdown",
      maxBytes: 4_096,
    });

    expect(preview).toMatchObject({
      ok: true,
      value: {
        content: expect.stringContaining("| Region | Q1 |"),
        truncated: false,
      },
    });
    expect(JSON.stringify(preview)).not.toContain("/Users/example/private-root");
    expect(JSON.stringify(preview)).not.toContain("\"tables\"");
  });

  it("ignores failed observations and non-document tools", () => {
    const task = persistedTask([
      step({
        stepId: entityId(33),
        sequence: 1,
        action: {
          actionId: entityId(13),
          kind: "tool.echo",
          payload: { relativePath: "reports/echo.xlsx" },
        },
        observation: succeededObservation({
          observationId: entityId(23),
          actionId: entityId(13),
          output: { value: "not an artifact" },
        }),
      }),
      step({
        stepId: entityId(34),
        sequence: 2,
        action: {
          actionId: entityId(14),
          kind: "tool.document.docx.read",
          payload: { relativePath: "docs/fail.docx" },
        },
        observation: {
          observationId: entityId(24),
          actionId: entityId(14),
          observedAt: later,
          outcome: "failed",
          error: {
            code: "document_worker.invalid_format",
            category: "validation",
            message: "invalid DOCX",
            retryable: false,
          },
        },
      }),
    ]);

    expect(projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
    })).toEqual([]);
  });

  it("blocks unsafe relative paths without projecting the rejected path", () => {
    const task = persistedTask([
      step({
        stepId: entityId(35),
        action: {
          actionId: entityId(15),
          kind: "tool.document.pdf.extract_text",
          payload: { relativePath: "../private/input.pdf" },
        },
        observation: succeededObservation({
          observationId: entityId(25),
          actionId: entityId(15),
          output: {
            status: "succeeded",
            result: { format: "pdf", pageCount: 1, pages: [] },
            metadata: {
              originalCount: 1,
              returnedCount: 1,
              truncated: false,
              resultDigest: "f".repeat(64),
              timingMs: 1,
            },
          },
        }),
      }),
    ]);

    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
    });

    expect(entry).toMatchObject({
      previewState: "blocked",
      displayName: "PDF text extraction",
    });
    expect(entry?.relativePath).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("../private");
  });

  it("bounds metadata deterministically before projection", () => {
    const task = persistedTask([
      step({
        stepId: entityId(36),
        action: {
          actionId: entityId(16),
          kind: "tool.document.xlsx.read",
          payload: { relativePath: "reports/large.xlsx" },
        },
        observation: succeededObservation({
          observationId: entityId(26),
          actionId: entityId(16),
          output: {
            status: "truncated",
            result: {
              format: "xlsx",
              dateSystem: "1900",
              sheets: Array.from({ length: 20 }, (_, index) => ({
                index,
                name: `Sheet ${index + 1}`,
                visibility: "visible",
                usedRange: null,
                rows: [{ rowNumber: 1, cells: [{ address: "A1", column: "A", type: "string", value: "x" }] }],
              })),
            },
            metadata: {
              originalCount: 20,
              returnedCount: 20,
              truncated: true,
              resultDigest: "1".repeat(64),
              timingMs: 1,
            },
          },
        }),
      }),
    ]);

    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
      maxMetadataBytes: 40,
    });

    expect(entry?.metadata).toEqual({
      truncated: true,
      originalMetadataBytes: expect.any(Number),
    });
    expect(new TextEncoder().encode(JSON.stringify(entry?.metadata)).byteLength)
      .toBeLessThanOrEqual(64);
  });

  it("projects bounded APV-1B text previews from successful document observations", () => {
    const task = persistedTask([
      step({
        stepId: entityId(37),
        action: {
          actionId: entityId(17),
          kind: "tool.document.docx.read",
          payload: {
            workspaceRoot: "/Users/example/private-root",
            relativePath: "docs/brief.docx",
            workbook: { sheets: [{ name: "Secrets", rows: [["do-not-leak"]] }] },
          },
        },
        observation: succeededObservation({
          observationId: entityId(27),
          actionId: entityId(17),
          output: {
            status: "succeeded",
            result: {
              format: "docx",
              metadata: { sectionCount: 1 },
              blocks: [
                { kind: "heading", content: "Quarterly brief" },
                { kind: "paragraph", content: "Alpha beta" },
                {
                  kind: "table",
                  rows: [{
                    cells: [
                      { content: "Name", colSpan: 1, rowSpan: 1 },
                      { content: "Value", colSpan: 1, rowSpan: 1 },
                    ],
                  }],
                },
              ],
            },
            metadata: {
              originalCount: 3,
              returnedCount: 3,
              truncated: false,
              resultDigest: "4".repeat(64),
              timingMs: 1,
            },
          },
        }),
      }),
    ]);
    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
    });
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const result = projectArtifactTextPreview({
      task,
      desktopSessionId: "session:desktop",
      artifactId: entry.artifactId,
      mode: "markdown",
      maxBytes: 64,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      artifactId: entry?.artifactId,
      mode: "markdown",
      truncated: true,
      warnings: ["preview_truncated"],
    });
    expect(result.value.byteSize).toBeLessThanOrEqual(64);
    const serialized = JSON.stringify(result.value);
    expect(serialized).toContain("Quarterly brief");
    expect(serialized).not.toContain("/Users/example/private-root");
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain("workbook");
  });

  it("returns safe APV-1B metadata previews for XLSX write artifacts", () => {
    const observation = succeededObservation({
      observationId: entityId(28),
      actionId: entityId(18),
      output: xlsxWriteOutput({
        relativePath: "reports/created.xlsx",
        sha256: "7".repeat(64),
        logicalWorkbookDigest: "8".repeat(64),
      }),
    });
    const task = persistedTask([
      step({
        stepId: entityId(38),
        action: {
          actionId: entityId(18),
          kind: "tool.document.xlsx.write",
          payload: {
            workspaceRoot: "/Users/example/private-root",
            workbook: { sheets: [{ name: "Secrets", rows: [["do-not-leak"]] }] },
          },
        },
        observation,
      }),
    ]);
    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
    });
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const result = projectArtifactTextPreview({
      task,
      desktopSessionId: "session:desktop",
      artifactId: entry.artifactId,
      mode: "text",
      maxBytes: 4096,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toContain("Created: reports/created.xlsx");
    expect(result.value.content).toContain(`Logical digest: ${"8".repeat(64)}`);
    expect(JSON.stringify(result.value)).not.toContain("do-not-leak");
    expect(JSON.stringify(result.value)).not.toContain("workspaceRoot");
  });

  it("projects PPTX write artifacts as document files without text preview or presentation payload leaks", () => {
    const observation = succeededObservation({
      observationId: entityId(40),
      actionId: entityId(20),
      output: pptxWriteOutput({
        relativePath: "reports/deck.pptx",
        sha256: "a".repeat(64),
        presentationDigest: "b".repeat(64),
      }),
    });
    const task = persistedTask([
      step({
        stepId: entityId(41),
        action: {
          actionId: entityId(20),
          kind: "tool.document.pptx.write",
          payload: {
            workspaceRoot: "/Users/example/private-root",
            presentation: { title: "Secret strategy", slides: [] },
            relativePath: "ignored/action-path.pptx",
          },
        },
        observation,
      }),
    ]);
    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
    });

    expect(entry).toMatchObject({
      displayName: "deck.pptx",
      kind: "document",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      relativePath: "reports/deck.pptx",
      byteSize: 8192,
      previewState: "available",
      metadata: {
        capabilityId: "tool.document.pptx.write",
        fileSha256: "a".repeat(64),
        presentationDigest: "b".repeat(64),
        slideCount: 2,
      },
    });
    expect(JSON.stringify(entry)).not.toContain("/Users/example/private-root");
    expect(JSON.stringify(entry)).not.toContain("Secret strategy");
    expect(JSON.stringify(entry)).not.toContain("\"slides\"");
    if (entry === undefined) return;
    expect(projectArtifactTextPreview({
      task,
      desktopSessionId: "session:desktop",
      artifactId: entry.artifactId,
      mode: "text",
      maxBytes: 4096,
    })).toEqual({ ok: false, reason: "unsupported" });
  });

  it("fails APV-1B previews closed for blocked paths and unknown artifact IDs", () => {
    const task = persistedTask([
      step({
        stepId: entityId(39),
        action: {
          actionId: entityId(19),
          kind: "tool.document.pdf.extract_text",
          payload: { relativePath: "../private/input.pdf" },
        },
        observation: succeededObservation({
          observationId: entityId(29),
          actionId: entityId(19),
          output: {
            status: "succeeded",
            result: { format: "pdf", pageCount: 1, pages: [{ pageNumber: 1, text: "secret" }] },
            metadata: {
              originalCount: 1,
              returnedCount: 1,
              truncated: false,
              resultDigest: "9".repeat(64),
              timingMs: 1,
            },
          },
        }),
      }),
    ]);
    const [entry] = projectArtifactIndexForTask({
      task,
      desktopSessionId: "session:desktop",
    });
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    expect(projectArtifactTextPreview({
      task,
      desktopSessionId: "session:desktop",
      artifactId: entry.artifactId,
      mode: "text",
      maxBytes: 4096,
    })).toEqual({ ok: false, reason: "unavailable" });
    expect(projectArtifactTextPreview({
      task,
      desktopSessionId: "session:desktop",
      artifactId: `artifact:${"0".repeat(64)}`,
      mode: "text",
      maxBytes: 4096,
    })).toEqual({ ok: false, reason: "not_found" });
  });
});

function persistedTask(steps: readonly TaskRunState["runs"][number]["steps"][number][]): PersistedTask {
  const state = TaskRunStateSchema.parse({
    taskId: entityId(1),
    sessionId: entityId(2),
    agentDefinition: { agentDefinitionId: "agent.general", version: "1.0.0" },
    goal: "project artifacts",
    status: "completed",
    revision: 2,
    runs: [{
      runId: entityId(3),
      attempt: 1,
      status: "succeeded",
      steps,
      startedAt: at,
      updatedAt: later,
      endedAt: later,
    }],
    createdAt: at,
    updatedAt: later,
    endedAt: later,
  });
  return {
    head: {
      schemaVersion: PersistenceSchemaVersion,
      taskId: state.taskId,
      initializationDigest: sha256CanonicalJson(JsonValueSchema.parse({
        taskId: state.taskId,
        goal: state.goal,
        agentDefinition: state.agentDefinition,
        createdAt: state.createdAt,
      })),
      stateRevision: state.revision,
      lastEventSequence: 2,
      latestCheckpointId: entityId(4),
      status: state.status,
      updatedAt: state.updatedAt,
    },
    checkpoint: {
      schemaVersion: PersistenceSchemaVersion,
      checkpointId: entityId(4),
      taskId: state.taskId,
      stateRevision: state.revision,
      lastEventSequence: 2,
      state,
      stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
      createdAt: later,
    },
  };
}

function step(input: {
  stepId: string;
  sequence?: number;
  action: Action;
  observation: Observation;
}): TaskRunState["runs"][number]["steps"][number] {
  const terminalError = input.observation.outcome === "succeeded"
    ? undefined
    : input.observation.error;
  return {
    stepId: input.stepId,
    sequence: input.sequence ?? 1,
    status: input.observation.outcome,
    planRevision: {
      executionPlanId: entityId(5),
      planRevisionId: entityId(6),
      revision: 1,
    },
    action: input.action,
    observation: input.observation,
    ...(terminalError === undefined ? {} : { terminalError }),
    startedAt: at,
    updatedAt: input.observation.observedAt,
    endedAt: input.observation.observedAt,
  };
}

function succeededObservation(input: {
  observationId: string;
  actionId: string;
  output: unknown;
}): Extract<Observation, { outcome: "succeeded" }> {
  return {
    observationId: input.observationId,
    actionId: input.actionId,
    observedAt: later,
    outcome: "succeeded",
    output: JsonValueSchema.parse(input.output),
  };
}

function xlsxWriteOutput(input: {
  relativePath: string;
  sha256: string;
  logicalWorkbookDigest: string;
}) {
  return {
    status: "succeeded",
    result: {
      format: "xlsx",
      relativePath: input.relativePath,
      sha256: input.sha256,
      logicalWorkbookDigest: input.logicalWorkbookDigest,
      byteSize: 4096,
      sheetCount: 1,
      cellCount: 2,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      warnings: [],
    },
    metadata: {
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      resultDigest: "9".repeat(64),
      timingMs: 1,
    },
  };
}

function pptxWriteOutput(input: {
  relativePath: string;
  sha256: string;
  presentationDigest: string;
}) {
  return {
    status: "succeeded",
    result: {
      format: "pptx",
      relativePath: input.relativePath,
      sha256: input.sha256,
      presentationDigest: input.presentationDigest,
      byteSize: 8192,
      slideCount: 2,
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      warnings: [],
    },
    metadata: {
      originalCount: 2,
      returnedCount: 2,
      truncated: false,
      resultDigest: "8".repeat(64),
      timingMs: 2,
    },
  };
}
