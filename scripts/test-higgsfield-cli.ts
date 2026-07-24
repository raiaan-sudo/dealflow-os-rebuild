import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHiggsfieldCliVideoFromVerifiedImage,
  getHiggsfieldCliVideoStatus,
  HiggsfieldCliError,
  type HiggsfieldCliConfig,
} from "../src/lib/ai/higgsfield-cli";
import { getDurableVideoProvider } from "../src/lib/ai/video-provider";

async function main() {
  const root = await mkdtemp(join(tmpdir(), "dealflow-higgsfield-cli-test-"));
  const credentialDirectory = join(root, "home", ".config", "higgsfield");
  const logPath = join(root, "invocations.jsonl");
  const modePath = join(root, "mode");
  const cliPath = join(root, "higgsfield");
  await mkdir(credentialDirectory, { recursive: true, mode: 0o700 });
  await writeFile(modePath, "normal\n", { mode: 0o600 });
  await writeFile(
    join(credentialDirectory, "credentials.json"),
    "{\"synthetic\":true}\n",
    { mode: 0o600 },
  );
  await writeFile(
    join(credentialDirectory, "config.json"),
    "{\"synthetic\":true}\n",
    { mode: 0o600 },
  );
  await chmod(credentialDirectory, 0o700);

  const fakeCli = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const mode = fs.readFileSync(${JSON.stringify(modePath)}, "utf8").trim();
const sourceIndex = args.indexOf("--start-image");
const sourcePath = sourceIndex >= 0 ? args[sourceIndex + 1] : null;
fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({
  args,
  home: process.env.HOME,
  xdg: process.env.XDG_CONFIG_HOME,
  workspace: process.env.HIGGSFIELD_WORKSPACE_ID || null,
  sourcePath,
  sourcePresent: sourcePath ? fs.existsSync(sourcePath) : false,
  sourceMode: sourcePath ? (fs.statSync(sourcePath).mode & 0o777) : null
}) + "\\n");
if (args.includes("cost")) {
  const credits = mode === "high-cost" ? 13 : 12.5;
  process.stdout.write(JSON.stringify({ credits }));
} else if (args.includes("create")) {
  if (mode === "auth-failure") {
    process.stderr.write("Not authenticated.\\n");
    process.exit(1);
  }
  if (mode === "ambiguous-failure") {
    process.stderr.write("transport closed after dispatch\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({
    jobs: [{
      id: "synthetic_job_12345678",
      status: "queued",
      result_url: null
    }]
  }));
} else if (args.includes("get")) {
  process.stdout.write(JSON.stringify({
    id: args[args.length - 1],
    status: "completed",
    result_url: "https://cdn.higgsfield.ai/synthetic.mp4"
  }));
} else {
  process.stderr.write("unsupported test command\\n");
  process.exit(2);
}
`;
  await writeFile(cliPath, fakeCli, { mode: 0o700 });

  const config: HiggsfieldCliConfig = {
    cliPath,
    cliSha256: createHash("sha256")
      .update(await readFile(cliPath))
      .digest("hex"),
    configHome: join(root, "home"),
    workspaceId: "synthetic_workspace_12345678",
    model: "seedance_2_0_mini",
    resolution: "720p",
    durationSeconds: 5,
    generateAudio: false,
    maxProviderCredits: 12.5,
  };
  const image = {
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    contentType: "image/png" as const,
  };
  Object.assign(process.env, {
    HIGGSFIELD_CLI_ENABLED: "true",
    HIGGSFIELD_CLI_PATH: config.cliPath,
    HIGGSFIELD_CLI_SHA256: config.cliSha256,
    HIGGSFIELD_CONFIG_HOME: config.configHome,
    HIGGSFIELD_WORKSPACE_ID: config.workspaceId,
    HIGGSFIELD_VIDEO_MODEL: config.model,
    HIGGSFIELD_VIDEO_RESOLUTION: config.resolution,
    HIGGSFIELD_MAX_PROVIDER_CREDITS: String(config.maxProviderCredits),
  });
  assert.equal(
    getDurableVideoProvider(),
    "higgsfield",
    "a complete official CLI OAuth configuration must select Higgsfield",
  );

  const created = await createHiggsfieldCliVideoFromVerifiedImage({
    config,
    prompt: "A bounded synthetic realtor-video prompt for official CLI contract testing.",
    image,
  });
  assert.deepEqual(created, {
    id: "synthetic_job_12345678",
    status: "queued",
    resultUrl: null,
    model: "seedance_2_0_mini",
    providerCreditsEstimated: 12.5,
    cliVersion: "1.1.19",
  });

  const lines = (await readFile(logPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].sourcePresent, true);
  assert.equal(lines[0].sourceMode, 0o600);
  assert.equal(lines[1].sourcePath, lines[0].sourcePath);
  await assert.rejects(() => access(lines[0].sourcePath));
  for (const invocation of lines) {
    assert.equal(invocation.home, config.configHome);
    assert.equal(
      invocation.xdg,
      join(config.configHome, ".config"),
    );
    assert.equal(invocation.workspace, config.workspaceId);
    assert.deepEqual(invocation.args.slice(0, 4), [
      "--json",
      "generate",
      invocation.args[2],
      "seedance_2_0_mini",
    ]);
    assert.equal(invocation.args.includes("--generate-audio"), true);
    assert.equal(invocation.args.includes("false"), true);
  }

  const status = await getHiggsfieldCliVideoStatus({
    config,
    requestId: created.id,
  });
  assert.equal(status.id, created.id);
  assert.equal(status.status, "completed");
  assert.equal(status.resultUrl, "https://cdn.higgsfield.ai/synthetic.mp4");

  await assert.rejects(
    () =>
      getHiggsfieldCliVideoStatus({
        config: { ...config, cliSha256: "0".repeat(64) },
        requestId: created.id,
      }),
    (error: unknown) => {
      assert(error instanceof HiggsfieldCliError);
      assert.equal(error.category, "configuration");
      return true;
    },
  );

  await writeFile(modePath, "high-cost\n", { mode: 0o600 });
  await assert.rejects(
    () =>
      createHiggsfieldCliVideoFromVerifiedImage({
        config,
        prompt: "A bounded synthetic prompt that must stop at the provider-credit ceiling.",
        image,
      }),
    (error: unknown) => {
      assert(error instanceof HiggsfieldCliError);
      assert.equal(error.category, "rejected");
      return true;
    },
  );
  await writeFile(modePath, "auth-failure\n", { mode: 0o600 });

  await assert.rejects(
    () =>
      createHiggsfieldCliVideoFromVerifiedImage({
        config,
        prompt: "A bounded synthetic prompt that must classify missing OAuth authority.",
        image,
      }),
    (error: unknown) => {
      assert(error instanceof HiggsfieldCliError);
      assert.equal(error.category, "configuration");
      return true;
    },
  );
  await writeFile(modePath, "ambiguous-failure\n", { mode: 0o600 });
  await assert.rejects(
    () =>
      createHiggsfieldCliVideoFromVerifiedImage({
        config,
        prompt: "A bounded synthetic prompt that must preserve ambiguous provider authority.",
        image,
      }),
    (error: unknown) => {
      assert(error instanceof HiggsfieldCliError);
      assert.equal(error.category, "operator_action_required");
      return true;
    },
  );
  await writeFile(modePath, "normal\n", { mode: 0o600 });

  const credentialMode =
    (await stat(join(credentialDirectory, "credentials.json"))).mode & 0o777;
  assert.equal(credentialMode, 0o600);
  console.log(
    "Higgsfield official CLI contract: PASS (OAuth config authority, bounded cost, exact args, secure temp cleanup, status reconciliation, fail-closed errors)",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
