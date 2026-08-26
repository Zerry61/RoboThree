# OpenClaw — Pairing Security Model (L3 深挖)

> **深挖维度：A2 / 用户配对和身份识别的完整安全模型**
> Commit: `deccdb5e57af6800d4f020ea2034166592a149ba`
> 入口：`src/pairing/` + `src/infra/device-bootstrap.ts` + `src/state/openclaw-state-schema.sql`

## 1. 核心结论摘要

**OpenClaw 的 Pairing 不只是"配对"——它是分层的、分场景的、绑定身份与能力的多段式安全协议：**

1. **DM Pairing Channel**：消息渠道内用户身份认证（基于邀请码）
2. **Device Bootstrap**：设备首次接入的 token 握手（10 分钟 TTL）
3. **Channel Allow Store**：白名单持久化（SQLite）
4. **Bootstrap Profile**：角色 + 范围分级权限模型

## 2. 双层 Pairing 系统

**[F]** OpenClaw 维护**两套独立的 Pairing 系统**（根据代码梳理）：

| 层 | 作用 | 入口 | 存储 |
| --- | --- | --- | --- |
| **Layer 1: Channel Pairing** | 消息渠道上"某个 user ID"是否被允许与 Agent 交互 | [pairing-challenge.ts](../../sources/openclaw/src/pairing/pairing-challenge.ts:55-88) | SQLite `channel_pairing_requests` + `channel_pairing_allow_entries` |
| **Layer 2: Device Bootstrap** | "某个设备"是否被授权首次接入 Gateway | [device-bootstrap.ts](../../sources/openclaw/src/infra/device-bootstrap.ts) | SQLite `device_bootstrap_tokens` |

### 2.1 Layer 1: Channel Pairing

