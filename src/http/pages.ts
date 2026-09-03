import { ICON_PATH, inlineIconMarkup } from "../branding.js";
import { REPOSITORY_URL, SERVICE_DISPLAY_NAME, SERVICE_VERSION } from "../meta.js";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const documentLayout = (title: string, body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Public, read-only MCP server for DOAB open-access book and chapter discovery.">
    <link rel="icon" type="image/svg+xml" href="${ICON_PATH}">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; line-height: 1.55; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #17202a; background: #f7f8fa; }
      main { width: min(100% - 32px, 780px); margin: 0 auto; padding: 44px 0 64px; }
      header { padding-bottom: 28px; border-bottom: 1px solid #d7dde3; }
      h1 { margin: 8px 0 12px; font-size: 2.35rem; line-height: 1.08; letter-spacing: 0; }
      .titleline { display: flex; align-items: center; gap: 13px; margin: 8px 0 12px; }
      .titleline h1 { margin: 0; }
      .mark { flex: none; border-radius: 22%; }
      h2 { margin: 32px 0 10px; font-size: 1.2rem; letter-spacing: 0; }
      p, li { color: #42505d; }
      ol { padding-left: 22px; }
      li + li { margin-top: 8px; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      code { background: #e8edf1; padding: 2px 5px; border-radius: 4px; }
      pre { overflow-x: auto; padding: 16px; background: #17202a; color: #f7f9fa; border-radius: 6px; white-space: pre-wrap; }
      a { color: #0b6270; text-underline-offset: 2px; }
      .status { display: inline-block; margin: 0; padding: 3px 8px; border: 1px solid #88a45c; border-radius: 999px; color: #385314; background: #f3f8e9; font-size: .82rem; font-weight: 700; }
      .lede { max-width: 650px; margin-bottom: 8px; font-size: 1.08rem; }
      .url { display: block; margin: 12px 0; padding: 14px; background: #fff; border: 1px solid #b8c3cc; border-radius: 6px; overflow-wrap: anywhere; user-select: all; }
      .notice { padding: 14px 16px; border-left: 4px solid #b06b28; background: #fff6eb; }
      .independent { padding: 14px 16px; border-left: 4px solid #667985; background: #edf1f4; }
      .muted { color: #63717d; font-size: .92rem; }
      footer { margin-top: 42px; padding-top: 18px; border-top: 1px solid #d7dde3; font-size: .9rem; }
      @media (max-width: 520px) {
        main { width: min(100% - 24px, 780px); padding-top: 28px; }
        h1 { font-size: 2rem; }
      }
    </style>
  </head>
  <body><main>${body}</main></body>
</html>`;

export const renderHomePage = (baseUrl: string): string => {
  const mcpUrl = new URL("/mcp", baseUrl).toString();
  const escapedUrl = escapeHtml(mcpUrl);
  return documentLayout(
    SERVICE_DISPLAY_NAME,
    `<header>
      <p class="status">Public beta</p>
      <div class="titleline">${inlineIconMarkup(40)}<h1>${SERVICE_DISPLAY_NAME}</h1></div>
      <p class="lede">Search DOAB-indexed open-access books and book chapters from an AI tool through one read-only MCP connection.</p>
      <p><strong>No account, API key, or payment.</strong></p>
    </header>
    <section aria-labelledby="connect">
    <h2 id="connect">Connect</h2>
    <p>Paste this URL into an AI client that supports remote Streamable HTTP MCP servers:</p>
    <p class="url"><code>${escapedUrl}</code></p>
    <p class="muted">Availability and menu names depend on the client and plan.</p>
    <ol>
      <li><strong>Claude paid plans:</strong> Settings → Connectors → Add custom connector.</li>
      <li><strong>ChatGPT Business, Enterprise, or Edu:</strong> create a custom MCP app in developer mode under Settings → Apps.</li>
      <li><strong>Codex or another MCP client:</strong> add a remote Streamable HTTP server.</li>
    </ol>
    </section>
    <section aria-labelledby="examples">
    <h2 id="examples">Try asking</h2>
    <pre>Find open-access books on Ottoman provincial administration.
Recommend books for this chapter abstract.
List De Gruyter open-access books in Syriac studies since 2015.
Look up the DOAB record for handle 20.500.12854/32785.</pre>
    </section>
    <section aria-labelledby="limits">
    <h2 id="limits">Scope and limits</h2>
    <p>It searches public DOAB metadata, ranks candidates locally, and returns source links. DOAB metadata is supplied by publishers: peer-review fields describe a declared process, and their absence does not mean a book was not reviewed. Verify results on the DOAB record and the publisher's own page.</p>
    <p class="notice"><strong>Privacy:</strong> Do not send confidential manuscript text to a public deployment. Requests pass through the hosting provider and the public DOAB API.</p>
    <p class="independent"><strong>Independent project:</strong> ${SERVICE_DISPLAY_NAME} is an independent, unofficial open-source project. It is not affiliated with, endorsed by, sponsored by, or operated by DOAB or OAPEN.</p>
    </section>
    <footer><a href="/health">Service status</a> · <a href="/privacy">Privacy</a> · <a href="${REPOSITORY_URL}">GitHub</a> · <a href="${REPOSITORY_URL}/issues">Support</a><br><span class="muted">Version ${SERVICE_VERSION}; public beta, no uptime SLA.</span></footer>`
  );
};

export const renderPrivacyPage = (): string =>
  documentLayout(
    "Privacy | DOAB Discovery MCP",
    `<h1>Privacy</h1>
    <p>DOAB Discovery MCP is a public, read-only discovery service.</p>
    <h2>What happens to requests</h2>
    <p>Queries and abstracts are sent to this service and transformed into requests to the public DOAB API. Query text and abstracts are not intentionally persisted in application logs.</p>
    <p>Production caching is disabled. A self-hosted installation can enable a best-effort cache of public DOAB responses; cache loss does not affect correctness.</p>
    <h2>What not to send</h2>
    <p>Do not submit confidential, unpublished, or personally identifying manuscript content. The hosting provider and DOAB process network, request, and upstream metadata under their own policies.</p>
    <h2>Questions</h2>
    <p>Open a <a href="${REPOSITORY_URL}/issues">GitHub issue</a> for privacy questions or service problems. Do not include sensitive text in an issue.</p>
    <p><a href="/">Back to DOAB Discovery MCP</a></p>`
  );
