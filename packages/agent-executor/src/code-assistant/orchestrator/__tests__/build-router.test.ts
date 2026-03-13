/**
 * Unit tests: _buildRouter
 *
 * Verifies the four-step resolution waterfall:
 *   1. options.modelRouter (fast path — no I/O)
 *   2. options.dagPath     (explicit config file)
 *   3. <projectRoot>/agents/model-router.json (convention)
 *   4. Inline fromConfig   (no file found)
 *
 * ModelRouter is mocked so these tests run without any real file system I/O
 * or provider key validation.
 */

import path from 'path';
import type { IModelRouter } from '../../../lib/model-router/index.js';
import { createCodeAssistantOrchestrator } from '../code-assistant-orchestrator.js';
import '../index.js'; // side-effect: attaches prototype methods

// ─── ModelRouter mock ─────────────────────────────────────────────────────────

const mockRoute = jest.fn();
const mockAutoRegister = jest.fn().mockResolvedValue(undefined);
const mockRegisteredProviders = jest.fn().mockReturnValue(['anthropic']);
const mockFromFile   = jest.fn();
const mockFromConfig = jest.fn();

jest.mock('../../../lib/model-router/index.js', () => ({
  ModelRouter: {
    fromFile:   (...args: unknown[]) => mockFromFile(...args),
    fromConfig: (...args: unknown[]) => mockFromConfig(...args),
  },
}));

// ─── fs mock ─────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  access:    jest.fn(),
  readFile:  jest.fn(),
  mkdir:     jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink:    jest.fn().mockResolvedValue(undefined),
}));

import * as fsMod from 'fs/promises';
const mockAccess = fsMod.access as jest.Mock;

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeRouterInstance(providers: string[] = ['anthropic']): IModelRouter {
  return {
    route:               mockRoute,
    autoRegister:        mockAutoRegister,
    registeredProviders: jest.fn().mockReturnValue(providers),
    defaultProvider:     jest.fn().mockReturnValue(providers[0] ?? ''),
    routeWithTools:      jest.fn(),
    checkBudget:         jest.fn(),
  } as unknown as IModelRouter;
}

// ─── fast path: pre-wired router ─────────────────────────────────────────────

describe('_buildRouter — fast path (pre-wired)', () => {
  it('returns the pre-wired router immediately without any I/O', async () => {
    const preWired = makeRouterInstance();
    const orch = createCodeAssistantOrchestrator({
      projectRoot:  '/project',
      modelRouter:  preWired,
    });

    const result = await orch._buildRouter();

    expect(result).toBe(preWired);
    expect(mockFromFile).not.toHaveBeenCalled();
    expect(mockFromConfig).not.toHaveBeenCalled();
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it('does not call autoRegister on the pre-wired router', async () => {
    const preWired = makeRouterInstance();
    const orch = createCodeAssistantOrchestrator({
      projectRoot: '/project',
      modelRouter: preWired,
    });

    await orch._buildRouter();
    expect(mockAutoRegister).not.toHaveBeenCalled();
  });
});

// ─── dagPath option ───────────────────────────────────────────────────────────

describe('_buildRouter — explicit dagPath', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads from dagPath when the file exists', async () => {
    const routerInstance = makeRouterInstance();
    mockAccess.mockResolvedValueOnce(undefined); // file exists
    mockFromFile.mockResolvedValueOnce(routerInstance);

    const orch = createCodeAssistantOrchestrator({
      projectRoot: '/project',
      dagPath:     '/custom/router.json',
    });

    const result = await orch._buildRouter();
    expect(mockFromFile).toHaveBeenCalledWith('/custom/router.json');
    expect(result).toBe(routerInstance);
  });

  it('falls back to fromConfig when dagPath file does not exist', async () => {
    const routerInstance = makeRouterInstance();
    mockAccess.mockRejectedValueOnce(new Error('ENOENT')); // file missing
    mockFromConfig.mockReturnValueOnce(routerInstance);

    const orch = createCodeAssistantOrchestrator({
      projectRoot:   '/project',
      dagPath:       '/missing/router.json',
      modelProvider: 'openai',
    });

    await orch._buildRouter();
    expect(mockFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: 'openai' }),
    );
  });
});

