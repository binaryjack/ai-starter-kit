import { DagBuilder, LaneBuilder } from '../lib/dag-builder.js'

describe('DagBuilder', () => {
  describe('basic construction', () => {
    it('produces a minimal valid definition', () => {
      const def = new DagBuilder('my-dag').build();
      expect(def.name).toBe('my-dag');
      expect(def.lanes).toEqual([]);
      expect(def.globalBarriers).toEqual([]);
      expect(def.capabilityRegistry).toEqual({});
    });

    it('carries through description', () => {
      const def = new DagBuilder('dag').description('Hello world').build();
      expect(def.description).toBe('Hello world');
    });

    it('sets budgetUSD via .budget()', () => {
      const def = new DagBuilder('dag').budget(0.05).build();
      expect(def.budgetUSD).toBe(0.05);
    });

    it('defaults modelRouterFile to "model-router.json"', () => {
      const def = new DagBuilder('dag').build();
      expect(def.modelRouterFile).toBe('model-router.json');
    });

    it('sets custom modelRouterFile via .modelRouter()', () => {
      const def = new DagBuilder('dag').modelRouter('agents/custom-router.json').build();
      expect(def.modelRouterFile).toBe('agents/custom-router.json');
    });
  });

  describe('lanes', () => {
    it('produces one lane', () => {
      const def = new DagBuilder('dag').lane('frontend').build();
      expect(def.lanes).toHaveLength(1);
      expect(def.lanes[0]?.id).toBe('frontend');
    });

    it('produces multiple lanes in definition order', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .lane('b')
        .lane('c')
        .build();
      expect(def.lanes.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    });

    it('carries dependsOn through opts', () => {
      const def = new DagBuilder('dag').lane('b', { dependsOn: ['a'] }).build();
      expect(def.lanes[0]?.dependsOn).toEqual(['a']);
    });

    it('carries providerOverride via provider shorthand', () => {
      const def = new DagBuilder('dag').lane('be', { provider: 'anthropic' }).build();
      expect(def.lanes[0]?.providerOverride).toBe('anthropic');
    });

    it('adds capabilities via .capability() on LaneBuilder and builds registry', () => {
      const def = new DagBuilder('dag')
        .lane('be')
        .capability('database')
        .capability('auth')
        .build();
      expect(def.capabilityRegistry['database']).toEqual(['be']);
      expect(def.capabilityRegistry['auth']).toEqual(['be']);
    });

    it('multiple lanes sharing same capability both appear in registry', () => {
      const def = new DagBuilder('dag')
        .lane('be')
        .capability('auth')
        .lane('fe')
        .capability('auth')
        .build();
      expect(def.capabilityRegistry['auth']).toEqual(['be', 'fe']);
    });
  });

  describe('LaneBuilder fluent API', () => {
    it('returns LaneBuilder from .lane()', () => {
      const lb = new DagBuilder('dag').lane('a');
      expect(lb).toBeInstanceOf(LaneBuilder);
    });

    it('.check() adds a check and returns same LaneBuilder (fluent)', () => {
      const lb = new DagBuilder('dag').lane('a');
      const result = lb.check({ type: 'llm-review', taskType: 'code-review' });
      expect(result).toBe(lb);
      const def = lb.build();
      expect(def.lanes[0]?.checks).toHaveLength(1);
      expect(def.lanes[0]?.checks?.[0]).toMatchObject({ type: 'llm-review', taskType: 'code-review' });
    });

    it('.agentFile() sets agentFile on the lane', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .agentFile('agents/01-business-analyst.agent.json')
        .build();
      expect(def.lanes[0]?.agentFile).toBe('agents/01-business-analyst.agent.json');
    });

    it('.supervisorFile() sets supervisorFile on the lane', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .supervisorFile('agents/01.supervisor.json')
        .build();
      expect(def.lanes[0]?.supervisorFile).toBe('agents/01.supervisor.json');
    });

    it('.provider() sets providerOverride on the lane', () => {
      const def = new DagBuilder('dag').lane('a').provider('ollama').build();
      expect(def.lanes[0]?.providerOverride).toBe('ollama');
    });

    it('.dependsOn() appends dependencies fluently', () => {
      const def = new DagBuilder('dag')
        .lane('b')
        .dependsOn('a', 'c')
        .build();
      expect(def.lanes[0]?.dependsOn).toEqual(['a', 'c']);
    });

    it('chaining .lane() on LaneBuilder adds second lane', () => {
      const def = new DagBuilder('dag').lane('a').lane('b').build();
      expect(def.lanes).toHaveLength(2);
    });

    it('.barrier() called on LaneBuilder delegates to DagBuilder', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .barrier('gate', 'hard')
        .build();
      expect(def.globalBarriers).toHaveLength(1);
      expect(def.globalBarriers[0]?.name).toBe('gate');
    });
  });

  describe('barriers', () => {
    it('creates a barrier with all preceding lanes as participants when none specified', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .lane('b')
        .barrier('gate', 'hard')
        .build();
      expect(def.globalBarriers[0]?.participants).toEqual(['a', 'b']);
    });

    it('respects explicit participants list', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .lane('b')
        .barrier('selective', 'soft', { participants: ['a'] })
        .build();
      expect(def.globalBarriers[0]?.participants).toEqual(['a']);
    });

    it('carries timeoutMs', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .barrier('gate', 'hard', { timeoutMs: 30_000 })
        .build();
      expect(def.globalBarriers[0]?.timeoutMs).toBe(30_000);
    });

    it('supports soft mode', () => {
      const def = new DagBuilder('dag').lane('a').barrier('g', 'soft').build();
      expect(def.globalBarriers[0]?.mode).toBe('soft');
    });

    it('barriers between lane groups partition participants correctly', () => {
      const def = new DagBuilder('dag')
        .lane('a')
        .lane('b')
        .barrier('first-gate', 'hard')
        .lane('c')
        .lane('d')
        .build();
      // first barrier should only have a, b
      expect(def.globalBarriers[0]?.participants).toEqual(['a', 'b']);
      expect(def.lanes).toHaveLength(4);
    });
  });

  describe('toJSON', () => {
    it('returns valid JSON string', () => {
      const builder = new DagBuilder('dag');
      builder.lane('a');
      const json = builder.toJSON();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('round-trips through JSON to same structure', () => {
      const builder = new DagBuilder('dag').budget(0.10);
      builder.lane('be', { dependsOn: [] });
      builder.lane('fe');
      const json = JSON.parse(builder.toJSON());
      expect(json.name).toBe('dag');
      expect(json.budgetUSD).toBe(0.10);
      expect(json.lanes).toHaveLength(2);
    });

    it('accepts custom indent', () => {
      const json = new DagBuilder('dag').toJSON(4);
      expect(json).toContain('    '); // 4-space indent
    });
  });

  describe('build() idempotency', () => {
    it('can call build() twice without side effects', () => {
      const builder = new DagBuilder('dag').lane('a');
      const def1 = builder.build();
      const def2 = builder.build();
      expect(def1.lanes).toHaveLength(1);
      expect(def2.lanes).toHaveLength(1);
    });
  });
});
