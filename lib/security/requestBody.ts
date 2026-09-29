/** Bound decoded JSON input before any field access or external side effect. */
export class RequestBodyError extends Error {
  constructor(message: string, public readonly status: 400 | 413 = 400) {
    super(message);
  }
}

export async function readJsonObject(
  request: Request,
  maxBytes = 4096,
): Promise<Record<string, unknown>> {
  const tooLarge = () => new RequestBodyError("Request body too large.", 413);
  if (Number(request.headers.get("content-length")) > maxBytes) throw tooLarge();

  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("Invalid JSON body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestBodyError("A JSON object is required.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Invalid JSON body.");
  } finally {
    reader.releaseLock();
  }
}

export function requireStringFields(body: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      throw new RequestBodyError(`${field} must be a string.`);
    }
  }
}
