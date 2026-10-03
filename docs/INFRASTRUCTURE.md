# AlowLink Platform infrastructure

No platform production or staging host, public URL, container registry release,
GitHub deployment Environment or secrets have been configured. Imported
deployment files target the separate A7-tagam installation and must not run
for this repository. Historical inventory and deployment scripts are in
docs/legacy/; those scripts are archival and must not be run for AlowLink.

Local development may use the imported docker-compose.yml for isolated
PostgreSQL, Redis and MinIO. Use separate project names, databases, ports and
volumes from any A7 environment. A platform release needs its own host and
origin, isolated data and credentials, backups, tenant migration validation,
and rollback plan before a deployment workflow is enabled.

Local Compose uses the pinned `ghcr.io/coollabsio/minio` community build of
MinIO. The original Quay and Docker Hub image locations were not available to
fresh GitHub runners. The local bucket is created with the API's AWS SDK by
`node apps/api/scripts/init-local-s3.mjs`; there is no separate `mc` image.
This affects local/CI containers only; no platform production registry is
configured.
