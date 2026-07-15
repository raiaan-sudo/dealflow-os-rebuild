import path from "node:path";

const REQUIRED_NATIVE_NAMES = [
  "DEALFLOW_NATIVE_PGBIN",
  "DEALFLOW_NATIVE_PGHOST",
  "DEALFLOW_NATIVE_PGPORT",
  "DEALFLOW_NATIVE_PGUSER",
];

export function requireFinalVerificationNativeEnvironment(environment) {
  if (environment.DEALFLOW_DISPOSABLE_DB_MODE !== "native") {
    throw new Error(
      "Final verification requires DEALFLOW_DISPOSABLE_DB_MODE=native; Docker and implicit database modes are refused.",
    );
  }
  const values = {};
  for (const name of REQUIRED_NATIVE_NAMES) {
    const value = environment[name];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Final verification requires non-empty ${name}.`);
    }
    values[name] = value.trim();
  }
  const port = Number(values.DEALFLOW_NATIVE_PGPORT);
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("Final verification requires DEALFLOW_NATIVE_PGPORT from 1024 through 65535.");
  }
  for (const name of ["DEALFLOW_NATIVE_PGBIN", "DEALFLOW_NATIVE_PGHOST"]) {
    if (!path.isAbsolute(values[name])) {
      throw new Error(`Final verification requires absolute ${name}.`);
    }
    if (/[\s\u0000-\u001f\u007f]/u.test(values[name])) {
      throw new Error(
        `Final verification requires ${name} without whitespace or control characters.`,
      );
    }
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(values.DEALFLOW_NATIVE_PGUSER)) {
    throw new Error("Final verification requires a safe DEALFLOW_NATIVE_PGUSER identifier.");
  }
  return Object.freeze({
    mode: "native",
    pgbin: values.DEALFLOW_NATIVE_PGBIN,
    host: values.DEALFLOW_NATIVE_PGHOST,
    port: String(port),
    user: values.DEALFLOW_NATIVE_PGUSER,
  });
}