// ─── convention-based discovery ───────────────────────────────────────────────

describe('_buildRouter — convention-based discovery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('looks for agents/model-router.json inside projectRoot when no dagPath given', async () => {
    const routerInstance = makeRouterInstance();
    mockAccess.mockResolvedValueOnce(undefined); // file exists
    mockFromFile.mockResolvedValueOnce(routerInstance);

    const orch = createCodeAssistantOrchestrator({ projectRoot: '/my/project' });
    await orch._buildRouter();

    const expectedPath = path.join('/my/project', 'agents', 'model-router.json');
    expect(mockAccess).toHaveBeenCalledWith(expectedPath);
    expect(mockFromFile).toHaveBeenCalledWith(expectedPath);
  });
});

// ─── inline fromConfig fallback ───────────────────────────────────────────────

describe('_buildRouter — inline fromConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses "anthropic" as default provider when modelProvider not set', async () => {
    const routerInstance = makeRouterInstance();
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockFromConfig.mockReturnValueOnce(routerInstance);

    const orch = createCodeAssistantOrchestrator({ projectRoot: '/project' });
    await orch._buildRouter();

    expect(mockFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: 'anthropic' }),
    );
  });

  it('uses options.modelProvider when provided', async () => {
    const routerInstance = makeRouterInstance(['openai']);
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockFromConfig.mockReturnValueOnce(routerInstance);

    const orch = createCodeAssistantOrchestrator({
      projectRoot:   '/project',
      modelProvider: 'openai',
    });
    await orch._buildRouter();

    expect(mockFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: 'openai' }),
    );
  });

  it('calls autoRegister() on the constructed router', async () => {
    const routerInstance = makeRouterInstance();
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockFromConfig.mockReturnValueOnce(routerInstance);

    const orch = createCodeAssistantOrchestrator({ projectRoot: '/project' });
    await orch._buildRouter();

    expect(mockAutoRegister).toHaveBeenCalledTimes(1);
  });
});

// ─── no providers registered ─────────────────────────────────────────────────

describe('_buildRouter — no registered providers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns undefined when autoRegister finds no providers', async () => {
    const routerInstance = makeRouterInstance([]); // empty providers list
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockFromConfig.mockReturnValueOnce(routerInstance);

    const orch = createCodeAssistantOrchestrator({ projectRoot: '/project' });
    const result = await orch._buildRouter();

    expect(result).toBeUndefined();
  });
});

// ─── error resilience ─────────────────────────────────────────────────────────

describe('_buildRouter — error resilience', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns undefined (does not throw) when fromFile throws', async () => {
    mockAccess.mockResolvedValueOnce(undefined);
    mockFromFile.mockRejectedValueOnce(new Error('invalid JSON'));

    const orch = createCodeAssistantOrchestrator({ projectRoot: '/project' });
    const result = await orch._buildRouter();

    expect(result).toBeUndefined();
  });

  it('returns undefined when fromConfig throws', async () => {
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockFromConfig.mockImplementationOnce(() => { throw new Error('bad config'); });

    const orch = createCodeAssistantOrchestrator({ projectRoot: '/project' });
    const result = await orch._buildRouter();

    expect(result).toBeUndefined();
  });

  it('returns undefined when autoRegister throws', async () => {
    const routerInstance = makeRouterInstance();
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    mockFromConfig.mockReturnValueOnce(routerInstance);
    mockAutoRegister.mockRejectedValueOnce(new Error('key not set'));

    const orch = createCodeAssistantOrchestrator({ projectRoot: '/project' });
    const result = await orch._buildRouter();

    expect(result).toBeUndefined();
  });
});
