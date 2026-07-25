import assert from "node:assert/strict";
import http from "node:http";
import {
  buildGeneratedVideoStoragePath,
  GENERATED_VIDEO_STORAGE_BUCKET,
  isCanonicalGeneratedVideoStorageIdentity,
} from "../src/lib/services/creative-asset-storage-identity";
import {
  importGeneratedVideoToCanonicalStorage,
  selectPreferredGeneratedVideoAddress,
} from "../src/lib/services/generated-video-storage-service";
import {
  validateCreativeAssetContent,
  validateManualCreativeAssetFile,
} from "../src/lib/services/creative-asset-content-validation";
import { createPinnedDnsLookup } from "../src/lib/security/pinned-dns-lookup";

const ids = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "20000000-0000-4000-8000-000000000002",
  campaignId: "30000000-0000-4000-8000-000000000003",
  assetId: "40000000-0000-4000-8000-000000000004",
};

const mp4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x01,
  0x69, 0x73, 0x6f, 0x6d,
  0x6d, 0x70, 0x34, 0x32,
]);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0x00, 0x00, 0xff, 0xd9]);
const gif = Buffer.from([
  ...Buffer.from("GIF89a", "ascii"),
  0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x3b,
]);
const webp = Buffer.from([
  ...Buffer.from("RIFF", "ascii"),
  0x0c, 0x00, 0x00, 0x00,
  ...Buffer.from("WEBPVP8X", "ascii"),
  0x00, 0x00, 0x00, 0x00,
]);
const quicktime = Buffer.from([
  0x00, 0x00, 0x00, 0x10,
  ...Buffer.from("ftypqt  ", "ascii"),
  0x00, 0x00, 0x00, 0x00,
]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00, 0x00, 0x00]);
const mutableEnv = process.env as Record<string, string | undefined>;

type Stored = { body: Uint8Array; metadata: Record<string, unknown>; contentType: string };

function createStorageHarness(publicOrigin: string, options?: { failBinding?: boolean }) {
  const objects = new Map<string, Stored>();
  const bindings = new Map<string, Record<string, unknown>>();
  let uploads = 0;
  let removals = 0;
  let bindingCalls = 0;

  const bucket = {
    async list(folder: string, input: { search?: string }) {
      const prefix = folder ? `${folder}/` : "";
      return {
        data: [...objects.entries()]
          .filter(([path]) => path.startsWith(prefix))
          .filter(([path]) => !input.search || path.slice(prefix.length) === input.search)
          .map(([path, object]) => ({
            name: path.slice(prefix.length),
            // Deliberately expose only transport metadata here. The production
            // importer must use the exact object-info endpoint for custom
            // identity metadata instead of assuming list() preserves it.
            metadata: { size: object.body.byteLength, mimetype: object.contentType },
          })),
        error: null,
      };
    },
    async info(path: string) {
      const object = objects.get(path);
      if (!object) return { data: null, error: { message: "not found" } };
      return {
        data: {
          bucketId: GENERATED_VIDEO_STORAGE_BUCKET,
          name: path,
          metadata: object.metadata,
        },
        error: null,
      };
    },
    async upload(
      path: string,
      body: Uint8Array,
      input: { upsert?: boolean; contentType?: string; metadata?: Record<string, unknown> },
    ) {
      uploads += 1;
      if (objects.has(path) && input.upsert !== true) {
        return { data: null, error: { message: "duplicate object" } };
      }
      objects.set(path, {
        body: new Uint8Array(body),
        metadata: input.metadata ?? {},
        contentType: input.contentType ?? "",
      });
      return { data: { path }, error: null };
    },
    getPublicUrl(path: string) {
      return {
        data: {
          publicUrl: `${publicOrigin}/storage/v1/object/public/${GENERATED_VIDEO_STORAGE_BUCKET}/${path}`,
        },
      };
    },
    async remove(paths: string[]) {
      removals += 1;
      paths.forEach((path) => objects.delete(path));
      return { data: paths, error: null };
    },
  };

  const client = {
    storage: {
      from(name: string) {
        assert.equal(name, GENERATED_VIDEO_STORAGE_BUCKET);
        return bucket;
      },
    },
    async rpc(name: string, input: Record<string, unknown>) {
      bindingCalls += 1;
      assert.equal(name, "bind_generated_video_storage_v1");
      if (options?.failBinding) {
        return { data: null, error: { message: "injected ambiguous binding response" } };
      }
      const assetId = String(input.p_asset_id);
      const existing = bindings.get(assetId);
      const receipt = {
        bound: true,
        reused: Boolean(existing),
        storage_bucket: input.p_storage_bucket,
        storage_path: input.p_storage_path,
        file_url: input.p_file_url,
      };
      if (existing) {
        assert.equal(existing.storage_bucket, receipt.storage_bucket);
        assert.equal(existing.storage_path, receipt.storage_path);
        assert.equal(existing.file_url, receipt.file_url);
      }
      bindings.set(assetId, receipt);
      return { data: [receipt], error: null };
    },
  };

  return {
    client: client as any,
    objects,
    snapshot: () => ({ uploads, removals, bindingCalls, objects: objects.size }),
  };
}