**[F]** Challenge 协议（[pairing-challenge.ts:55-88](../../sources/openclaw/src/pairing/pairing-challenge.ts#L55-L88)）：

```typescript
export async function issuePairingChallenge(params: {
  channel: string;             // telegram, whatsapp, ...
  accountId?: string;          // account-level scope
  senderId: string;            // user id from channel
  senderIdLine: string;
  meta?: PairingMeta;
  upsertPairingRequest: (params: { id: string; meta?: PairingMeta }) =>
    Promise<{ code: string; created: boolean }>;
  sendPairingReply: (text: string) => Promise<void>;
  ...
}): Promise<{ created: boolean; code?: string }>
```

**核心不变式**：
1. **只在新创建时响应** —— 若请求已存在，直接返回 `{ created: false }`
2. **审计 hook 不阻塞回复** —— `void runPairingRequestedHook().catch(() => undefined)`
3. **回复失败被吞掉** —— `try/catch + onReplyError` (不抛)
4. **用户消息包含 CLI 审批指令** —— 引导用户告诉 owner 去执行 `openclaw pairing approve <channel> <code>`

**[F]** Challenge 回复格式（[pairing-messages.ts](../../sources/openclaw/src/pairing/pairing-messages.ts)）：

```
OpenClaw: access not configured.

<senderIdLine>
Pairing code:
```
<code>
```

Ask the bot owner to approve with:
```
openclaw pairing approve <channel> <code>
```
```

### 2.2 Layer 1 Storage Schema

**[F]** SQLite schema（[openclaw-state-schema.sql:620-647](../../sources/openclaw/src/state/openclaw-state-schema.sql#L620-L647)）：

```sql
CREATE TABLE IF NOT EXISTS channel_pairing_requests (
  channel_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  meta_json TEXT,                    -- JSON blob for extensions
  PRIMARY KEY (channel_key, account_id, request_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_channel_pairing_requests_code
  ON channel_pairing_requests(channel_key, code);

CREATE INDEX IF NOT EXISTS idx_channel_pairing_requests_created
  ON channel_pairing_requests(channel_key, created_at, request_id);

CREATE TABLE IF NOT EXISTS channel_pairing_allow_entries (
  channel_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  entry TEXT NOT NULL,               -- user id (numeric, etc.)
  sort_order INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (channel_key, account_id, entry)
) STRICT;
```

**[F]** 关键 storage semantics（[pairing-store-sqlite.ts:205-216](../../sources/openclaw/src/pairing/pairing-store-sqlite.ts#L205-L216)）：
- `updateChannelPairingStateSnapshot<T>(channel, env, update: (state) => T)` —— **同步事务式读写**
- 使用 `runOpenClawStateWriteTransaction` 包裹 read-modify-write
- 完全 delete + insert 重写（无 upsert conflict 处理）

**[F]** Indexed Column 决定 account scope（[pairing-store-sqlite.ts:125-127](../../sources/openclaw/src/pairing/pairing-store-sqlite.ts#L125-L127)）：
> "The indexed column owns request scope. Duplicated metadata may be absent or stale and must never move a request or approval across accounts during a state rewrite."

—— 这是一个**安全断言**：禁止通过修改 metadata 来"跨账户转移" pairing 授权。

### 2.3 Layer 2: Device Bootstrap

**[F]** Device Bootstrap Token 设计（[device-bootstrap.ts:30-40](../../sources/openclaw/src/infra/device-bootstrap.ts#L30-L40)）：

```typescript
const DEVICE_BOOTSTRAP_TOKEN_TTL_MS = 10 * 60 * 1000;  // 10 分钟
```

**[F]** Bootstrap profile 概念（[device-bootstrap.ts:69-94](../../sources/openclaw/src/infra/device-bootstrap.ts#L69-L94)）：

```typescript
function resolveRequestedBootstrapProfile(params: {
  role: string;
  scopes: readonly string[];
  purpose?: DeviceBootstrapProfile["purpose"];
}): DeviceBootstrapProfile

function resolveIssuedBootstrapProfile(params: {
  profile?: DeviceBootstrapProfileInput;
  ...
}): DeviceBootstrapProfile {
  // generic bootstrap callers stay least-privilege
  return PAIRING_SETUP_BOOTSTRAP_PROFILE;
}
```

**[F]** Profile 权限检查（[device-bootstrap.ts:122-135](../../sources/openclaw/src/infra/device-bootstrap.ts#L122-L135)）：

```typescript
function bootstrapProfileAllowsRequest(params: {
  allowedProfile: DeviceBootstrapProfile;
  requestedRole: string;
  requestedScopes: readonly string[];
}): boolean {
  return (
    params.allowedProfile.roles.includes(params.requestedRole) &&
    roleScopesAllow({ role, requestedScopes, allowedScopes: ... })
  );
}
```

**[F]** Bootstrap 配置三种 profile（[setup-code.ts 的 resolvePairingSetupAccess](../../sources/openclaw/src/pairing/setup-code.ts)）：

| Profile | 适用场景 | 权限范围 |
| --- | --- | --- |
| `FULL_ACCESS_PAIRING_SETUP_BOOTSTRAP_PROFILE` | 官方 mobile setup（wss://） | full access + admin |
| `NODE_PAIRING_SETUP_BOOTSTRAP_PROFILE` | Node 设备首次接入 | node-only |
| `PAIRING_SETUP_BOOTSTRAP_PROFILE` | generic（least-privilege） | 仅 bootstrap handoff |

**[F]** Access downgrade 策略（[setup-code.ts:resolvePairingSetupFromConfig](../../sources/openclaw/src/pairing/setup-code.ts)）：
> 如果 advertised URL 不是 wss:// 或非 loopback，自动降级到 `PAIRING_SETUP_BOOTSTRAP_PROFILE`（cleartext LAN 不允许 full access）

### 2.4 Bootstrap Token 持久化

**[F]** `device-bootstrap.ts:41-50` 注释：
```typescript
type DeviceBootstrapStateFile = Record<string, DeviceBootstrapTokenRecord>;
const withLock = createAsyncLock();
```

**[F]** Token TTL 配置（line 31）：
- `DEVICE_BOOTSTRAP_TOKEN_TTL_MS = 600_000`（10 分钟）

**[F]** Token 验证流程（[device-bootstrap.ts:103-156](../../sources/openclaw/src/infra/device-bootstrap.ts)）读取 `persistDeviceBootstrapTokenRecords` + `verifyPairingToken`：
- 使用 `generatePairingToken()` 生成（[pairing-token.ts](../../sources/openclaw/src/infra/pairing-token.ts)）—— Ed25519 签名
- `verifyPairingToken()` 验证（[pairing-token.ts](../../sources/openclaw/src/infra/pairing-token.ts)）

## 3. Mobile Pairing URL 安全约束

**[F]**（[setup-code.ts:80-115](../../sources/openclaw/src/pairing/setup-code.ts#L80-L115)）：

| Cleartext (ws://) 允许 | WSS 强制要求 |
| --- | --- |
| `localhost`, loopback IPs | 任何公网访问（mobile pairing） |
| `10.0.2.2`（Android emulator） | Tailscale Serve/Funnel |
| Private LAN（RFC 1918 RFC4193 169.254） | — |
| `.local` hosts | — |

**[F]** cleartext 自动 fallback（[setup-code.ts:130-150](../../sources/openclaw/src/pairing/setup-code.ts#L130-L150)）：

```typescript
function describeSecureMobilePairingFix(source?: string): string {
  return "Tailscale and public mobile pairing require a secure gateway URL (wss://)...";
}
```

**[R]** **RoboThree 应直接采用此规则** —— cleartext 配对仅限 loopback、私有 LAN 和 Android emulator `10.0.2.2`。

## 4. Hook 集成与审计

**[F]** Hook 事件（[hook-types.ts:93, 1198](../../sources/openclaw/src/plugins/hook-types.ts#L93)）：
```typescript
| "channel_pairing_requested"
channel_pairing_requested: (event, ctx) => ...   // 行 1198
```

**[F]** Hook timeout（[hooks.ts:139](../../sources/openclaw/src/plugins/hooks.ts#L139)）：
```typescript
channel_pairing_requested: 2_000,   // 2 秒超时
```

**[F]** Pairing-challenge 中 fire-and-forget 用法（[pairing-challenge.ts:67-74](../../sources/openclaw/src/pairing/pairing-challenge.ts#L67-L74)）：
```typescript
// Notification/audit hooks must not delay the pairing-code reply.
void runPairingRequestedHook({...}).catch(() => undefined);
```

**[I]** 这是 OpenClaw 的"**重要安全事件审计不能阻塞主路径**"原则的具体实现。

## 5. 关键安全不变量

| 不变量 | 来源 |
| --- | --- |
| 每个请求独立 short code | [pairing-challenge.ts:55](../../sources/openclaw/src/pairing/pairing-challenge.ts#L55) |
| Indexed column 是 account scope 的唯一真理 | [pairing-store-sqlite.ts:125](../../sources/openclaw/src/pairing/pairing-store-sqlite.ts#L125) |
| Bootstrap token 必须 10 分钟内使用 | [device-bootstrap.ts:31](../../sources/openclaw/src/infra/device-bootstrap.ts#L31) |
| Profile 不允许跨场景特权继承 | [device-bootstrap.ts:88-93](../../sources/openclaw/src/infra/device-bootstrap.ts#L88-L93) |
| mobile public pairing 强制 wss | [setup-code.ts:130-150](../../sources/openclaw/src/pairing/setup-code.ts#L130-L150) |
| Generic bootstrap 只获得 least-privilege | [device-bootstrap.ts:88-93](../../sources/openclaw/src/infra/device-bootstrap.ts#L88-L93) |
| Pairing hook 失败不能阻塞用户回复 | [pairing-challenge.ts:67](../../sources/openclaw/src/pairing/pairing-challenge.ts#L67) |

## 6. 与 RoboThree 的相关性

### ADOPT（直接采纳）

| 机制 | 理由 |
| --- | --- |
| **Pairing Challenge + 邀请码模式** | 简单的"用户发送请求 → 获得 code → owner 在 CLI 审批"模式非常实用 |
| **Indexed Column = Account Scope** | 禁止 metadata 跨账户转移的断言是好的安全实践 |
| **Bootstrap Token + 短 TTL** | 10 分钟短时 token 是设备首次接入手的工业标准 |
| **Profile 化权限** | 角色 + 范围的分级权限模型比"是非黑白名单"更灵活 |
| **force-https-only for public pairing** | cleartext 配对的限制规则（loopback/private LAN/emulator only）值得直接采纳 |

### ADAPT（借鉴并适配）

| 机制 | 适配方案 |
| --- | --- |
| **双层 Pairing（Channel + Device）** | RoboThree MVP 只实现 Device Bootstrap；Channel Pairing 等到多渠道上线时再做 |
| **Access downgrade based on URL scheme** | 采用 wss 检测 + 自动降级到 least-privilege 的逻辑 |
| **Hook 事件 + 2s timeout + fire-and-forget** | 简化：MVP 不实现 hook 直接用日志审计 |

### DEFER（推迟）

| 机制 | 理由 |
| --- | --- |
| **Bootstrap Profile（角色 + scopes）模型** | MVP 用最简的"approved device" binary 模型，等有多角色场景再做 |
| **Tailscale Serve / Funnel 集成** | RoboThree 没有手机客户端 app，不需要 LAN/VPN 直连能力 |
| **Pairing Cli 指令全功能** | MVP 用简化 onboarding wizard 代替 |

### REJECT（不采纳）

| 机制 | 理由 |
| --- | --- |
| **Ed25519 token signing（pairing-token.ts）** | RoboThree 用 HMAC-SHA256 即可，Ed25519 增加密钥管理复杂度 |

### NEEDS_MORE_EVIDENCE

| 机制 | 缺失证据 | How to Close |
| --- | --- | --- |
| **`runOpenClawStateWriteTransaction` 的并发安全性** | 多进程同时调用时是否安全 | 需要重读 [state-db.ts](../../sources/openclaw/src/state/openclaw-state-db.ts) 的并发模型 |
| **`serializeChannelPairingState` 是否处理迁移** | 当 schema 变更时如何 backfill | 看 migration 代码 |

## 7. 工程含义

**[I]** 对 RoboThree 的 Pairing 实现，关键设计原则是：

1. **不要混淆"用户身份"与"设备身份"** —— 两者有不同的 TTL 和生命周期
2. **Bootstrap token 必须短 TTL** —— 10 分钟上限，不能长
3. **Mobile pairing 必须强制加密** —— cleartext 仅限本地开发
4. **Indexed column 是 source of truth** —— 不要让 metadata 决定权限
5. **Pairing hook 失败不能阻塞用户回复** —— 审计是 best-effort

**[R]** 对 RoboThree MVP 建议：
- **设备 Bootstrap 借鉴 OpenClaw 的全套机制**（profile + roles + scopes + wss 检查）
- **Channel Pairing 简化为"邀请码 + owner 审批"两步流程**
- **持久化使用同一 SQLite state DB**（pooled storage）
- **pairing code 用 HMAC + 短随机串**（不用 Ed25519）
- **强制 wss for production**（cleartext 仅 loopback）
