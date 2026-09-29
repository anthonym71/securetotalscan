import assert from "node:assert/strict";
import { readJsonObject, RequestBodyError, requireStringFields } from "../lib/security/requestBody";

function request(body: string, length?: string): Request {
  return new Request("https://example.test/api/scan", {
    method: "POST", body,
    headers: length ? { "content-length": length } : undefined,
  });
}

async function main() {
  for (const body of ["null", "[]", "true", "1", '"text"', "", "{"]) {
    await assert.rejects(readJsonObject(request(body)), (e: unknown) =>
      e instanceof RequestBodyError && e.status === 400);
  }
  for (const field of ["email", "url", "grade", "code"]) {
    for (const value of [null, 1, {}, []]) {
      assert.throws(() => requireStringFields({ [field]: value }, [field]), RequestBodyError);
    }
  }
  const valid = { email: "test@example.test", url: "https://example.test" };
  assert.deepEqual(await readJsonObject(request(JSON.stringify(valid))), valid);
  requireStringFields(valid, ["email", "url", "grade"]);
  const boundary = JSON.stringify({ x: "a".repeat(4088) });
  assert.equal(Buffer.byteLength(boundary), 4096);
  await readJsonObject(request(boundary));
  for (const oversized of [JSON.stringify({ x: "a".repeat(4089) }), JSON.stringify({ x: "é".repeat(2045) })]) {
    // Absent or dishonest Content-Length cannot defeat the streaming byte cap.
    for (const length of [undefined, "1"]) {
      await assert.rejects(readJsonObject(request(oversized, length)), (e: unknown) =>
        e instanceof RequestBodyError && e.status === 413);
    }
  }
  let cancelled = false;
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(2049)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const streaming = new Request("https://example.test", {
    method: "POST", body: stream, duplex: "half",
  } as RequestInit);
  await assert.rejects(readJsonObject(streaming), (e: unknown) =>
    e instanceof RequestBodyError && e.status === 413);
  assert.equal(cancelled, true);
  assert.equal(reads, 2, "stop reading immediately at the byte limit");
  console.log("VERIFY: PASS — JSON object/type validation and streaming byte limits");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
