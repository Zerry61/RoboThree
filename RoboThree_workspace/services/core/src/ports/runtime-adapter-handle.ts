export type RuntimeAdapterKind =
  | "model_provider"
  | "tool_catalog_provider"
  | "tool_execution_backend";

export interface RuntimeAdapterHandle {
  readonly adapterDescriptorId: string;
  readonly adapterDescriptorRevision: string;
  readonly adapterKind: RuntimeAdapterKind;
}
