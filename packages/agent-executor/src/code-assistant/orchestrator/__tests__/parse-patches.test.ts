/**
 * Unit tests: _parsePatches
 *
 * The parser converts a raw LLM response string into an ordered FilePatch list.
 * It handles ## FILE and ## DELETE blocks, discards surrounding prose, and always
 * places DELETE entries before FILE entries in the result array (order-of-capture,
 * not order-of-appearance) — this avoids write-then-delete accidents.
 */

import { createCodeAssistantOrchestrator } from '../code-assistant-orchestrator.js';
import '../index.js'; // side-effect: attaches prototype methods

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeOrchestrator() {
  return createCodeAssistantOrchestrator({ projectRoot: '/project' });
}

// ─── basic parsing ────────────────────────────────────────────────────────────

describe('_parsePatches — FILE blocks', () => {
  it('parses a single FILE block with typescript fence', () => {
    const orch = makeOrchestrator();
    const response = `
## FILE: src/hello.ts
\`\`\`typescript
export const hello = () => 'world';
\`\`\`
`.trim();

    const patches = orch._parsePatches(response);

    expect(patches).toHaveLength(1);
    expect(patches[0].relativePath).toBe('src/hello.ts');
    expect(patches[0].content).toBe("export const hello = () => 'world';\n");
    expect(patches[0].delete).toBeFalsy();
  });

  it('parses a FILE block with no fence language tag', () => {
    const orch = makeOrchestrator();
    const response = `## FILE: config.json\n\`\`\`\n{ "key": 1 }\n\`\`\``;

    const patches = orch._parsePatches(response);

    expect(patches).toHaveLength(1);
    expect(patches[0].relativePath).toBe('config.json');
    expect(patches[0].content).toContain('"key": 1');
  });

  it('parses multiple FILE blocks', () => {
    const orch = makeOrchestrator();
    const response = `
## FILE: a.ts
\`\`\`typescript
const a = 1;
\`\`\`

## FILE: b.ts
\`\`\`typescript
const b = 2;
\`\`\`
`.trim();

    const patches = orch._parsePatches(response);
    expect(patches).toHaveLength(2);
    expect(patches.map((p) => p.relativePath)).toEqual(['a.ts', 'b.ts']);
  });

  it('parses a FILE path with deep sub-directories', () => {
    const orch = makeOrchestrator();
    const response = `
## FILE: packages/core/src/utils/deep/helper.ts
\`\`\`ts
export {};
\`\`\`
`.trim();

    const patches = orch._parsePatches(response);
    expect(patches[0].relativePath).toBe('packages/core/src/utils/deep/helper.ts');
  });

  it('preserves multi-line file content exactly', () => {
    const orch = makeOrchestrator();
    const content = `import { foo } from './foo.js';\n\nexport function bar() {\n  return foo();\n}\n`;
    const response = `## FILE: src/bar.ts\n\`\`\`typescript\n${content}\`\`\``;

    const patches = orch._parsePatches(response);
    expect(patches[0].content).toBe(content);
  });
});

// ─── DELETE blocks ────────────────────────────────────────────────────────────

describe('_parsePatches — DELETE blocks', () => {
  it('parses a single DELETE directive', () => {
    const orch = makeOrchestrator();
    const patches = orch._parsePatches('## DELETE: src/old-file.ts');

    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      relativePath: 'src/old-file.ts',
      content:      '',
      delete:       true,
    });
  });

  it('trims whitespace from the DELETE path', () => {
    const orch = makeOrchestrator();
    const patches = orch._parsePatches('## DELETE:   src/extra-spaces.ts   ');
    expect(patches[0].relativePath).toBe('src/extra-spaces.ts');
  });

  it('parses multiple DELETE directives', () => {
    const orch = makeOrchestrator();
    const response = `## DELETE: remove-a.ts\n## DELETE: remove-b.ts`;

    const patches = orch._parsePatches(response);
    expect(patches).toHaveLength(2);
    expect(patches.every((p) => p.delete)).toBe(true);
  });
});

// ─── ordering guarantee ───────────────────────────────────────────────────────

