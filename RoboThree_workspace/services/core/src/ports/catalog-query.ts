import type {
  GetRobotCatalogQuery,
  GetToolCatalogQuery,
  ListRobotCatalogQuery,
  ListToolCatalogQuery,
  RegistrySnapshot,
  RobotCatalogDetail,
  RobotCatalogPage,
  ToolCatalogDetail,
  ToolCatalogPage,
} from "@robothree/contracts";

export type CatalogKind = "robot" | "tool";

export type CatalogCursorProof = Readonly<{
  kind: CatalogKind;
  queryRevision: string;
  lastNormalizedName: string;
  lastStableId: string;
}>;

export interface CatalogCursorCodec {
  seal(proof: CatalogCursorProof): string;
  open(token: string): CatalogCursorProof;
}

export interface TrustedRegistrySnapshotProvider {
  loadCurrentRegistrySnapshot(): Promise<RegistrySnapshot | undefined>;
}

export interface RobotCatalogQuery {
  list(input: ListRobotCatalogQuery): Promise<RobotCatalogPage>;
  get(input: GetRobotCatalogQuery): Promise<RobotCatalogDetail>;
}

export interface ToolCatalogQuery {
  list(input: ListToolCatalogQuery): Promise<ToolCatalogPage>;
  get(input: GetToolCatalogQuery): Promise<ToolCatalogDetail>;
}

export type CatalogQueryErrorCode =
  | "catalog.cursor_invalid"
  | "catalog.integrity_violation"
  | "catalog.invalid_query"
  | "catalog.registry_unavailable"
  | "catalog.response_too_large"
  | "catalog.robot_not_found"
  | "catalog.stale_cursor"
  | "catalog.tool_not_found";

export class CatalogQueryError extends Error {
  readonly code: CatalogQueryErrorCode;

  constructor(code: CatalogQueryErrorCode, message: string) {
    super(message);
    this.name = "CatalogQueryError";
    this.code = code;
  }
}
