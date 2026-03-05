/**
 * tool-executor.ts — Built-in tool implementations for the LLM tool-use loop.
 *
 * Tools exposed to LLMs:
 *   read_file        Read a project file (max 8 KB)
 *   list_dir         List directory contents
 *   run_shell        Execute a shell command (30 s timeout, projectRoot cwd)
 *   grep_project     Recursive regex search across text files
 *   write_file       Write or append content to a project file
 *   get_tool_list    Introspect which tools are available (meta tool)
 *
 * Usage:
 *   const executor = makeBuiltinExecutor(projectRoot);
 *   const result = await executor({ id: '1', name: 'read_file', input: { path: 'src/index.ts' } });
 */

import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import type { LLMTool, LLMToolCall, ToolExecutorFn } from './llm-provider.js';

const execFileAsync = promisify(execFile);

// ─── JSON Schema definitions (used by providers to register tools) ────────────

export const BUILTIN_TOOL_SCHEMAS: LLMTool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the project. Returns up to 8 KB of text.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to projectRoot' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_dir',
    description: 'List the files and sub-directories inside a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to projectRoot (default: ".")' },
      },
      required: [],
    },
  },
  {
    name: 'run_shell',
    description: 'Run a shell command in the project root (30 s timeout). Returns stdout + stderr.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command string to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'grep_project',
    description: 'Search for a regex pattern in all text files under a directory.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        dir:     { type: 'string', description: 'Directory to search in (default: ".")' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the project (overwrites or creates). Use carefully.',
    inputSchema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Path relative to projectRoot' },
        content: { type: 'string', description: 'Content to write' },
        append:  { type: 'boolean', description: 'Append instead of overwrite (default false)' },
      },
      required: ['path', 'content'],
    },
  },
];

// ─── Individual tool handlers ─────────────────────────────────────────────────

const MAX_READ_BYTES = 8 * 1024; // 8 KB

async function toolReadFile(projectRoot: string, input: Record<string, unknown>): Promise<string> {
  const rel = String(input['path'] ?? '');
  if (!rel) return 'Error: path is required';
  const abs = path.resolve(projectRoot, rel);
  // Safety: don't escape projectRoot
  if (!abs.startsWith(projectRoot)) return 'Error: path escapes project root';
  try {
    const buf = Buffer.alloc(MAX_READ_BYTES);
    const fh  = await fs.open(abs, 'r');
    const { bytesRead } = await fh.read(buf, 0, MAX_READ_BYTES, 0);
    await fh.close();
    const content = buf.subarray(0, bytesRead).toString('utf-8');
    const truncated = bytesRead === MAX_READ_BYTES ? '\n[…truncated at 8 KB]' : '';
    return content + truncated;
  } catch (err) {
    return `Error reading file: ${err}`;
  }
}

async function toolListDir(projectRoot: string, input: Record<string, unknown>): Promise<string> {
  const rel = String(input['path'] ?? '.');
  const abs = path.resolve(projectRoot, rel);
  if (!abs.startsWith(projectRoot)) return 'Error: path escapes project root';
  try {
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return lines.join('\n') || '(empty directory)';
  } catch (err) {
    return `Error listing directory: ${err}`;
  }
}

async function toolRunShell(projectRoot: string, input: Record<string, unknown>): Promise<string> {
  const cmd = String(input['command'] ?? '').trim();
  if (!cmd) return 'Error: command is required';
  try {
    const { stdout, stderr } = await execFileAsync(
      process.platform === 'win32' ? 'cmd' : 'sh',
      process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd],
      { cwd: projectRoot, timeout: 30_000, maxBuffer: 256 * 1024 },
    );
    const out = [stdout, stderr].filter(Boolean).join('\n').trim();
    return out || '(no output)';
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return `Exit non-zero:\n${[e.stdout, e.stderr, e.message].filter(Boolean).join('\n')}`;
  }
}

async function toolGrepProject(projectRoot: string, input: Record<string, unknown>): Promise<string> {
  const pattern = String(input['pattern'] ?? '').trim();
  if (!pattern) return 'Error: pattern is required';
  const dir = String(input['dir'] ?? '.').trim();
  const absDir = path.resolve(projectRoot, dir);
  if (!absDir.startsWith(projectRoot)) return 'Error: dir escapes project root';

  const results: string[] = [];
  const MAX_RESULTS = 50;

  async function walk(current: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    let entries: import('fs').Dirent[];
    try { entries = await fs.readdir(current, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break;
      const abs = path.join(current, entry.name);
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        try {
          const content = await fs.readFile(abs, 'utf-8').catch(() => '');
          const re = new RegExp(pattern, 'gm');
          const lines = content.split('\n');
          lines.forEach((line, i) => {
            if (results.length >= MAX_RESULTS) return;
            if (re.test(line)) {
              const rel = path.relative(projectRoot, abs);
              results.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
              re.lastIndex = 0;
            }
          });
        } catch { /* skip binary files */ }
      }
    }
  }

  await walk(absDir);
  if (results.length === 0) return 'No matches found';
  const suffix = results.length >= MAX_RESULTS ? `\n[limited to ${MAX_RESULTS} results]` : '';
  return results.join('\n') + suffix;
}

async function toolWriteFile(projectRoot: string, input: Record<string, unknown>): Promise<string> {
  const rel = String(input['path'] ?? '');
  if (!rel) return 'Error: path is required';
  const content = String(input['content'] ?? '');
  const append  = Boolean(input['append'] ?? false);
  const abs = path.resolve(projectRoot, rel);
  if (!abs.startsWith(projectRoot)) return 'Error: path escapes project root';
  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (append) {
      await fs.appendFile(abs, content, 'utf-8');
    } else {
      await fs.writeFile(abs, content, 'utf-8');
    }
    return `Written ${content.length} bytes to ${rel}`;
  } catch (err) {
    return `Error writing file: ${err}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a `ToolExecutorFn` bound to `projectRoot`.
 * Pass this to `provider.completeWithTools()` or `modelRouter.routeWithTools()`.
 */
export function makeBuiltinExecutor(projectRoot: string): ToolExecutorFn {
  return async (call: LLMToolCall): Promise<string> => {
    switch (call.name) {
      case 'read_file':     return toolReadFile(projectRoot, call.input);
      case 'list_dir':      return toolListDir(projectRoot, call.input);
      case 'run_shell':     return toolRunShell(projectRoot, call.input);
      case 'grep_project':  return toolGrepProject(projectRoot, call.input);
      case 'write_file':    return toolWriteFile(projectRoot, call.input);
      default:
        return `Unknown tool: "${call.name}". Available: read_file, list_dir, run_shell, grep_project, write_file`;
    }
  };
}
