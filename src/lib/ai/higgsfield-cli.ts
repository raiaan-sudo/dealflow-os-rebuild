import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  access,
  chmod,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { downloadVerifiedCreativeImage } from "@/lib/creative-content-integrity";

const execFileAsync = promisify(execFile);
const OFFICIAL_CLI_VERSION = "1.1.19";
const MAX_CLI_OUTPUT_BYTES = 4 * 1024 * 1024;

export type HiggsfieldCliConfig = {
  cliPath: string;
  cliSha256: string;
  configHome: string;
  workspaceId: string | null;
  model: string;
  resolution: "480p" | "720p";
  durationSeconds: 5;
  generateAudio: boolean;
  maxProviderCredits: number;
};

type HiggsfieldCliJob = {
  id: string;
  status: string;
  resultUrl: string | null;
};

export class HiggsfieldCliError extends Error {
  constructor(
    message: string,
    readonly category:
      | "configuration"
      | "rejected"
      | "operator_action_required",
  ) {
    super(message);
    this.name = "HiggsfieldCliError";
  }
}

function resolvedCliPath(cliPath: string) {
  return cliPath === "packaged"
    ? join(process.cwd(), "node_modules", "@higgsfield", "cli", "vendor", "hf")
    : cliPath;
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function classifyCliFailure(error: unknown) {
  const stderr =
    error && typeof error === "object" && "stderr" in error
      ? safeText((error as { stderr?: unknown }).stderr).toLowerCase()
      : "";
  if (
    stderr.includes("not authenticated") ||
    stderr.includes("no workspace selected") ||
    stderr.includes("invalid credentials")
  ) {
    return new HiggsfieldCliError(
      "Higgsfield official CLI authentication requires operator attention.",
      "configuration",
    );
  }
  if (
    stderr.includes("unknown parameter") ||
    stderr.includes("missing required") ||
    stderr.includes("is required") ||
    stderr.includes("does not support")
  ) {
    return new HiggsfieldCliError(
      "Higgsfield rejected the requested video parameters.",
      "rejected",
    );
  }
  return new HiggsfieldCliError(
    "Higgsfield official CLI returned an ambiguous transport result.",
    "operator_action_required",
  );
}

async function verifyCliAuthority(config: HiggsfieldCliConfig) {
  const cliPath = resolvedCliPath(config.cliPath);
  if (
    !isAbsolute(cliPath) ||
    !isAbsolute(config.configHome) ||
    !/^[a-f0-9]{64}$/.test(config.cliSha256) ||
    !["480p", "720p"].includes(config.resolution) ||
    !Number.isFinite(config.maxProviderCredits) ||
    config.maxProviderCredits <= 0
  ) {
    throw new HiggsfieldCliError(
      "Higgsfield official CLI configuration is incomplete.",
      "configuration",
    );
  }

  const credentialDirectory = join(config.configHome, ".config", "higgsfield");
  const credentialPath = join(credentialDirectory, "credentials.json");
  const providerConfigPath = join(credentialDirectory, "config.json");
  try {
    await access(cliPath, constants.X_OK);
    const [directory, credentials, providerConfig, cliDigest] = await Promise.all([
      stat(credentialDirectory),
      stat(credentialPath),
      stat(providerConfigPath),
      sha256File(cliPath),
    ]);
    if (
      !directory.isDirectory() ||
      !credentials.isFile() ||
      !providerConfig.isFile() ||
      cliDigest !== config.cliSha256 ||
      (directory.mode & 0o022) !== 0 ||
      (credentials.mode & 0o077) !== 0 ||
      (providerConfig.mode & 0o077) !== 0
    ) {
      throw new Error("unsafe credential permissions");
    }
  } catch {
    throw new HiggsfieldCliError(
      "Higgsfield official CLI or its protected OAuth configuration is unavailable.",
      "configuration",
    );
  }
}

async function runCliJson(
  config: HiggsfieldCliConfig,
  args: string[],
  timeoutMs: number,
) {
  await verifyCliAuthority(config);
  const cliPath = resolvedCliPath(config.cliPath);
  try {
    const { stdout } = await execFileAsync(
      cliPath,
      ["--json", ...args],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: MAX_CLI_OUTPUT_BYTES,
        windowsHide: true,
        env: {
          NODE_ENV: process.env.NODE_ENV ?? "production",
          HOME: config.configHome,
          XDG_CONFIG_HOME: join(config.configHome, ".config"),
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
          HIGGSFIELD_NO_UPDATE_CHECK: "1",
          HIGGSFIELD_TELEMETRY: "0",
          HIGGSFIELD_SURFACE: "dealflow",
          ...(config.workspaceId
            ? { HIGGSFIELD_WORKSPACE_ID: config.workspaceId }
            : {}),
        },
      },
    );
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid json response");
    }
    return parsed;
  } catch (error) {
    if (error instanceof HiggsfieldCliError) throw error;
    throw classifyCliFailure(error);
  }
}

