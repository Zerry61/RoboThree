# Canonical digest rules

1. Contract documents are UTF-8.
2. Runtime JSON digests use RoboThree canonical JSON: object keys sorted
   lexicographically, array order preserved, no insignificant whitespace.
3. Digest algorithm is SHA-256 encoded as 64 lowercase hexadecimal characters.
4. Snapshot digest excludes transport headers and includes the complete Snapshot
   document with the `digest` field omitted.
5. Package digest excludes transport headers and includes the complete
   PackageDocument with `packageDigest` omitted.
6. File `contentDigest` is SHA-256 over the exact UTF-8 bytes of `utf8Content`.
7. Same revision with a different digest is a conflict and fails closed.
8. Model Invocation `requestDigest` is SHA-256 over canonical JSON containing
   exactly `contractVersion`, `modelRequest`, `admission`, and `timeoutPolicy`.
   It excludes `clientRequestId`, transport-level `requestId`, HTTP headers,
   access tokens, credentials, and Provider-private request objects.
9. The idempotency identity for accepting a Model Invocation is
   `clientRequestId + requestDigest`. Reusing the same `clientRequestId` with a
   different digest is a conflict; changing only `requestId` creates a new
   transport attempt, not a new logical invocation.
10. A Model Invocation `eventDigest` is SHA-256 over the canonical event with
    `eventDigest` and transport-only `durableCursor` omitted. Durable sequence
    order is covered by the persisted invocation event stream digest; ephemeral
    stream events do not become durable facts merely because they have a digest.
