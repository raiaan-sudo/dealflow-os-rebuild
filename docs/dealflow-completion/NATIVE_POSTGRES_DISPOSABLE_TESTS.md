# Native PostgreSQL disposable-test mode

DealFlow's 11 disposable-database suites continue to use Docker by default. A
native adapter is available only when the operator explicitly sets
`DEALFLOW_DISPOSABLE_DB_MODE=native`. The adapter creates a uniquely named
throwaway database, runs the existing SQL test unchanged, and drops only that
owned database during cleanup. Role cleanup is ownership-based rather than a
cluster-wide before/after diff: it removes only bootstrap roles whose `CREATE
ROLE` statement succeeded in that adapter session and roles in the session's
strict, reserved adapter prefix. Unrelated roles created concurrently are never
selected for cleanup.

The adapter atomically owns its host/port/prefix namespace before creating any
database or role. A second same-prefix process fails closed. The lock is released
only after its database and owned roles are verified removed; cleanup failure or
a stale lock blocks reuse for manual inspection rather than being auto-broken.

## Safety contract

Native mode is fail-closed. It accepts only:

- PostgreSQL exactly 17.6;
- an absolute local PostgreSQL binary directory;
- an absolute, current-user-owned Unix-socket directory with mode `0700`;
- a server with `listen_addresses` empty and socket permissions `0700`;
- a non-privileged TCP-free connection with no password, URL, token, or provider
  credential passed through the final verification runner;
- disposable database names generated and tracked by the adapter.
- cluster-role cleanup limited to explicitly created bootstrap roles and the
  adapter's strict reserved role prefix; arbitrary post-start roles are
  preserved.
- an inode-verified, private socket-directory ownership lock held through
  database and role cleanup, preventing same-prefix concurrent deletion.

Every Docker launch remains `--network=none`. Native mode translates the same
container lifecycle and `psql` calls to the isolated Unix-socket server; it
does not contact Supabase, production, staging, or any provider.

## Required opt-in settings

The final verifier forwards only these five non-secret values:

```text
DEALFLOW_DISPOSABLE_DB_MODE=native
DEALFLOW_NATIVE_PGBIN=/absolute/path/to/postgresql-17.6/bin
DEALFLOW_NATIVE_PGHOST=/absolute/path/to/private/socket-directory
DEALFLOW_NATIVE_PGPORT=6543
DEALFLOW_NATIVE_PGUSER=local_test_superuser
```

The PostgreSQL server must already be running under the current user. Its
cluster, socket, and port must be dedicated to this verification run. Do not
point the adapter at a shared, linked, staging, or production database.

## Verification

The static harness contract does not require PostgreSQL or Docker:

```sh
npm run test:disposable-postgres-harness
```

Before the 11 suites, prove the native adapter against the isolated server:

```sh
node scripts/test-native-postgres-test-adapter.mjs \
  --pgbin "$DEALFLOW_NATIVE_PGBIN" \
  --host "$DEALFLOW_NATIVE_PGHOST" \
  --port "$DEALFLOW_NATIVE_PGPORT" \
  --user "$DEALFLOW_NATIVE_PGUSER"
```

That self-test checks the exact server version, Unix-only connectivity,
Supabase-compatible roles and auth helpers, four concurrent clients, rejected
SQL diagnostics, success cleanup, failure cleanup, preservation of an unrelated
role created while a disposable session is active, and zero leftover adapter
databases.

Then run the existing final verifier with the five settings exported. Unlike
standalone shared-harness suites, the canonical final verifier requires native
mode and all four native values; it fails before command 1 rather than falling
back to Docker or skipping the adapter self-test. The verifier remains
sequential, so one disposable database suite owns the native adapter at a time.
A failed preflight, lock acquisition, or cleanup is a failed test, not a skipped
or silently downgraded run.
