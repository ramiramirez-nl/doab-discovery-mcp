import type { OutgoingHttpHeaders, ServerResponse } from "node:http";

export const applySecurityHeaders = (res: ServerResponse): void => {
  // img-src is required for the favicon; default-src 'none' would otherwise block it.
  res.setHeader(
    "content-security-policy",
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
  res.setHeader("permissions-policy", "camera=(), geolocation=(), microphone=()");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
};

export const writeJson = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: OutgoingHttpHeaders = {}
): void => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
};
