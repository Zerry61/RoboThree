# Model Gateway semantic conformance fixtures

These test-only fixtures freeze state, idempotency, timeout, and recovery
coordination semantics that cannot be expressed by validating one JSON document
in isolation. TypeScript and Java must evaluate the same cases and produce the
same expected decision.

They are not HTTP request or response documents.
