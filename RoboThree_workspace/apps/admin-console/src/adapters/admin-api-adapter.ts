import {
  ADMIN_CONTROL_CONTRACT_VERSION,
  AdminAuditEventPageSchema,
  AdminControlCapabilityProjectionSchema,
  AdminControlEnvelopeMetadataSchema,
  AdminControlSafeErrorSchema,
  AdminKnowledgeDetailSchema,
  AdminKnowledgePageSchema,
  AdminModelDetailSchema,
  AdminModelPageSchema,
  AdminRobotDetailSchema,
  AdminRobotPageSchema,
  AdminSkillDetailSchema,
  AdminSkillPageSchema,
  AdminToolDetailSchema,
  AdminToolPageSchema,
} from '@robothree/contracts/admin-control/v1alpha1';
import {
  ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION,
  AdminControlV1Alpha2EnvelopeMetadataSchema,
  AdminControlV1Alpha2SafeErrorSchema,
  AdminManagedModelDetailSchema,
  AdminManagedModelPageSchema,
  AdminModelConnectionTestReceiptSchema,
  AdminModelMutationReceiptSchema,
  CreateAdminModelCommandSchema,
  SetAdminModelLifecycleCommandSchema,
  SetDefaultAdminModelCommandSchema,
  TestAdminModelConnectionCommandSchema,
  UpdateAdminModelCommandSchema,
  createAdminControlV1Alpha2SuccessEnvelopeSchema,
} from '@robothree/contracts/admin-control/v1alpha2';
import {
  AGENT_LIFECYCLE_CONTRACT_VERSION,
  AgentLifecycleSafeErrorSchema,
  ApproveRobotReviewCommandSchema,
  RejectRobotReviewCommandSchema,
  RobotLifecycleMutationReceiptSchema,
  RobotReviewDetailSchema,
  RobotReviewPageSchema,
} from '@robothree/contracts/agent-lifecycle/v1alpha1';
import type { AdminAdapter, AdminCapabilitySet, AdminListOptions } from './admin-adapter';
import { AdminApiError } from './admin-api-error';
export { AdminApiError } from './admin-api-error';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ETAG_ENTRIES = 32;
const BASE_PATH = '/admin/v1alpha1';
const MUTATION_BASE_PATH = '/admin/v1alpha2';
const ROBOT_REVIEW_BASE_PATH = '/admin/v1alpha2/robot-reviews';

type SchemaLike<T> = Readonly<{ parse(value: unknown): T }>;
type CachedResponse = Readonly<{ etag: string; data: unknown }>;

