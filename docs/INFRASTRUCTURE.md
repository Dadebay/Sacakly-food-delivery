# Saçakly Platform infrastructure

No platform production or staging host, public URL, container registry release,
GitHub deployment Environment or secrets have been configured. Imported
deployment files target the separate A7-tagam installation and must not run
for this repository. Historical inventory and deployment scripts are in
docs/legacy/; those scripts are archival and must not be run for Saçakly.

Local development may use the imported docker-compose.yml for isolated
PostgreSQL, Redis and MinIO. Use separate project names, databases, ports and
volumes from any A7 environment. A platform release needs its own host and
origin, isolated data and credentials, backups, tenant migration validation,
and rollback plan before a deployment workflow is enabled.

The local database/user and Compose volumes are now named `sacakly` and
`sacakly_postgres`/`sacakly_minio`. The previous local volumes remain separate;
the brand change does not migrate or delete them. New local sessions use the
`sacakly` JWT issuer and audience, so existing development sessions must sign
in again. The original Android package ID and Firebase project remain legacy
integration identifiers, not a platform brand or new release destination.

The Next.js customer web runs locally on port 3000 and proxies `/api/v1` to
`API_INTERNAL_URL` (default `http://127.0.0.1:4000`). The cafe/OWNER Vite
portal remains on port 5174; the API remains on port 4000. Set
`NEXT_PUBLIC_SITE_URL` to the real public HTTPS origin only when an isolated
platform host/domain is established. Until then, robots blocks indexing and
the site is local only. The service worker stores static files only.

Local Compose uses the pinned `ghcr.io/coollabsio/minio` community build of
MinIO. The original Quay and Docker Hub image locations were not available to
fresh GitHub runners. The local bucket is created with the API's AWS SDK by
`node apps/api/scripts/init-local-s3.mjs`; there is no separate `mc` image.
This affects local/CI containers only; no platform production registry is
configured.

The cafe print agent uses the existing print-agent binary with
`-api-scope marketplace` and a cafe-specific `SACAKLY_RECEIPT_AGENT_TOKEN`
environment variable. The token is displayed once in the cafe portal and
stored only as a hash by the API; never copy it into this document or a Git
file. The legacy mode keeps `A7_TAGAM_RECEIPT_AGENT_TOKEN` and the old API
path. Each cafe workstation needs its own persistent dispatch journal and
locally reachable printer IPs; the same RFC1918 IP may be reused at a
different cafe. No platform production print-agent host or credential is
configured.
