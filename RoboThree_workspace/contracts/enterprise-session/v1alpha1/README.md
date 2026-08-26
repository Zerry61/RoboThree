# Enterprise Session v1alpha1

This canonical family defines two operations only:

- `POST /enterprise-session/v1alpha1/device-challenges`
- `POST /enterprise-session/v1alpha1/session-leases`

The Device Challenge request carries an opaque verified-identity handle. It never
accepts Central's internal `verifiedIdentityId`, owner identity, entitlement or a
Device Trust decision from the caller. The Session Lease request carries the same
handle-bound request facts plus a short-lived Device Proof.

The result atomically projects a bearer, an EIPC-0 Session Assertion, an EIPC-0
Device Trust Decision, compatibility revision and source-decision digest. The
EIPC-0 safe semantic schemas are referenced by their family-qualified canonical
IDs; they are not copied into this family.

`eipc.session-token.v1` is a new claims profile. It does not expand or rewrite the
legacy Enterprise Gateway v1alpha1 claims enum. The profile can carry
`personal_model.configure`, but no production validator or token codec is enabled
by EIPC-1.1.1.

All response paths use `Cache-Control: no-store`. Handles, signatures, private
keys, Credential References, bearer values and token digests are excluded from
canonical decision material except where the bearer is necessarily returned in
the one Session Lease response.

EIPC-1.1.1 freezes Contract and cross-language conformance only. It does not add
Central migration v0010, persistence, transaction logic, HTTP controllers,
production handle resolution or production token signing. The identity
composition blocker remains open.
