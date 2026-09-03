import type { IncomingMessage } from "node:http";

export class HttpRequestError extends Error {
  readonly name = "HttpRequestError";

  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

export const getClientKey = (req: IncomingMessage, trustProxy: boolean): string => {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    const addresses = value
      ?.split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    const verifiedClientAddress = addresses && addresses.length >= 2 ? addresses.at(-2) : undefined;
    if (verifiedClientAddress) return verifiedClientAddress.slice(0, 256);
  }

  return (req.socket.remoteAddress ?? "unknown").slice(0, 256);
};

export const readJsonBody = async (req: IncomingMessage, maxBytes: number): Promise<unknown> => {
  const limit = Math.max(1, Math.floor(maxBytes));
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  let oversized = false;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    receivedBytes += buffer.byteLength;
    if (receivedBytes > limit) {
      oversized = true;
      continue;
    }
    chunks.push(buffer);
  }

  if (oversized) throw new HttpRequestError(413, "request_too_large");

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpRequestError(400, "invalid_json");
  }
};
