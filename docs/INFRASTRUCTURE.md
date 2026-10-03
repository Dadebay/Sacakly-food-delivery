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

The local Compose MinIO and `mc` images use Docker Hub digests. The imported
Quay URLs did not authenticate on the new GitHub runner, so the registry host
was changed without changing the pinned image digests. This affects local/CI
containers only; no platform production registry is configured.
