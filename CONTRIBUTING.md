# Contributing to AI Agencee

Thank you for considering a contribution to AI Agencee. This document explains the process, coding standards, legal framework, and how to get started.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Legal Framework (Switzerland)](#legal-framework-switzerland)
3. [Contributor License Agreement](#contributor-license-agreement)
4. [Getting Started](#getting-started)
5. [Coding Standards](#coding-standards)
6. [Commit & PR Process](#commit--pr-process)
7. [Reporting Bugs](#reporting-bugs)
8. [Proposing Features](#proposing-features)
9. [Sponsoring](#sponsoring)

---

## Code of Conduct

This project adopts the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Report unacceptable behaviour to the maintainers (see SECURITY.md for contact details).

---

## Legal Framework (Switzerland)

AI Agencee is developed and maintained by **AI Agencee**, based in Switzerland.

### Applicable law

- This project and all contributions are governed by **Swiss law** (Schweizerisches Recht / Droit suisse).
- Copyright: Swiss Federal Act on Copyright and Related Rights (**URG/LDA**, SR 231.1). Under Swiss law, the copyright in a contribution vests initially in its author.
- Data protection: Swiss Federal Act on Data Protection (**nFADP / revDSG**, in force 1 September 2023), and where applicable the EU General Data Protection Regulation.
- Contracts: Swiss Code of Obligations (**OR**, SR 220).
- Place of jurisdiction (for any disputes): **Canton of Zurich, Switzerland**.

### No employment relationship

Contributing to this project does **not** create an employment relationship (Arbeitsverhältnis) within the meaning of OR Art. 319 et seq. Contributors act as independent volunteers. There is no obligation of payment, exclusivity, or availability. The project maintainer owes no social insurance contributions (AHV/IV/EO) for volunteer contributions.

### Intellectual property

The project is released under the **MIT License** (see [LICENSE](LICENSE)). Copyright © 2026 AI Agencee.

---

## Contributor License Agreement

By submitting a Pull Request you agree to the following **Contributor License Agreement (CLA)**, which is governed by Swiss law (OR) and the URG/LDA:

> **Grant of licence**: You grant the AI Agencee project a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contributions and such derivative works, under the terms of the MIT License or any future open-source licence adopted by this project.
>
> **Moral rights**: To the extent permitted by applicable law (URG Art. 11), you waive or agree not to assert any moral rights you may have in your contributions against the project.
>
> **Representations**: You represent that:
> (a) you are legally entitled to grant the above licence;
> (b) if your employer has rights to intellectual property you create, you have received permission to make contributions on behalf of your employer, or your employer has waived such rights for your contributions to this project;
> (c) your contributions do not violate any third-party intellectual property rights, privacy rights, or applicable law.
>
> **No warranty**: Contributions are provided "as is" without warranty of any kind, to the fullest extent permitted by law.

If you are contributing on behalf of a **legal entity** (AG, GmbH, SA, etc.), an authorised representative must agree to this CLA on the entity's behalf. Contact the maintainer before submitting such a contribution.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20.x (`node --version`)
- **pnpm** ≥ 10 (`pnpm --version`)

### Setup

```bash
git clone https://github.com/binaryjack/ai-agencee.git
cd ai-agencee
pnpm install
pnpm build
pnpm test
```

All 424 tests should pass. If any fail on your machine, open an issue before proceeding.

### Running the demo (no API keys needed)

```bash
pnpm demo          # full demo with mock provider
pnpm demo:06       # error/retry/escalation scenarios
pnpm run:dag agents/demo.dag.json --provider mock
```

### Development workflow

```bash
# Watch-build the engine
cd packages/agent-executor && pnpm dev

# Watch-build the CLI
cd packages/cli && pnpm build

# Run the showcase website locally
pnpm dev:showcase

# Run the DAG editor locally
pnpm dev:dag-editor
```

---

## Coding Standards

These standards are enforced by `tsc`, `eslint`, and the CI pipeline. PRs that fail these checks will not be merged.

### Language & types

- **TypeScript only** — no `.js` files in `packages/`
- **No `any`** — use `unknown` and narrow, or create a proper type
- **Prefer `unknown` over `any`** in catch blocks: `catch (e: unknown)`
- **Strict unions** — no implicit `| undefined` via optional chaining as a type duck-out
- **No `useImperativeHandle`** — if you need it, reconsider the component design

### Naming conventions

| Element | Convention | Example |
|---|---|---|
| Files | **kebab-case** | `dag-orchestrator.ts`, `create-tenant.ts` |
| Types / interfaces | **PascalCase** | `DagRunOptions`, `LaneResult` |
| Functions / variables | **camelCase** within files | (but file names are kebab) |
| Constants | **UPPER_SNAKE** for module-level env-like values | `MAX_RETRY_BUDGET` |
| One item per file | Yes | each exported type/factory in its own file |

### React components (dag-editor / showcase-web)

- **Declarative only** — no imperative DOM manipulation
- **No `class` components** — use functions
- Components are declared as:
  ```typescript
  export const MyComponent = function({ prop }: Props) { ... }
  ```
- Props interfaces defined in a co-located `*.types.ts` file

### Prototype pattern (engine / CLI)

The engine uses the prototype constructor pattern (not ES6 `class`):

```typescript
// feature.ts — constructor
export const DagOrchestrator = function(options: OrchestratorOptions) {
  // initialisation
} as unknown as { new(options: OrchestratorOptions): IDagOrchestrator }

// prototype methods
DagOrchestrator.prototype.run = async function(dag: DagDefinition) { ... }

// factory (create-dag-orchestrator.ts)
export const createDagOrchestrator = (options: OrchestratorOptions) =>
  new (DagOrchestrator as any)(options)
```

Do not introduce ES6 `class` syntax into the engine or CLI packages.

### File map

| Purpose | File name |
|---|---|
| Types / interfaces only | `feature.types.ts` |
| Constructor / prototype | `feature.ts` |
| Factory function | `create-feature.ts` |
| Public exports | `index.ts` |

### Tests

- **Jest** — all packages use jest + ts-jest
- Minimum **95% coverage** on new code (`jest --coverage`)
- Test files: co-located in `__tests__/` or as `feature.test.ts` alongside the source
- Test names: `describe('FeatureName') → it('should do X when Y')`
- Mock external I/O: never hit real LLM APIs in tests; use the mock provider

### Performance

- Target: ≤10% overhead vs Solid.js for UI components (where benchmarked)
- Async functions: prefer streaming/event-based over polling for live data

---

## Commit & PR Process

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(engine): add SQLite-backed vector memory (#42)
fix(cli): resolve path separator on Windows (#57)
docs: add enterprise inquiry template
chore(deps): update jest to 30.2.0
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`

### Branch naming

```
feat/vector-memory-sqlite
fix/barrier-timeout-windows
docs/enterprise-template
```

### Pull request process

1. Fork the repo and create your branch from `main`
2. Make your changes, add tests
3. Ensure `pnpm build && pnpm test && pnpm lint` all pass
4. Fill in the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) completely
5. Open the PR against `main`
6. A maintainer will review within 5 business days
7. Address review feedback — force-push to the same branch (no "fix review" commits)
8. Once approved, the maintainer squash-merges

**Breaking changes** require a discussion issue opened _before_ a PR is submitted.

---

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.yml).

**Security vulnerabilities**: use [GitHub Security Advisories](https://github.com/binaryjack/ai-agencee/security/advisories/new) — never the public issue tracker.

---

## Proposing Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml).

For large features (new package, breaking API change, new enterprise feature), open a discussion first: [GitHub Discussions](https://github.com/binaryjack/ai-agencee/discussions).

---

## Sponsoring

AI Agencee is free and open-source. If it saves you time or enables your product, consider sponsoring the project:

- **GitHub Sponsors**: [github.com/sponsors/binaryjack](https://github.com/sponsors/binaryjack)
- See [SPONSORS.md](SPONSORS.md) for information on what sponsorship funds and what sponsors receive in return.

Sponsorship does **not** confer intellectual property rights, commit access, or preferential issue treatment. It is a voluntary act of support.

### Tax considerations (Switzerland)

Sponsorship payments received by the maintainer are treated as taxable income under Swiss tax law (DBG Art. 16). Sponsors in Switzerland who receive consideration in return (e.g. logo placement, priority support) should consult their tax adviser regarding VAT treatment. GitHub Sponsors payments processed via Stripe are subject to the usual financial services rules.

---

## Questions?

- General questions → [GitHub Discussions](https://github.com/binaryjack/ai-agencee/discussions)
- Bug reports → [Issues](https://github.com/binaryjack/ai-agencee/issues/new/choose)
- Enterprise → [Enterprise Inquiry template](.github/ISSUE_TEMPLATE/enterprise_inquiry.yml)