describe('_parsePatches — DELETE-before-FILE ordering', () => {
  it('returns DELETE entries before FILE entries regardless of text order', () => {
    const orch = makeOrchestrator();
    // In the response, FILE appears first; DELETE appears second.
    // The result must still list DELETE first.
    const response = `
## FILE: src/new.ts
\`\`\`typescript
export const x = 1;
\`\`\`

## DELETE: src/old.ts
`.trim();

    const patches = orch._parsePatches(response);
    expect(patches).toHaveLength(2);
    expect(patches[0].delete).toBe(true);           // DELETE first
    expect(patches[0].relativePath).toBe('src/old.ts');
    expect(patches[1].delete).toBeUndefined();      // FILE second
    expect(patches[1].relativePath).toBe('src/new.ts');
  });

  it('interleaved DELETE+FILE: all DELETEs still precede all FILEs', () => {
    const orch = makeOrchestrator();
    const response = `
## FILE: src/a.ts
\`\`\`ts
const a = 1;
\`\`\`

## DELETE: src/b.ts

## FILE: src/c.ts
\`\`\`ts
const c = 3;
\`\`\`

## DELETE: src/d.ts
`.trim();

    const patches = orch._parsePatches(response);
    const deletes = patches.filter((p) => p.delete);
    const files   = patches.filter((p) => !p.delete);
    const firstFileIdx  = patches.findIndex((p) => !p.delete);
    const lastDeleteIdx = patches.map((p) => p.delete).lastIndexOf(true);

    expect(deletes).toHaveLength(2);
    expect(files).toHaveLength(2);
    // All deletes come before all files
    expect(lastDeleteIdx).toBeLessThan(firstFileIdx);
  });
});

// ─── edge & error cases ───────────────────────────────────────────────────────

describe('_parsePatches — edge cases', () => {
  it('returns empty array for empty string', () => {
    const orch = makeOrchestrator();
    expect(orch._parsePatches('')).toEqual([]);
  });

  it('returns empty array for pure prose (no blocks)', () => {
    const orch = makeOrchestrator();
    const prose = 'I would refactor by extracting a helper function and updating its callers.';
    expect(orch._parsePatches(prose)).toEqual([]);
  });

  it('ignores incomplete fence (no closing ```)', () => {
    const orch = makeOrchestrator();
    // No closing fence → regex won't match
    const response = `## FILE: incomplete.ts\n\`\`\`typescript\nconst x = 1;`;
    const patches = orch._parsePatches(response);
    expect(patches).toHaveLength(0);
  });

  it('does not crash on very long response (1000+ lines)', () => {
    const orch = makeOrchestrator();
    const longContent = Array.from({ length: 1100 }, (_, i) => `const v${i} = ${i};`).join('\n');
    const response = `## FILE: big.ts\n\`\`\`typescript\n${longContent}\n\`\`\``;

    expect(() => orch._parsePatches(response)).not.toThrow();
    const patches = orch._parsePatches(response);
    expect(patches).toHaveLength(1);
    expect(patches[0].relativePath).toBe('big.ts');
  });

  it('handles a path that looks like a path traversal attempt (no processing — preserved verbatim)', () => {
    // _parsePatches itself doesn't validate paths — execute() and path.join handle that.
    // We just verify the raw value is captured so callers can inspect it.
    const orch = makeOrchestrator();
    const response = `## DELETE: ../../etc/passwd`;
    const patches = orch._parsePatches(response);
    expect(patches[0].relativePath).toBe('../../etc/passwd');
  });

  it('handles consecutive FILE blocks without blank line separator', () => {
    const orch = makeOrchestrator();
    const response = `## FILE: a.ts\n\`\`\`\nconst a=1;\n\`\`\`\n## FILE: b.ts\n\`\`\`\nconst b=2;\n\`\`\``;
    const patches = orch._parsePatches(response);
    expect(patches).toHaveLength(2);
  });

  it('does not emit a patch for lines that almost-match (## file: lowercase)', () => {
    const orch = makeOrchestrator();
    // The contract mandates uppercase — lowercase headers are prose, not commands.
    const response = `## file: src/lower.ts\n\`\`\`\ncode\n\`\`\``;
    expect(orch._parsePatches(response)).toHaveLength(0);
  });
});
