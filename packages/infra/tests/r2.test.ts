import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { R2ObjectStore, toStoredObjectMetadata, type R2BucketBinding, type R2MultipartUpload } from "../src/r2";

let mf: Miniflare;
let store: R2ObjectStore;

const KEY = "projects/p-123/source-assets/sa-456/my-video.mp4";

async function readBytes(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (body === null) {
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function fill(size: number, byte: number): Uint8Array {
  const data = new Uint8Array(size);
  data.fill(byte);
  return data;
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          script: `export default { async fetch() { return new Response("ok"); } };`,
          modules: true,
          r2Buckets: { BUCKET: "test-bucket" },
        },
      ],
    }),
  );
  const bucket = (await mf.getR2Bucket("BUCKET")) as unknown as R2BucketBinding;
  store = new R2ObjectStore(bucket);
});

afterAll(async () => {
  await mf.dispose();
});

describe("R2ObjectStore", () => {
  it("round-trips an object with content type and checksum metadata", async () => {
    const content = fill(64, 7);
    const stored = await store.put(KEY, content, {
      contentType: "video/mp4",
      checksum: "sha256:abc",
      metadata: { group: "ingest" },
    });
    expect(stored.key).toBe(KEY);
    expect(stored.size).toBe(64);

    const metadata = toStoredObjectMetadata(stored);
    expect(metadata.contentType).toBe("video/mp4");
    expect(metadata.checksum).toBe("sha256:abc");
    expect(metadata.customMetadata).toEqual({ group: "ingest", checksum: "sha256:abc" });

    const fetched = await store.get(KEY);
    expect(fetched).not.toBeNull();
    expect(fetched!.httpMetadata.contentType).toBe("video/mp4");
    expect(await readBytes(fetched!.body)).toEqual(content);
  });

  it("stores text and reads it back as text", async () => {
    const key = "projects/p-123/source-assets/sa-456/notes.json";
    await store.put(key, JSON.stringify({ ok: true }), { contentType: "application/json" });
    const fetched = await store.get(key);
    expect(await fetched!.text()).toBe('{"ok":true}');
  });

  it("head reports metadata without a body", async () => {
    await store.put(KEY, fill(16, 1), { contentType: "video/mp4" });
    const head = await store.head(KEY);
    expect(head).not.toBeNull();
    expect(head!.size).toBe(16);
    expect(head!.httpMetadata.contentType).toBe("video/mp4");
  });

  it("get and head return null for missing keys", async () => {
    expect(await store.get("projects/p-123/source-assets/sa-456/missing.mp4")).toBeNull();
    expect(await store.head("projects/p-123/source-assets/sa-456/missing.mp4")).toBeNull();
  });

  it("deletes objects and lists by prefix", async () => {
    const prefix = "projects/p-abc/source-assets/sa-xyz";
    await store.put(`${prefix}/a.mp4`, fill(8, 1), { contentType: "video/mp4" });
    await store.put(`${prefix}/b.mp4`, fill(8, 2), { contentType: "video/mp4" });
    await store.put("projects/p-abc/source-assets/sa-other/c.mp4", fill(8, 3), { contentType: "video/mp4" });

    const listed = await store.list(prefix);
    expect(listed.map((item) => item.key)).toEqual([`${prefix}/a.mp4`, `${prefix}/b.mp4`]);

    await store.delete(`${prefix}/a.mp4`);
    const afterDelete = await store.list(prefix);
    expect(afterDelete.map((item) => item.key)).toEqual([`${prefix}/b.mp4`]);
    expect(await store.get(`${prefix}/a.mp4`)).toBeNull();
  });

  it("lists everything when no prefix is given", async () => {
    const all = await store.list();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((item) => item.key === KEY)).toBe(true);
  });

  it("multipart uploads a multi-part object and completes it", async () => {
    const key = "projects/p-9/source-assets/sa-9/multipart.mp4";
    const partSize = 6 * 1024 * 1024;
    const first = fill(partSize, 11);
    const second = fill(partSize, 22);
    const tail = fill(1024, 33);

    const upload = await store.createMultipartUpload(key, { contentType: "video/mp4" });
    const p1 = await store.uploadPart(upload, 1, first, { size: partSize });
    const p2 = await store.uploadPart(upload, 2, second, { size: partSize });
    const p3 = await store.uploadPart(upload, 3, tail, { size: tail.length, isFinal: true });

    expect(p1.partNumber).toBe(1);
    expect(p2.partNumber).toBe(2);
    expect(p3.partNumber).toBe(3);

    const object = await store.completeMultipartUpload(upload, [p1, p2, p3]);
    expect(object.size).toBe(partSize * 2 + tail.length);
    expect(object.httpMetadata.contentType).toBe("video/mp4");

    const fetched = await store.get(key);
    const bytes = await readBytes(fetched!.body);
    expect(bytes.length).toBe(partSize * 2 + tail.length);
    expect(bytes[0]).toBe(11);
    expect(bytes[partSize]).toBe(22);
    expect(bytes[partSize * 2]).toBe(33);
  });

  it("aborts a multipart upload and leaves no object", async () => {
    const key = "projects/p-9/source-assets/sa-9/aborted.mp4";
    const upload: R2MultipartUpload = await store.createMultipartUpload(key);
    await store.uploadPart(upload, 1, fill(6 * 1024 * 1024, 5));
    await store.abortMultipartUpload(upload);
    expect(await store.head(key)).toBeNull();
  });

  it("rejects invalid part numbers", async () => {
    const upload = await store.createMultipartUpload("projects/p-9/source-assets/sa-9/bad.mp4");
    await expect(store.uploadPart(upload, 0, fill(16, 1))).rejects.toThrow(/partNumber/);
    await expect(store.uploadPart(upload, 10001, fill(16, 1))).rejects.toThrow(/partNumber/);
  });

  it("rejects oversized single puts against a max size limit", async () => {
    const key = "projects/p-9/source-assets/sa-9/tiny.mp4";
    await expect(
      store.put(key, fill(1024, 1), { contentType: "video/mp4", size: 1024, maxSizeBytes: 512 }),
    ).rejects.toThrow(/maxSizeBytes/);
  });

  it("rejects puts without a content type", async () => {
    await expect(
      store.put("projects/p-9/source-assets/sa-9/no-type.mp4", fill(4, 1), { contentType: "" }),
    ).rejects.toThrow(/contentType/);
  });
});