export function createAdminApiAdapter(fetchImplementation: typeof fetch = globalThis.fetch): AdminAdapter {
  const etags = new Map<string, CachedResponse>();

  async function request<T>(path: string, schema: SchemaLike<T>, options?: AdminListOptions): Promise<T> {
    return requestVersioned(path, schema, ADMIN_CONTROL_CONTRACT_VERSION, AdminControlSafeErrorSchema, AdminControlEnvelopeMetadataSchema, options);
  }

  async function requestV2<T>(path: string, schema: SchemaLike<T>, options?: AdminListOptions): Promise<T> {
    return requestVersioned(path, schema, ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION, AdminControlV1Alpha2SafeErrorSchema, AdminControlV1Alpha2EnvelopeMetadataSchema, options);
  }

  async function requestVersioned<T>(
    path: string,
    schema: SchemaLike<T>,
    contractVersion: string,
    errorSchema: SchemaLike<{ errorCode: string; safeSummary: string; correlationId: string }>,
    metadataSchema: SchemaLike<{ testIdentityUsed: boolean; productionIdentityReady: boolean; correlationId: string }>,
    options?: AdminListOptions,
  ): Promise<T> {
    if (!path.startsWith(`${BASE_PATH}/`) || path.includes('://')) {
      if (!path.startsWith(`${MUTATION_BASE_PATH}/`) || path.includes('://')) {
        throw new AdminApiError('invalid_request', '管理请求路径不合法');
      }
    }
    const url = new URL(path, globalThis.location?.origin ?? 'http://127.0.0.1');
    if (options?.cursor !== undefined) url.searchParams.set('cursor', options.cursor);
    if (options?.limit !== undefined) url.searchParams.set('limit', String(options.limit));
    const cacheKey = `${url.pathname}${url.search}`;
    const cached = etags.get(cacheKey);
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const requestId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    try {
      const response = await fetchImplementation(`${url.pathname}${url.search}`, {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'X-RoboThree-Contract-Version': contractVersion,
          'X-RoboThree-Query-Id': requestId,
          'X-RoboThree-Correlation-Id': correlationId,
          ...(cached === undefined ? {} : { 'If-None-Match': cached.etag })
        }
      });
      if (response.status === 304) {
        if (cached === undefined) throw new AdminApiError('service_unavailable', '缓存响应不可验证', correlationId);
        return schema.parse(cached.data);
      }
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new AdminApiError('service_unavailable', '管理响应超过安全大小限制', correlationId);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new AdminApiError('service_unavailable', '管理响应格式不受支持', correlationId);
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new AdminApiError('service_unavailable', '管理响应超过安全大小限制', correlationId);
      }
      const json: unknown = JSON.parse(text);
      if (!response.ok) {
        const safeError = errorSchema.parse(json);
        throw new AdminApiError(safeError.errorCode, safeError.safeSummary, safeError.correlationId);
      }
      const envelopeRecord = requireExactRecord(json, ['contractVersion', 'requestId', 'correlationId', 'serverTime', 'testIdentityUsed', 'productionIdentityReady', 'data']);
      const metadata = metadataSchema.parse({
        contractVersion: envelopeRecord.contractVersion,
        requestId: envelopeRecord.requestId,
        correlationId: envelopeRecord.correlationId,
        serverTime: envelopeRecord.serverTime,
        testIdentityUsed: envelopeRecord.testIdentityUsed,
        productionIdentityReady: envelopeRecord.productionIdentityReady
      });
      if (!metadata.testIdentityUsed || metadata.productionIdentityReady) {
        throw new AdminApiError('admin_session_required', '当前联调身份不可验证', metadata.correlationId);
      }
      const data = schema.parse(envelopeRecord.data);
      const etag = response.headers.get('etag');
      if (etag !== null) rememberEtag(etags, cacheKey, { etag, data });
      return data;
    } catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (controller.signal.aborted) throw new AdminApiError('service_unavailable', '管理请求超时', correlationId);
      throw new AdminApiError('service_unavailable', '管理能力暂不可用', correlationId);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async function getCurrentCapabilities(): Promise<AdminCapabilitySet> {
    const raw = await request(`${BASE_PATH}/capabilities/current`, {
      parse(value: unknown) {
        const record = requireExactRecord(value, ['capabilitySetRevision', 'capabilities']);
        const capabilitySetRevision = requireString(record.capabilitySetRevision);
        if (!Array.isArray(record.capabilities)) throw new Error('capabilities must be an array');
        return {
          capabilitySetRevision,
          capabilities: record.capabilities.map((item) => AdminControlCapabilityProjectionSchema.parse(item))
        };
      }
    });
    const result: AdminCapabilitySet = { ...raw, testIdentityUsed: true, productionIdentityReady: false };
    return result;
  }

  return Object.freeze({
    getCurrentCapabilities,
    listModels: (options) => request(`${BASE_PATH}/models`, AdminModelPageSchema, options),
    getModel: (id) => request(`${BASE_PATH}/models/${encodeResourceId(id)}`, AdminModelDetailSchema),
    listManagedModels: (options) => requestV2(`${MUTATION_BASE_PATH}/models`, AdminManagedModelPageSchema, options),
    getManagedModel: (id) => requestV2(`${MUTATION_BASE_PATH}/models/${encodeResourceId(id)}`, AdminManagedModelDetailSchema),
    listRobots: (options) => request(`${BASE_PATH}/robots`, AdminRobotPageSchema, options),
    getRobot: (id) => request(`${BASE_PATH}/robots/${encodeResourceId(id)}`, AdminRobotDetailSchema),
    listRobotReviews: (state) => requestRobotReviewPage(state),
    getRobotReview: (submissionId) => requestAgentLifecycle(
      `${ROBOT_REVIEW_BASE_PATH}/${encodeUuid(submissionId)}`,
      RobotReviewDetailSchema,
    ),
    approveRobotReview: (command) => mutateAgentLifecycle(ApproveRobotReviewCommandSchema.parse(command)),
    rejectRobotReview: (command) => mutateAgentLifecycle(RejectRobotReviewCommandSchema.parse(command)),
    listSkills: (options) => request(`${BASE_PATH}/skills`, AdminSkillPageSchema, options),
    getSkill: (id) => request(`${BASE_PATH}/skills/${encodeResourceId(id)}`, AdminSkillDetailSchema),
    listTools: (options) => request(`${BASE_PATH}/tools`, AdminToolPageSchema, options),
    getTool: (id) => request(`${BASE_PATH}/tools/${encodeResourceId(id)}`, AdminToolDetailSchema),
    listKnowledge: (options) => request(`${BASE_PATH}/knowledge`, AdminKnowledgePageSchema, options),
    getKnowledge: (id) => request(`${BASE_PATH}/knowledge/${encodeResourceId(id)}`, AdminKnowledgeDetailSchema),
    listAuditEvents: (options) => request(`${BASE_PATH}/system/audit-events`, AdminAuditEventPageSchema, options),
    createModel: (command) => mutate(
      `${MUTATION_BASE_PATH}/models`,
      CreateAdminModelCommandSchema.parse(command),
      createAdminControlV1Alpha2SuccessEnvelopeSchema(AdminModelMutationReceiptSchema),
    ),
    updateModel: (command) => mutate(
      `${MUTATION_BASE_PATH}/models/${encodeResourceId(command.modelId)}`,
      UpdateAdminModelCommandSchema.parse(command),
      createAdminControlV1Alpha2SuccessEnvelopeSchema(AdminModelMutationReceiptSchema),
    ),
    testModelConnection: (command) => mutate(
      `${MUTATION_BASE_PATH}/models/${encodeResourceId(command.modelId)}/connection-tests`,
      TestAdminModelConnectionCommandSchema.parse(command),
      createAdminControlV1Alpha2SuccessEnvelopeSchema(AdminModelConnectionTestReceiptSchema),
    ),
    setModelLifecycle: (command) => mutate(
      `${MUTATION_BASE_PATH}/models/${encodeResourceId(command.modelId)}/lifecycle`,
      SetAdminModelLifecycleCommandSchema.parse(command),
      createAdminControlV1Alpha2SuccessEnvelopeSchema(AdminModelMutationReceiptSchema),
    ),
    setDefaultModel: (command) => mutate(
      `${MUTATION_BASE_PATH}/models/default`,
      SetDefaultAdminModelCommandSchema.parse(command),
      createAdminControlV1Alpha2SuccessEnvelopeSchema(AdminModelMutationReceiptSchema),
    )
  });

  async function mutate<TCommand extends object, TEnvelope extends { data: unknown }>(
    path: string,
    command: TCommand,
    schema: SchemaLike<TEnvelope>,
  ): Promise<TEnvelope['data']> {
    if (!path.startsWith(`${MUTATION_BASE_PATH}/`) || path.includes('://')) {
      throw new AdminApiError('invalid_request', '管理请求路径不合法');
    }
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const correlationId = 'correlationId' in command && typeof command.correlationId === 'string'
      ? command.correlationId
      : crypto.randomUUID();
    try {
      const body = JSON.stringify(command);
      if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
        throw new AdminApiError('invalid_request', '管理请求超过安全大小限制', correlationId);
      }
      const response = await fetchImplementation(path, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        body,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-RoboThree-Contract-Version': ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION,
          'X-RoboThree-Correlation-Id': correlationId
        }
      });
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new AdminApiError('service_unavailable', '管理响应超过安全大小限制', correlationId);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new AdminApiError('service_unavailable', '管理响应格式不受支持', correlationId);
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new AdminApiError('service_unavailable', '管理响应超过安全大小限制', correlationId);
      }
      const json: unknown = JSON.parse(text);
      if (!response.ok) {
        const safeError = AdminControlV1Alpha2SafeErrorSchema.parse(json);
        throw new AdminApiError(safeError.errorCode, safeError.safeSummary, safeError.correlationId);
      }
      const envelope = schema.parse(json);
      if (!isSafeMutationEnvelope(envelope)) {
        throw new AdminApiError('admin_session_required', '当前联调身份不可验证', correlationId);
      }
      return envelope.data;
    } catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (controller.signal.aborted) throw new AdminApiError('service_unavailable', '管理请求超时', correlationId);
      throw new AdminApiError('service_unavailable', '管理能力暂不可用', correlationId);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async function requestRobotReviewPage(
    state?: 'pending_review' | 'approved' | 'rejected' | 'withdrawn',
  ) {
    const suffix = state === undefined ? '' : `?state=${encodeURIComponent(state)}`;
    return requestAgentLifecycle(`${ROBOT_REVIEW_BASE_PATH}${suffix}`, RobotReviewPageSchema);
  }

  async function requestAgentLifecycle<T>(path: string, schema: SchemaLike<T>): Promise<T> {
    if (!path.startsWith(ROBOT_REVIEW_BASE_PATH) || path.includes('://')) {
      throw new AdminApiError('invalid_request', '机器人审核请求路径不合法');
    }
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const correlationId = crypto.randomUUID();
    try {
      const response = await fetchImplementation(path, {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'X-RoboThree-Contract-Version': AGENT_LIFECYCLE_CONTRACT_VERSION,
          'X-RoboThree-Query-Id': crypto.randomUUID(),
          'X-RoboThree-Correlation-Id': correlationId,
        },
      });
      return parseAgentLifecycleResponse(response, schema, correlationId);
    } catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (controller.signal.aborted) throw new AdminApiError('service_unavailable', '机器人审核请求超时', correlationId);
      throw new AdminApiError('service_unavailable', '机器人审核能力暂不可用', correlationId);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async function mutateAgentLifecycle(
    command: ReturnType<typeof ApproveRobotReviewCommandSchema.parse>
      | ReturnType<typeof RejectRobotReviewCommandSchema.parse>,
  ) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImplementation(`${ROBOT_REVIEW_BASE_PATH}/commands`, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify(command),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-RoboThree-Contract-Version': AGENT_LIFECYCLE_CONTRACT_VERSION,
          'X-RoboThree-Correlation-Id': command.correlationId,
        },
      });
      return parseAgentLifecycleResponse(response, RobotLifecycleMutationReceiptSchema, command.correlationId);
    } catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (controller.signal.aborted) throw new AdminApiError('service_unavailable', '机器人审核操作超时', command.correlationId);
      throw new AdminApiError('service_unavailable', '机器人审核操作暂不可用', command.correlationId);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

