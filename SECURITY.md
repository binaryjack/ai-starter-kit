# Security Policy

## Supported Versions

We release security patches for the two most recent minor versions of AI Agencee.

| Version | Supported |
| ------- | --------- |
| latest  | ✅ Yes    |
| latest-1| ✅ Yes    |
| older   | ❌ No     |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report them privately using one of these channels:

1. **GitHub Private Security Advisories** (preferred):
   Navigate to the repository → Security → Advisories → Report a vulnerability

2. **Email**: If you cannot use GitHub Advisories, email the maintainers
   directly. Include `[SECURITY]` in the subject line.

We will acknowledge your report within **48 hours** and aim to release a patch within
**14 calendar days** for critical/high severity issues.

## Response SLAs

| Severity | Acknowledgement | Patch |
|----------|----------------|-------|
| Critical (CVSS ≥ 9.0) | 24 hours | 7 days |
| High (CVSS 7.0–8.9)   | 48 hours | 14 days |
| Medium (CVSS 4.0–6.9) | 5 business days | 30 days |
| Low (CVSS < 4.0)      | Best effort | Next release |

## What to Include in Your Report

A useful security report includes:

- **Description**: What is the vulnerability and what is the impact?
- **Steps to reproduce**: Minimal reproduction case
- **Affected component**: Which package (`agent-executor`, `cli`, `mcp`, `core`)?
- **Suggested fix**: If you have one (optional but appreciated)

## Out of Scope

The following are **not** in scope for this security policy:

- Vulnerabilities in infrastructure or systems not owned by this project
- Social engineering attacks
- Denial-of-service via crafted DAG files with extremely large inputs
  (resource limits should be enforced at the deployment level)
- Issues already publicly disclosed

## Security Architecture Notes

For security researchers reviewing the codebase:

### Authentication
- The MCP transport supports OIDC / JWT authentication via `packages/mcp/src/oidc-auth.ts`
- Token verification uses Node's built-in Web Crypto API — no third-party crypto library
- JWKS is fetched from the issuer's well-known endpoint and cached with a 15-minute TTL

### Secrets Handling
- PII scrubbing middleware in `packages/agent-executor/src/lib/pii-scrubber.ts` redacts
  API keys, tokens, and credentials from LLM prompts before they leave the process
- Nine built-in patterns cover AWS, GitHub, Anthropic, OpenAI, JWT, SSH, and credit card numbers

### Multi-Tenant Isolation
- Run data is stored under `.agents/tenants/<tenantId>/` — each tenant's data is
  strictly path-isolated
- There is no cross-tenant data access in the current implementation

### Dependency Security
- Dependencies are audited on every push via `.github/workflows/security-audit.yml`
- `pnpm audit --audit-level=high` blocks merging of PRs that introduce high/critical CVEs

## Disclosure Policy

We follow a **coordinated disclosure** model:

1. Reporter submits a private report
2. We confirm the issue and assign a CVE if warranted
3. We develop and test a fix in a private fork
4. We release the fix and publicly disclose the vulnerability simultaneously
5. We credit the reporter (unless they prefer to remain anonymous)

Thank you for helping keep AI Agencee secure.
