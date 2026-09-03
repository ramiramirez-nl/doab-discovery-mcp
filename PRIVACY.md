# Privacy

DOAB Discovery MCP is a read-only discovery service over the public DOAB API.

## What happens to a request

Queries, abstracts and topic descriptions are sent to this service and transformed into requests
to the public DOAB REST API at `directory.doabooks.org`. Query text and abstracts are not
intentionally persisted in application logs.

Caching, where enabled, stores only public DOAB responses keyed by a hash of the request URL.
Cache loss does not affect correctness. A deployment on a read-only filesystem falls back to a
per-process in-memory cache that disappears when the process exits.

## What is not collected

No account, API key, or payment is required, and none is stored. The service holds no user
identity, sends no analytics, and loads no external assets in its own pages.

## What not to send

Do not submit confidential, unpublished, or personally identifying manuscript content to a public
deployment. Your hosting provider and DOAB process network, request and upstream metadata under
their own policies.

## Questions

Open a GitHub issue for privacy questions or service problems. Do not include sensitive text in
an issue.
