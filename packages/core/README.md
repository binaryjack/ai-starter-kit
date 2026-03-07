# @ai-agencee/core

[![npm](https://img.shields.io/npm/v/@ai-agencee/core)](https://www.npmjs.com/package/@ai-agencee/core)
[![license](https://img.shields.io/npm/l/@ai-agencee/core)](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)

Foundation utilities for the **AI Agencee** toolkit. Provides async file-system helpers, project validation, and a template scaffolding/sync system used by [`@ai-agencee/cli`](https://www.npmjs.com/package/@ai-agencee/cli) and [`@ai-agencee/engine`](https://www.npmjs.com/package/@ai-agencee/engine).

---

## Installation

```bash
npm install @ai-agencee/core
# or
pnpm add @ai-agencee/core
```

> **Node ≥ 20** required. CommonJS module.

---

## API

### File System

Async wrappers over `fs/promises` with safe directory creation.

```ts
import {
  fileExists,
  readFile,
  writeFile,
  listFilesRecursive,
  copyTemplateFiles,
  syncTemplateFiles,
} from '@ai-agencee/core';
```

#### `fileExists(filePath: string): Promise<boolean>`

Returns `true` if the path is accessible, `false` otherwise. Never throws.

```ts
if (await fileExists('./src/.ai/rules.md')) {
  // already initialised
}
```

#### `readFile(filePath: string): Promise<string>`

Reads a file as UTF-8 text.

#### `writeFile(filePath: string, content: string): Promise<void>`

Writes `content` to `filePath`. Creates all parent directories automatically.

#### `listFilesRecursive(dir: string): Promise<string[]>`

Returns the absolute paths of every file under `dir`, traversing subdirectories.

```ts
const files = await listFilesRecursive('./src');
// [ '/abs/path/src/index.ts', '/abs/path/src/utils/helper.ts', … ]
```

#### `copyTemplateFiles(src, dest, confirm): Promise<string[]>`

Copies all files from `src` into `dest`. For each destination path, calls `confirm(filePath)` — only copies when `confirm` returns `true`. Returns the list of files actually written.

```ts
const written = await copyTemplateFiles(templateDir, projectDir, async (dest) => {
  if (await fileExists(dest)) {
    const answer = await prompt(`Overwrite ${dest}? [y/N] `);
    return answer === 'y';
  }
  return true;
});
```

#### `syncTemplateFiles(src, dest): Promise<SyncResult[]>`

Compares every file in `src` to `dest`. Writes files that are missing or diverged, leaves identical files untouched.

```ts
export interface SyncResult {
  path: string;
  status: 'updated' | 'ok' | 'diverged';
}
```

| Status | Meaning |
|--------|---------|
| `updated` | File was missing in dest — created |
| `diverged` | File existed but differed — overwritten with template version |
| `ok` | File matched template — no action |

---

### Project Validation

```ts
import { checkProject, CheckResult } from '@ai-agencee/core';
```

#### `checkProject(projectDir: string): Promise<CheckResult[]>`

Runs three categories of rules against a project directory:

1. **Required-file checks** — verifies every entry in `REQUIRED_FILES` exists.
2. **Naming checks** — asserts all source file base-names are `kebab-case`.
3. **Forbidden-pattern checks** — scans `.ts`/`.tsx`/`.js`/`.jsx` files for patterns in `FORBIDDEN_PATTERNS`.

```ts
export interface CheckResult {
  rule: string;   // e.g. 'required-file:.github/copilot-instructions.md'
  pass: boolean;
  message: string; // empty when pass === true
}

const results = await checkProject('./my-project');
for (const r of results) {
  if (!r.pass) console.error(`FAIL ${r.rule}: ${r.message}`);
}
```

---

### Template Loading

```ts
import { loadTemplateFiles, TemplateFile } from '@ai-agencee/core';
```

#### `loadTemplateFiles(): Promise<TemplateFile[]>`

Reads every file bundled inside the package's `template/` directory and returns their relative paths and contents. Used by the CLI and MCP server to stream template content to AI assistants.

```ts
export interface TemplateFile {
  relativePath: string;  // e.g. '.github/copilot-instructions.md'
  content: string;
}
```

---

### Constants

```ts
import { TEMPLATE_DIR, REQUIRED_FILES, FORBIDDEN_PATTERNS } from '@ai-agencee/core';
```

| Constant | Type | Description |
|----------|------|-------------|
| `TEMPLATE_DIR` | `string` | Absolute path to the bundled template directory |
| `REQUIRED_FILES` | `string[]` | Relative paths that must exist in a valid project |
| `FORBIDDEN_PATTERNS` | `string[]` | Code substrings that must not appear (`class `, ` any `, `useImperativeHandle`) |

**Required files enforced:**
```
.github/copilot-instructions.md
.github/ai/manifest.xml
.github/ai/pipeline.xml
.github/ai/architecture-rules.xml
.github/ai/quality-gates.xml
src/.ai/bootstrap.md
src/.ai/rules.md
src/.ai/patterns.md
```

---

## Bundled Template

When you install this package, a ready-to-use project template ships inside `dist/template/`. It contains the complete set of AI rule files referenced by `REQUIRED_FILES`:

- **`.github/copilot-instructions.md`** — Copilot/Claude session configuration with ULTRA_HIGH standards
- **`.github/ai/manifest.xml`** — Project capabilities manifest
- **`.github/ai/pipeline.xml`** — CI/CD pipeline rules
- **`.github/ai/architecture-rules.xml`** — Architecture constraints
- **`.github/ai/quality-gates.xml`** — Quality gate thresholds
- **`src/.ai/bootstrap.md`** — Session bootstrap guide
- **`src/.ai/rules.md`** — Coding rules reference
- **`src/.ai/patterns.md`** — Design patterns reference

Use `ai-kit init` (from [`@ai-agencee/cli`](https://www.npmjs.com/package/@ai-agencee/cli)) to scaffold these files into your project.

---

## Related Packages

| Package | Description |
|---------|-------------|
| [`@ai-agencee/engine`](https://www.npmjs.com/package/@ai-agencee/engine) | Multi-lane supervised DAG execution engine |
| [`@ai-agencee/mcp`](https://www.npmjs.com/package/@ai-agencee/mcp) | MCP server for AI assistant integration |
| [`@ai-agencee/cli`](https://www.npmjs.com/package/@ai-agencee/cli) | CLI tool — `ai-kit init / sync / check / agent:dag` |

---

## License

MIT — see [LICENSE](https://github.com/binaryjack/ai-agencee/blob/main/LICENSE)
