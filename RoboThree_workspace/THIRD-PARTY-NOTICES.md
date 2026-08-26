# Third-Party Notices

This file is the notice index for third-party code distributed with RoboThree.

## Source-derived code

No upstream Agent source code has been copied into RoboThree as of 2026-07-19. Architecture and design inputs are tracked in `docs/architecture/UPSTREAM-ADOPTION-REGISTER.md`.

Before an upstream entry is marked `SELECTIVE_SOURCE` or `ADOPTED`, the implementing change must record:

- upstream project and fixed commit;
- source and RoboThree target files;
- license and copyright notice requirements;
- local modifications;
- required attribution or NOTICE text;
- conformance and regression tests.

## Runtime dependencies

The initial KAF-0 runtime dependency is Zod, licensed under MIT. Complete dependency license output and bundled license texts must be generated and reviewed as part of the packaging/release process; development-only dependencies are not automatically treated as redistributed runtime components.

This index does not replace the license text of any dependency.
