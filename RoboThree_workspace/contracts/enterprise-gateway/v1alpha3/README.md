# Enterprise Model Gateway v1alpha3

This additive subprotocol adds one strict, content-free reasoning identity to
the provider-neutral Model request. `cacheContext` remains optional and is
all-or-none with `cacheContextDigest`. The v1alpha3 `requestDigest` covers the
reasoning-aware Model request and, when present, the exact cache-context digest.

The four Model routes are version-locked for the full invocation lifecycle.
Configuration Snapshot, identity, permissions and packages remain on v1alpha1.
Raw effort, thinking budget, Endpoint and Credential material are forbidden on
this public wire. Central resolves those values from an immutable private
release after an independent Endpoint Binding check.

`CANONICAL-DIGESTS.sha256` freezes the v1alpha3 Schema, OpenAPI and Fixture
manifest bytes used by TypeScript/Java conformance. Digest self-validation for
`cacheContext` remains an application-level invariant in both languages; JSON
Schema alone only validates its strict shape and digest format.
