<div align="center">

# DOAB Discovery MCP

**Search the Directory of Open Access Books from any AI client — no account, no API key, no payment**

[![Claude Code compatible](https://img.shields.io/badge/Claude_Code-compatible-D97757?logo=anthropic&logoColor=white)](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
[![Node](https://img.shields.io/badge/Node-22%2B-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.30-000000)](https://github.com/modelcontextprotocol/typescript-sdk)
[![Tools](https://img.shields.io/badge/Tools-8_read--only-4C1)](#-tools)
[![Transport](https://img.shields.io/badge/Transport-HTTP_%2B_stdio-0A66C2)](#-quick-start)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

[Problem](#-the-problem) · [Tools](#-tools) · [Quick Start](#-quick-start) · [Local](#-run-locally) · [Docker](#-docker) · [Privacy](#-privacy) · [Development](#-development)

</div>

---

## 🎯 The Problem

DOAB indexes over 100,000 peer-reviewed open-access books and chapters, but its API is a raw
DSpace 6 REST endpoint. Bare multi-word searches are `AND`-ed together, so a natural-language
question or a pasted abstract silently returns nothing. The hit count arrives in an HTTP header
rather than the body. Metadata comes back as a flat list of repeatable `{key, value}` pairs, with
ISBNs buried untyped inside `dc.identifier` next to OCLC numbers.

Worst of all, the index fails silently: querying a field DOAB does not index is not an error, it
just matches zero records. `dc.publisher:Brill` returns nothing while `publisher:Brill` returns
1,600 books, and `publisher.country` is present on every record yet unsearchable. A filter that
looks right can quietly empty the result set.

Meanwhile, an AI assistant asked "which open-access books cover Syriac manuscript culture?" will
answer from training data — plausible titles, invented publishers, no verifiable links.

This server closes that gap. It translates plain-language questions and abstracts into valid DOAB
queries, applies only filters that are verified to work, ranks candidates locally, and returns
handles and links for verification.

> [!NOTE]
> **Beta.** Verify important results on the DOAB record and the publisher's own site.

> [!IMPORTANT]
> **Independent project.** DOAB Discovery MCP is an independent, unofficial open-source project.
> It is not affiliated with, endorsed by, sponsored by, or operated by DOAB or OAPEN.

---

## 🧰 Tools

Eight read-only tools. None performs editorial review, quality assessment, or publisher vetting.

| Tool                             | Key inputs                                                                          | What it does                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `search_doab_books`              | `query`, `publisher`, `language`, `yearFrom`/`yearTo`, `peerReviewedOnly`, `strict` | Whole-book search with DOAB-side filters and local lexical ranking                                 |
| `search_doab_chapters`           | `query`, `publisher`, `language`, `yearFrom`/`yearTo`, `strict`                     | Chapter-level search; chapters carry their own DOI and abstract                                    |
| `recommend_doab_books_for_topic` | `abstract`, `title`, `preferredLanguage`, `includeChapters`                         | Topical book candidates from an abstract or chapter draft                                          |
| `find_doab_books_by_publisher`   | `publisher`, `query`, `yearFrom`/`yearTo`                                           | A publisher's open-access list, optionally narrowed by topic                                       |
| `find_similar_doab_books`        | `abstract`, `title`                                                                 | Books similar to a given abstract                                                                  |
| `get_doab_record_by_doi`         | `doi`                                                                               | Direct lookup by DOI                                                                               |
| `get_doab_record_by_handle`      | `handle`                                                                            | Direct lookup by handle, DOAB URL, or item UUID                                                    |
| `explain_doab_metadata`          | `term`                                                                              | Explains handles, chapter records, peer-review fields, Thema, OAPEN — fully local, no network call |

Every search response includes the effective DOAB query it ran, the upstream total, and how many
results were returned, so you can see and audit what was actually asked.

### What the metadata can and cannot tell you

DOAB metadata is supplied by publishers. `peerReviewedOnly` narrows to records that **declare** a
review process; its absence does not mean a book was not reviewed, only that the publisher did not
supply the field. Licence terms are usually a publisher statement rather than a machine-readable
CC code. Publisher country is present on records but is not indexed, so it affects ranking only,
and the tools say so in their response rather than silently returning nothing.

---

## 🚀 Quick Start

### Local (stdio)

For clients that launch MCP servers as a subprocess:

```bash
npm ci && npm run build
```

```json
{
  "mcpServers": {
    "doab-discovery": {
      "command": "node",
      "args": ["/absolute/path/to/doab-discovery-mcp/dist/src/stdio.js"]
    }
  }
}
```

### Remote (Streamable HTTP)

Deploy it anywhere that runs a container, then add the deployment's `/mcp` URL:

| Client                                  | Where to add it                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| **Claude** (paid plans)                 | Settings → Connectors → Add custom connector                                         |
| **ChatGPT** (Business, Enterprise, Edu) | Settings → Apps, developer mode enabled, created by an authorized admin or developer |
| **Codex / other MCP clients**           | Add as a remote Streamable HTTP MCP server                                           |

Set `DEPLOYMENT_BASE_URL` so the connector icon and website URL resolve absolutely.

---

## 💻 Run Locally

Requires Node.js 22 or newer.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:3000/`. The MCP endpoint is `http://localhost:3000/mcp`; health is
`http://localhost:3000/health`. For the stdio transport instead, run `npm run dev:stdio`.

Configuration is documented in [.env.example](.env.example). The public DOAB API is used without
an API key.

---

## 🐳 Docker

```bash
docker build -t doab-discovery-mcp .
docker run --rm -p 3000:3000 --env-file .env doab-discovery-mcp
```

---

## 🔒 Privacy

Do not send confidential, unpublished, personal, or sensitive manuscript text to a public
deployment. Requests pass through your hosting provider and the public DOAB API. Query text and
abstracts are not intentionally persisted by the application. Read [PRIVACY.md](PRIVACY.md).

---

## 🛠 Development

```bash
npm run check                 # tests, build, lint, format check
DOAB_LIVE_TEST=1 npm test     # additionally hit the real DOAB API
```

The live tests are skipped by default so CI stays hermetic. They are the regression guard for the
failure class that defines this API: a query can be syntactically valid, name a plausible field,
and still match zero records. `tests/live-doab.test.ts` asserts every field the server puts in a
query against the live index, so an index change surfaces as a failing test rather than as empty
results in production.

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [MIT License](LICENSE).
