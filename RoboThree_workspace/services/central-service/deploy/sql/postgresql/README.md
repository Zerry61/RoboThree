# RoboThree Central PostgreSQL SQL

These files are deployment artifacts. The Central service never executes them
at startup.

- `baseline/B0011__admin_model_management.sql` installs an empty database
  at the current target.
- `upgrade/U0011__admin_model_management_from_v0010.sql` accepts only
  an exact manifest-managed v0010 database.
- `baseline/B0006__central_foundation.sql` and
  `upgrade/U0006__bridge_from_flyway_v5.sql` remain immutable v0006 history.
- `legacy-flyway/` is a byte-for-byte audit copy of the accepted V1-V5 history.
- `manifest/postgresql-v0011.json` is the current immutable digest authority;
  the v0006-v0010 manifests remain available for audit and controlled upgrades.

The controlled installer must verify the manifest and script digest, execute
the selected script and record version 11 in `robothree_schema_version` in one
database transaction. The application performs read-only schema preflight.
