# Enterprise Model Gateway v1alpha2

This additive subprotocol adds a strict opaque `cacheContext` sidecar to Model
Invocation accept. The semantic `requestDigest` remains unchanged;
`cacheContextDigest` is validated and compared independently.

The four Model routes are version-locked for the full invocation lifecycle.
Configuration Snapshot, identity, permissions and packages remain on v1alpha1.
ARH-3.2.1 defines the wire and Core-side Session proof only; Central cache plan
and Provider cache projection remain gated to ARH-3.2.2 and ARH-3.2.3.

`CANONICAL-DIGESTS.sha256` freezes the v1alpha2 Schema, OpenAPI and Fixture
manifest bytes used by TypeScript/Java conformance. Digest self-validation for
`cacheContext` remains an application-level invariant in both languages; JSON
Schema alone only validates its strict shape and digest format.