function findSingleJobReceipt(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4) return {};
  const candidates: Record<string, unknown>[] = [];
  const visit = (nested: unknown, nestedDepth: number) => {
    if (nestedDepth > 4) return;
    if (Array.isArray(nested)) {
      for (const entry of nested) visit(entry, nestedDepth + 1);
      return;
    }
    const record = asRecord(nested);
    if (!Object.keys(record).length) return;
    const id = safeText(record.id) || safeText(record.job_id);
    const status = safeText(record.status);
    if (/^[A-Za-z0-9_-]{8,160}$/.test(id) && status) {
      candidates.push(record);
      return;
    }
    for (const entry of Object.values(record)) {
      visit(entry, nestedDepth + 1);
    }
  };
  visit(value, depth);
  return candidates.length === 1 ? candidates[0] : {};
}

function parseJob(value: unknown): HiggsfieldCliJob {
  const root = findSingleJobReceipt(value);
  const id = safeText(root.id) || safeText(root.job_id);
  const status = safeText(root.status).toLowerCase();
  const resultUrl =
    safeText(root.result_url) ||
    safeText(root.min_result_url) ||
    null;
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(id) || !status) {
    throw new HiggsfieldCliError(
      "Higgsfield official CLI returned an invalid job receipt.",
      "operator_action_required",
    );
  }
  return { id, status, resultUrl };
}

function mediaExtension(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return "png";
}

function generationArgs(
  config: HiggsfieldCliConfig,
  prompt: string,
  sourcePath: string,
) {
  return [
    config.model,
    "--prompt",
    prompt,
    "--start-image",
    sourcePath,
    "--aspect-ratio",
    "9:16",
    "--duration",
    String(config.durationSeconds),
    "--resolution",
    config.resolution,
    "--generate-audio",
    String(config.generateAudio),
  ];
}

export async function createHiggsfieldCliVideo(params: {
  config: HiggsfieldCliConfig;
  prompt: string;
  inputImageUrl: string;
}) {
  const image = await downloadVerifiedCreativeImage(params.inputImageUrl);
  return createHiggsfieldCliVideoFromVerifiedImage({
    config: params.config,
    prompt: params.prompt,
    image,
  });
}

export async function createHiggsfieldCliVideoFromVerifiedImage(params: {
  config: HiggsfieldCliConfig;
  prompt: string;
  image: {
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
  };
}) {
  const image = params.image;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "dealflow-higgsfield-"));
  await chmod(temporaryRoot, 0o700);
  const sourcePath = join(
    temporaryRoot,
    `source.${mediaExtension(image.contentType)}`,
  );
  try {
    await writeFile(sourcePath, image.bytes, { mode: 0o600, flag: "wx" });
    const args = generationArgs(params.config, params.prompt, sourcePath);
    const cost = asRecord(
      await runCliJson(
        params.config,
        ["generate", "cost", ...args],
        60_000,
      ),
    );
    const credits = Number(cost.credits);
    if (
      !Number.isFinite(credits) ||
      credits <= 0 ||
      credits > params.config.maxProviderCredits
    ) {
      throw new HiggsfieldCliError(
        "Higgsfield generation exceeded the configured provider-credit ceiling.",
        "rejected",
      );
    }
    const job = parseJob(
      await runCliJson(
        params.config,
        ["generate", "create", ...args],
        90_000,
      ),
    );
    return {
      ...job,
      model: params.config.model,
      providerCreditsEstimated: credits,
      cliVersion: OFFICIAL_CLI_VERSION,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
  }
}

export async function getHiggsfieldCliVideoStatus(params: {
  config: HiggsfieldCliConfig;
  requestId: string;
}) {
  return parseJob(
    await runCliJson(
      params.config,
      ["generate", "get", params.requestId],
      30_000,
    ),
  );
}
