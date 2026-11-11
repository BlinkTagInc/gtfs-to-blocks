# Security

Do not include credentials or private feed URLs in public issues. Report vulnerabilities privately through [GitHub's vulnerability reporting](https://github.com/BlinkTagInc/gtfs-to-blocks/security/advisories/new).

Use the current release and a supported Node.js version. GTFS-to-Blocks uses node-GTFS for feed downloads, archive extraction, and database access. Configuration can contain request headers and database credentials; keep local config files out of version control.
