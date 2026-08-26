# Enterprise Identity Composition v1alpha1

This contract freezes non-secret, production-authority source facts used by a
future RoboThree Enterprise Integration adapter and Core composition.

It does not issue or transport bearer tokens, device private keys, signatures,
raw Device Trust proofs, owner digests, Credential References, or personal
model secrets. It does not modify Enterprise Gateway v1alpha1/v1alpha2.

`personal_model.configure` is intentionally present here but absent from the
current Enterprise Gateway v1alpha1 access-token claim enum. EIPC-1 therefore
requires an additive Enterprise Gateway identity protocol revision before a
production provider can claim readiness.

`sourceFactsDigest` excludes `evaluatedAt`, so the same verified source facts
remain stable across reevaluation. `snapshotDigest` includes `evaluatedAt` and
identifies the exact evaluation result. Both use RoboThree canonical JSON and
the `sha256:<64 lowercase hex>` representation.

EIPC-0 freezes semantics and conformance only. It cannot produce
`IDENTITY_COMPOSITION_READY`; that decision belongs to EIPC-3.
