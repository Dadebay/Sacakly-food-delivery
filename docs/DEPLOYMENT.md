# AlowLink Platform deployment

Deployment is not configured. The old A7-tagam deployment workflow was removed
on import to prevent accidental pushes to its production VDS. Historical
instructions are in docs/legacy/DEPLOYMENT.md for reference only.

Before the first release, establish an isolated environment, migrate data
deliberately, validate every tenant access path, create backups and test
rollback. Enabling deployment requires a new environment-specific workflow
and review of its destination and secrets.
