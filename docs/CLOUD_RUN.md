# Cloud Run Operations

Production service:

```text
https://doab-discovery-mcp-zz7qmtk2oa-ew.a.run.app
```

The GitHub Actions deployment uses Google Workload Identity Federation. No service-account JSON
key is stored in GitHub.

## One-Time Google Cloud Setup

Project: `doab-discovery-mcp` (number `439111309745`); region: `europe-west1`.

1. Cloud Run, Cloud Build, Artifact Registry, IAM Credentials and Service Usage APIs enabled.
2. Workload Identity Pool `github` with an OIDC provider `doab-discovery-mcp`, whose attribute
   condition restricts it to `assertion.repository == 'ramiramirez-nl/doab-discovery-mcp'`.
3. Service account `github-deployer@doab-discovery-mcp.iam.gserviceaccount.com`.
4. Project roles on the deployer, and nothing wider: `run.admin`, `cloudbuild.editor`,
   `artifactregistry.writer`, `storage.admin`, `iam.serviceAccountUser`,
   `serviceusage.serviceUsageConsumer`.
5. `roles/iam.workloadIdentityUser` on the deployer, granted to the repository principal set only.

The deployer is also the explicit Cloud Build service account, so the deployment does not rely on
the default Compute Engine service account.

## GitHub Repository Variables

Under **Settings → Secrets and variables → Actions → Variables**:

| Variable                         | Value                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | `doab-discovery-mcp`                                                                               |
| `GCP_REGION`                     | `europe-west1`                                                                                     |
| `CLOUD_RUN_SERVICE`              | `doab-discovery-mcp`                                                                               |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/439111309745/locations/global/workloadIdentityPools/github/providers/doab-discovery-mcp` |
| `GCP_DEPLOYER_SERVICE_ACCOUNT`   | `github-deployer@doab-discovery-mcp.iam.gserviceaccount.com`                                       |

CI verifies every `main` commit. The deploy workflow runs only after that CI run succeeds, checks
out the same commit, deploys it, and verifies the live landing page, health endpoint, MCP
handshake, traffic split and exact commit identity. There is no manual production bypass.

## Runtime Controls

- request-based billing;
- zero minimum and one maximum instance;
- one CPU and 512 MiB memory;
- concurrency 20 and timeout 60 seconds;
- `ENABLE_CACHE=false`;
- `TRUST_PROXY=true`;
- workflow-managed `BUILD_SHA`.

`ENABLE_CACHE=false` is required, not a preference: the container filesystem is read-only, so the
file cache cannot write. The in-memory LRU takes over, which still de-duplicates the several
upstream round trips a single query-relaxation ladder makes.

`TRUST_PROXY=true` is for Cloud Run only. It makes the application rate-limit the verified client
address immediately before Google Cloud's load-balancer address, ignoring spoofable prefixes.
Enabling it behind anything other than a trusted proxy would let a caller forge its own rate-limit
identity.

`BUILD_SHA` is exposed by `/health` so deployment verification can prove which commit is receiving
production traffic.

## Cost Controls

A monthly TRY 500 alerts-only budget covers the whole project, so Cloud Build and Artifact
Registry costs are included rather than only Cloud Run. Google notifies billing administrators and
project owners at 50%, 80% and 100%.

Billing reports lag, so small overages remain possible. Add a Cloud Run spend cap in the console
if hard enforcement is needed; note that a cap uses gross eligible costs and can pause the service
even while promotional credits cover the bill.

## Verify

```bash
curl --fail https://doab-discovery-mcp-zz7qmtk2oa-ew.a.run.app/health
```

The landing page is `/`, privacy is `/privacy`, and the public MCP endpoint is `/mcp`.
