# PTX-1 — Claude Code 独立 QA 报告

## 基本信息

| 属性 | 内容 |
|---|---|
| RUN_ID | `2026-08-25-1150-version-ptx.1` |
| 验收对象 | PTX-1：Private ResourceResolver + PPTX Writer |
| 日期 | 2026-08-25 |
| 验收者 | Claude Code（独立 QA，只读） |
| 环境 | Node v24.13.0（nvm，`.node-version`）/ pnpm 11.11.0 |
| 开发版本 | Document Worker `0.0.0-ptx.1` |
| 上游 | PTX-0 `PASS/CLOSED`（docs-only 冻结） |

---

## 一、门禁复跑结果（串行独立执行，Node 24.13.0）

| # | 门禁 | 结果 |
|---|---|---|
| 1 | `pnpm --filter @robothree/document-worker build` | **PASS**（tsc -b） |
| 2 | PTX focused（`tests/pptx/**`） | **PASS 2 files / 10 tests**（resource-resolver 5 + pptx-write 5） |
| 3 | document-worker 全量 | **PASS 25 files / 190 tests** |
| 4 | `pnpm run audit:dtp4` | **PASS** |
| 5 | `pnpm install --frozen-lockfile --offline` | **PASS**（Already up to date） |
| 6 | `pnpm run lint` | **PASS**（Architecture boundary checks passed） |
| 7 | `CI=true pnpm run check`（root） | **PASS 247 files / 1652 tests + 3 smoke** |

---

## 二、重点核查项（对照 PTX-0 冻结的 ResourceResolver 硬规则）

| # | 核查项 | 结论 |
|---|---|---|
| 1 | **URL pinning（P2-1 吸收）** | ✅ [resource-resolver.ts](services/document-worker/src/pptx/resource-resolver.ts) `defaultFetchPinned` 用 `hostname: resolvedIp` 建立连接 + `servername: hostname`（SNI）+ `Host` 头 = 原 hostname；连接后 `remoteAddress !== resolvedIp` → `resource_ip_rebound`；`selectValidatedIp` 遍历全部 DNS 记录逐个校验取第一个合法公网 IP |
| 2 | **redirect 自控（P2-3 吸收）** | ✅ 无自动 follow；30x 手动 `new URL(location, parsed)` 递归 `redirectCount+1` 重跑全量校验（scheme→host→DNS→IP→connect same IP→remoteAddress→Content-Type/magic→size/timeout）；`maxRedirects=3` 超限 fail-closed |
| 3 | **magic bytes（P2-2 吸收）** | ✅ PNG `89 50 4E 47 0D 0A 1A 0A`、JPEG `FF D8 FF`、WEBP `RIFF....WEBP`；`declared !== measured` → `resource_magic_mismatch`；空/截断/未知 → `resource_magic_unsupported` |
| 4 | 私网清单完整 | ✅ `isPrivateOrSpecialIpv4`（0/8、10/8、127/8、172.16-31/12、192.168/16、169.254/16、169.254.169.254）+ IPv6（::1、fc/fd、fe[89ab]）+ `::ffff:` IPv4-mapped 映射 |
| 5 | URL canonical 校验 | ✅ https only、禁 userinfo、禁 fragment、禁 `%2f/%5c/%00` 转义、host 无尾点、≤2048 bytes |
| 6 | safeSourceSummary 无敏感 | ✅ 只含 host/mediaType/byteSize/sha256/redirectCount，**无 query/raw URL** |
| 7 | Writer 零网络零路径 | ✅ [pptx-adapter.ts](services/document-worker/src/pptx/pptx-adapter.ts) 仅 import pptxgenjs + error + type；无 fs/path/net/https/http/fetch/readFile/writeFile；`write({ outputType: "nodebuffer" })` 只生成 bytes；图片走内存 `data:` URI（resolved bytes），非 URL/path |
| 8 | no-clobber 原子发布 | ✅ [pptx-write.ts](services/document-worker/src/pptx/pptx-write.ts) temp → write → fsync → `link(temp,target)`（EEXIST→target_exists）→ parent fsync → readback digest 校验 → unlink temp；9 个 fault point 覆盖发布失败各窗口 |
| 9 | 路径安全 | ✅ `resolveWriteTarget` realpath workspace root + 双重 `isContained` 检查；`validateRelativePath` 拒绝对路径/win32 绝对/`\\`/`://`/`..`/`.`/`\0`；symlink 目标 → `symlink_not_allowed` |
| 10 | PresentationSpecV1 严格解析 | ✅ 元素白名单 text/image/table/chart/shape，全 `requireOnlyKeys` 拒未知字段；`templateRef` 仅 `robothree.default`；mode 仅 `create_new`（overwrite → unsupported_mode）；资源限制 11 项全部实现（slides 40/elements 32/image 8MiB/output 64MiB/table/chart/string 等） |
| 11 | PTX-1 私有边界 | ✅ `tool.document.pptx.write` 仅 Document Worker capability router 内；Core/Contracts/Desktop/Central/Admin 源码零引用；未进 Core Registry/default Agent |
| 12 | 测试断言真实性 | ✅ 反查无 `.skip`/`.only`；10 个 focused 测试覆盖 pinning、rebound、redirect、magic bytes、私网拒绝、data 校验、no-clobber、OOXML 结构、私有边界、adapter 隔离 |

---

## 三、发现

### P0 = 0，P1 = 0，P2 = 0，P3 = 0

（此前我在 repair.2 QA 中报告的「PTX 越界」已由用户以「PTX-1 已完成实现并收口」的授权表述澄清——PTX-1 现作为独立合法批次验收，越界项关闭。）

---

## 四、结论

```text
INDEPENDENT_QA_PASS — USER_ACCEPTANCE_PENDING
P0 = 0，P1 = 0，P2 = 0，P3 = 0
```

PTX-1 正确完成 Private ResourceResolver + PPTX Writer：受控 URL 图片解析完整实现 PTX-0 冻结的三项硬规则
（resolve→validate→connect same IP 的 DNS rebinding 防护、手动逐跳 redirect 自控 + maxRedirects=3、png/jpeg/
webp magic bytes 一致性校验 + remoteAddress rebound 复核 + 完整私网清单）；PptxGenJS bytes-only adapter 零网络
零文件系统访问（图片走内存 data URI）；create_new no-clobber 原子发布（temp→fsync→link→parent fsync→readback
digest→unlink）+ 完整路径穿越/symlink 防护；PresentationSpecV1 严格解析（元素白名单、未知字段拒绝、模板仅
robothree.default、资源限制 11 项）。`tool.document.pptx.write` 保持 Document Worker 私有，未进 Core Registry。
门禁独立复跑全绿（focused 2/10、document-worker 25/190、root check 247/1652 + 3 smoke、audit:dtp4、lint、
frozen offline install）。

**PTX-1 可进入用户接受流程；接受后不自动进入 PTX-2（Tool Activation，含 Core Registry 注册 + WorkspaceGrant
+ Core authority/audit/Artifact projection）。PTX-2、PTX-3（Desktop E2E）、PTX-4（Visual Preview）继续 GATED。**

— Claude Code（独立 QA，只读）