async function parseAgentLifecycleResponse<T>(
  response: Response,
  schema: SchemaLike<T>,
  correlationId: string,
): Promise<T> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new AdminApiError('service_unavailable', '机器人审核响应超过安全大小限制', correlationId);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new AdminApiError('service_unavailable', '机器人审核响应格式不受支持', correlationId);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new AdminApiError('service_unavailable', '机器人审核响应超过安全大小限制', correlationId);
  }
  const json: unknown = JSON.parse(text);
  if (!response.ok) {
    const safeError = AgentLifecycleSafeErrorSchema.parse(json);
    throw new AdminApiError(safeError.errorCode, safeError.safeSummary, safeError.correlationId);
  }
  return schema.parse(json);
}

function rememberEtag(cache: Map<string, CachedResponse>, key: string, value: CachedResponse): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_ETAG_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function encodeResourceId(value: string): string {
  if (!/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u.test(value)) {
    throw new AdminApiError('invalid_request', '资源标识不合法');
  }
  return encodeURIComponent(value);
}

function encodeUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new AdminApiError('invalid_request', '审核记录标识不合法');
  }
  return encodeURIComponent(value);
}

function requireExactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('object required');
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('unexpected capability response fields');
  }
  return record;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('string required');
  return value;
}

function isSafeMutationEnvelope(value: { [key: string]: unknown }): value is {
  testIdentityUsed: true;
  productionIdentityReady: false;
  data: unknown;
} {
  return value.testIdentityUsed === true && value.productionIdentityReady === false;
}
