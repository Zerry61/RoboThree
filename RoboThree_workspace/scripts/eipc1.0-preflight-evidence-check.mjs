import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const preflightDocument = join(
  workspaceRoot,
  "docs/development/frontend/EIPC-1.0-PRODUCTION-INPUT-CONTRACT-PREFLIGHT.md",
);

test("freezes a separate enterprise session wire family without changing legacy Gateway versions", async () => {
  const value = await readFile(preflightDocument, "utf8");
  assert.match(value, /enterprise-session\.v1alpha1/);
  assert.match(value, /POST `\/enterprise-session\/v1alpha1\/session-leases`/);
  assert.match(value, /claimsProfile = `eipc\.session-token\.v1`/);
  assert.match(value, /不得改写 Enterprise Gateway `v1alpha1\/v1alpha2`/);
});

test("forbids self-asserted owner and secret-bearing non-sensitive facts", async () => {
  const value = await readFile(preflightDocument, "utf8");
  assert.match(value, /请求禁止 `enterpriseId\/userId\/deviceId`/);
  assert.match(value, /Bearer 只存在于 response bytes 与 Core runtime lease/);
  assert.match(value, /不得进入 EIPC-0 non-secret Contract/);
});

test("records the production input authorization gap without a fake ready claim", async () => {
  const value = await readFile(preflightDocument, "utf8");
  assert.match(value, /公司 OA verified identity bootstrap \| `not_authorized`/);
  assert.match(value, /MDM\/企业 Device Trust 输入 \| `not_authorized`/);
  assert.match(value, /production codesign\/entitlement\/packaging \| `not_authorized`/);
  assert.match(value, /BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION/);
  assert.match(value, /productionIdentityReady = false/);
});

test("freezes a non-exportable Secure Enclave signer profile without fallback", async () => {
  const value = await readFile(preflightDocument, "utf8");
  assert.match(value, /macos_secure_enclave_p256_ecdsa_sha256_v1/);
  assert.match(value, /`getPrivateKey\/resolvePrivateKey\/exportPrivateKey` 永久禁止/);
  assert.match(value, /不得自动退化为磁盘 PEM、SQLite key、环境变量或 Fake signer/);
});

test("keeps all downstream production stages gated", async () => {
  const value = await readFile(preflightDocument, "utf8");
  for (const gate of [
    "EIPC-1.1～EIPC-1.3",
    "EIPC-2～EIPC-3",
    "STRM-3",
    "DFI-4A.4.1～DFI-4A.4.3",
    "DFI-2B",
    "DFI-3",
    "TGM",
  ]) {
    assert.ok(value.includes(gate), `missing downstream gate ${gate}`);
  }
});