async function main() {
  const pinned = createPinnedDnsLookup({
    address: "203.0.113.10",
    family: 4,
  });
  await new Promise<void>((resolve, reject) => {
    pinned("provider.example", { all: true }, (error, addresses) => {
      if (error) {
        reject(error);
        return;
      }
      assert.deepEqual(addresses, [{
        address: "203.0.113.10",
        family: 4,
      }]);
      resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    pinned("provider.example", { all: false }, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }
      assert.equal(address, "203.0.113.10");
      assert.equal(family, 4);
      resolve();
    });
  });

  assert.deepEqual(
    selectPreferredGeneratedVideoAddress([
      { address: "2001:db8::10", family: 6 },
      { address: "203.0.113.10", family: 4 },
    ]),
    { address: "203.0.113.10", family: 4 },
    "generated-video transport did not prefer IPv4 when a provider CDN returned IPv6 first",
  );
  assert.deepEqual(
    selectPreferredGeneratedVideoAddress([
      { address: "2001:db8::10", family: 6 },
    ]),
    { address: "2001:db8::10", family: 6 },
    "generated-video transport did not retain the IPv6-only fallback",
  );
  assert.throws(
    () => selectPreferredGeneratedVideoAddress([
      { address: "unsupported", family: 0 },
    ]),
    /supported address family/,
  );

  for (const [bytes, declaredMimeType, kind, expectedMimeType] of [
    [png, "image/png", "image", "image/png"],
    [jpeg, "image/jpeg", "image", "image/jpeg"],
    [gif, "image/gif", "image", "image/gif"],
    [webp, "image/webp", "image", "image/webp"],
    [mp4, "video/mp4", "video", "video/mp4"],
    [quicktime, "video/quicktime", "video", "video/quicktime"],
    [webm, "video/webm", "video", "video/webm"],
  ] as const) {
    const validated = validateCreativeAssetContent({
      bytes,
      declaredMimeType,
      kind,
      maxBytes: 1024,
    });
    assert.equal(validated.mimeType, expectedMimeType);
    assert.equal(validated.contentLength, bytes.length);
    assert.match(validated.contentSha256, /^[0-9a-f]{64}$/);
  }
  for (const input of [
    { bytes: Buffer.alloc(0), declaredMimeType: "image/png", kind: "image" as const },
    { bytes: png.subarray(0, 24), declaredMimeType: "image/png", kind: "image" as const },
    { bytes: jpeg.subarray(0, -2), declaredMimeType: "image/jpeg", kind: "image" as const },
    { bytes: mp4.subarray(0, 12), declaredMimeType: "video/mp4", kind: "video" as const },
    { bytes: png, declaredMimeType: "image/jpeg", kind: "image" as const },
    { bytes: png, declaredMimeType: "image/png", kind: "video" as const },
    { bytes: Buffer.from("not-media"), declaredMimeType: "image/png", kind: "image" as const },
  ]) {
    assert.throws(
      () => validateCreativeAssetContent({ ...input, maxBytes: 1024 }),
      /empty|truncated|does not match|not a supported|signature/i,
    );
  }
  const manualPng = await validateManualCreativeAssetFile({
    file: new File([png], "fake.jpg", { type: "image/png" }),
    kind: "image",
  });
  assert.equal(manualPng.extension, "png", "manual storage extension trusted the filename");
  await assert.rejects(
    validateManualCreativeAssetFile({
      file: new File([png], "fake.jpg", { type: "image/jpeg" }),
      kind: "image",
    }),
    /does not match/,
  );

  let videoRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.statusCode = 302;
      response.setHeader("location", "/video");
      response.end();
      return;
    }
    if (request.url === "/unsafe-redirect") {
      response.statusCode = 302;
      response.setHeader("location", "http://example.com/video.mp4");
      response.end();
      return;
    }
    if (request.url === "/large") {
      response.statusCode = 200;
      response.setHeader("content-type", "video/mp4");
      response.setHeader("content-length", String(100 * 1024 * 1024 + 1));
      response.end(mp4);
      return;
    }
    if (request.url === "/bad-mime") {
      response.statusCode = 200;
      response.setHeader("content-type", "text/html");
      response.end(mp4);
      return;
    }
    if (request.url === "/bad-signature") {
      response.statusCode = 200;
      response.setHeader("content-type", "video/mp4");
      response.end("not a video");
      return;
    }
    if (request.url === "/truncated") {
      response.statusCode = 200;
      response.setHeader("content-type", "video/mp4");
      response.end(mp4.subarray(0, 12));
      return;
    }
    if (request.url === "/mime-mismatch") {
      response.statusCode = 200;
      response.setHeader("content-type", "video/webm");
      response.end(mp4);
      return;
    }
    if (request.url === "/video") {
      videoRequests += 1;
      response.statusCode = 200;
      response.setHeader("content-type", "video/mp4; charset=binary");
      response.setHeader("content-length", String(mp4.length));
      response.end(mp4);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  mutableEnv.NODE_ENV = "test";
  process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT = "true";

  try {
    const harness = createStorageHarness(origin);
    const baseInput = {
      client: harness.client,
      ...ids,
      providerName: "higgsfield" as const,
      providerAssetId: "higgsfield-request-12345678",
      sourceUrl: `${origin}/redirect`,
    };
    const first = await importGeneratedVideoToCanonicalStorage(baseInput);
    assert.equal(first.storagePath, buildGeneratedVideoStoragePath({
      ...ids,
      providerName: "higgsfield",
    }));
    assert.equal(first.contentLength, mp4.length);
    assert.equal(first.mimeType, "video/mp4");
    assert.equal(first.reusedExistingObject, false);
    assert.deepEqual(harness.snapshot(), {
      uploads: 1,
      removals: 0,
      bindingCalls: 1,
      objects: 1,
    });

    const replay = await importGeneratedVideoToCanonicalStorage({
      ...baseInput,
      sourceUrl: "https://expired-provider-url.invalid/video.mp4",
    });
    assert.equal(replay.reusedExistingObject, true);
    assert.equal(replay.reusedExistingBinding, true);
    assert.equal(videoRequests, 1, "replay unnecessarily re-fetched provider media");
    assert.deepEqual(harness.snapshot(), {
      uploads: 1,
      removals: 0,
      bindingCalls: 2,
      objects: 1,
    });

    assert.equal(isCanonicalGeneratedVideoStorageIdentity({
      ...ids,
      providerName: "higgsfield",
      storageBucket: first.storageBucket,
      storagePath: first.storagePath,
    }), true);
    assert.equal(isCanonicalGeneratedVideoStorageIdentity({
      ...ids,
      organizationId: "50000000-0000-4000-8000-000000000005",
      providerName: "higgsfield",
      storageBucket: first.storageBucket,
      storagePath: first.storagePath,
    }), false, "cross-tenant storage path was accepted");

    const collisionHarness = createStorageHarness(origin);
    const collisionPath = buildGeneratedVideoStoragePath({ ...ids, providerName: "higgsfield" });
    collisionHarness.objects.set(collisionPath, {
      body: mp4,
      contentType: "video/mp4",
      metadata: {
        dealflowKind: "generated_video",
        organizationId: "50000000-0000-4000-8000-000000000005",
      },
    });
    await assert.rejects(
      importGeneratedVideoToCanonicalStorage({ ...baseInput, client: collisionHarness.client }),
      /occupied by another identity/,
    );
    assert.equal(collisionHarness.snapshot().uploads, 0, "collision was overwritten");

    for (const [assetId, path, expected] of [
      ["60000000-0000-4000-8000-000000000006", "/large", /100 MiB/],
      ["70000000-0000-4000-8000-000000000007", "/bad-mime", /MIME type/],
      ["80000000-0000-4000-8000-000000000008", "/bad-signature", /declared video format/],
      ["90000000-0000-4000-8000-000000000009", "/unsafe-redirect", /credential-free HTTPS/],
      ["90000000-0000-4000-8000-000000000010", "/truncated", /declared video format/],
      ["90000000-0000-4000-8000-000000000011", "/mime-mismatch", /declared video format/],
    ] as const) {
      const invalidHarness = createStorageHarness(origin);
      await assert.rejects(
        importGeneratedVideoToCanonicalStorage({
          ...baseInput,
          client: invalidHarness.client,
          assetId,
          sourceUrl: `${origin}${path}`,
        }),
        expected,
      );
      assert.equal(invalidHarness.snapshot().objects, 0);
    }

    for (const [assetId, sourceUrl] of [
      ["a0000000-0000-4000-8000-000000000010", "https://169.254.169.254/latest/meta-data"],
      ["a0000000-0000-4000-8000-000000000011", "https://127.0.0.2/private.mp4"],
      ["a0000000-0000-4000-8000-000000000012", "https://untrusted.example.com/video.mp4"],
      ["a0000000-0000-4000-8000-000000000013", "https://user:secret@files.heygen.ai/video.mp4"],
    ] as const) {
      const invalidHarness = createStorageHarness(origin);
      await assert.rejects(
        importGeneratedVideoToCanonicalStorage({
          ...baseInput,
          client: invalidHarness.client,
          assetId,
          sourceUrl,
        }),
        /credential-free HTTPS/,
      );
      assert.equal(invalidHarness.snapshot().objects, 0, "SSRF candidate reached storage");
    }

    mutableEnv.NODE_ENV = "production";
    await assert.rejects(
      importGeneratedVideoToCanonicalStorage({
        ...baseInput,
        client: createStorageHarness(origin).client,
        assetId: "a0000000-0000-4000-8000-000000000014",
      }),
      /credential-free HTTPS/,
    );
    mutableEnv.NODE_ENV = "test";

    const ambiguousHarness = createStorageHarness(origin, { failBinding: true });
    await assert.rejects(
      importGeneratedVideoToCanonicalStorage({ ...baseInput, client: ambiguousHarness.client }),
      /binding response/,
    );
    assert.deepEqual(ambiguousHarness.snapshot(), {
      uploads: 1,
      removals: 0,
      bindingCalls: 1,
      objects: 1,
    }, "object was deleted after an ambiguous database binding attempt");

    console.log(
      "generated video canonical storage: PASS (DNS-pinned SSRF policy, bounded fetch/redirect/MIME/signature/size, tenant path, immutable no-overwrite, replay, ambiguous-bind preservation)",
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
