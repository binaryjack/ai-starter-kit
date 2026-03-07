# TypeScript DAG Builder API

**Status**: 🔜 Planned | **Priority**: P0 | **Roadmap**: G-22  
**Related**: DAG Orchestration, Check Handlers

## Overview

The TypeScript DAG Builder API provides a **fluent, type-safe alternative to hand-writing JSON DAG files**. It enables programmatic DAG construction with full IDE IntelliSense and compile-time validation.

### Key Capabilities

- **Fluent builder pattern** — Chainable API for readable code
- **Type safety** — Full TypeScript inference and validation
- **IDE IntelliSense** — Autocomplete for all options
- **Configuration composition** — Reusable builder composables
- **Runtime validation** — Catches errors before execution
- **JSON export** — Generate DAGs programmatically or save to file

---

## Core Concepts

### Builder Pattern

```typescript
// Before: Hand-written JSON (error-prone)
const dagJson = {
  name: "my-dag",
  lanes: [
    { id: "backend", checks: [ /* ... */ ] }
  ]
};

// After: TypeScript builder (type-safe)
const dag = new DagBuilder('my-dag')
  .lane('backend')
    .check('code-review')
    .input({ taskType: 'code-review' })
    .build();
```

---

## Quick Start

### 1. Create Basic DAG

```typescript
import { DagBuilder } from '@ai-agencee/ai-kit-agent-executor';

const dag = new DagBuilder('code-review-workflow')
  .budget(5.00)
  .lane('backend')
    .displayName('Backend Team')
    .check('api-review')
      .type('llm-review')
      .taskType('code-review')
      .prompt('Review src/api for security and performance')
      .model('sonnet')
      .output('backend_review')
    .end()
    .check('generate-tests')
      .type('llm-generate')
      .taskType('code-generation')
      .prompt('Generate unit tests for the API')
      .model('sonnet')
      .output('backend_tests')
    .end()
  .end()
  .build();

console.log(JSON.stringify(dag, null, 2));
```

### 2. Add Multiple Lanes

```typescript
const dag = new DagBuilder('multi-lane-review')
  .budget(10.00)
  
  // Backend lane
  .lane('backend')
    .displayName('Backend Implementation')
    .check('code-review')
      .type('llm-review')
      .taskType('code-review')
      .prompt('Review API implementation')
      .model('sonnet')
      .output('backend_review')
    .end()
  .end()
  
  // Frontend lane (parallel)
  .lane('frontend')
    .displayName('Frontend Implementation')
    .check('component-review')
      .type('llm-review')
      .taskType('code-review')
      .prompt('Review React components')
      .model('sonnet')
      .output('frontend_review')
    .end()
  .end()
  
  // Security lane
  .lane('security')
    .displayName('Security Audit')
    .check('security-scan')
      .type('llm-review')
      .taskType('security-review')
      .prompt('Full security audit of codebase')
      .model('opus')
      .output('security_findings')
    .end()
  .end()
  
  .build();
```

### 3. Add Barriers & Supervision

```typescript
const dag = new DagBuilder('supervised-workflow')
  .budget(15.00)
  
  .lane('analysis')
    .check('initial-analysis')
      .type('llm-generate')
      .taskType('analysis')
      .output('analysis_results')
    .end()
  .end()
  
  .barrier('post-analysis')
    .type('hard')
    .dependsOn('analysis')
  .end()
  
  .supervisor()
    .checkpointLevel('APPROVE')
    .escalationPolicy('onAnyFailure')
  .end()
  
  .build();
```

---

## Configuration Reference

### DagBuilder

```typescript
class DagBuilder {
  constructor(name: string);
  
  // Metadata
  name(name: string): this;
  description(desc: string): this;
  
  // Execution
  budget(usd: number): this;
  maxDurationMs(ms: number): this;
  
  // Topology
  lane(id: string): LaneBuilder;
  barrier(id: string): BarrierBuilder;
  supervisor(): SupervisorBuilder;
  
  // Build
  build(): DagDefinition;
  toJson(pretty?: boolean): string;
  saveToFile(path: string): Promise<void>;
}
```

### LaneBuilder

```typescript
class LaneBuilder {
  constructor(laneId: string);
  
  // Configuration
  displayName(name: string): this;
  icon(emoji: string): this;
  description(desc: string): this;
  
  // Model routing
  provider(name: string): this;      // 'anthropic' | 'openai' | etc
  defaultModel(family: string): this; // 'haiku' | 'sonnet' | 'opus'
  
  // Execution
  check(checkId: string): CheckBuilder;
  dependsOn(...laneIds: string[]): this;
  
  // Supervision
  supervisor(): IntraSupervisorBuilder;
  
  // Management
  end(): DagBuilder;
}
```

### CheckBuilder

```typescript
class CheckBuilder {
  constructor(checkId: string);
  
  // Type
  type(checkType: string): this;   // 'file-exists' | 'llm-review' | etc
  
  // LLM specifics
  taskType(task: string): this;
  prompt(prompt: string): this;
  model(model: 'haiku' | 'sonnet' | 'opus'): this;
  
  // Input/Output
  input(params: Record<string, any>): this;
  output(key: string): this;
  
  // Options
  temperature(temp: number): this;
  maxTokens(tokens: number): this;
  
  // Validation
  pass(message: string): this;
  fail(message: string): this;
  
  // Tool use
  tools(...names: string[]): this;
  toolOptions(opts: ToolOptions): this;
  
  // Management
  end(): LaneBuilder;
}
```

### BarrierBuilder

```typescript
class BarrierBuilder {
  constructor(barrierId: string);
  
  type(barrierType: 'soft' | 'hard'): this;
  dependsOn(...laneIds: string[]): this;
  timeout(ms: number): this;
  escalateOnTimeout(enable: boolean): this;
  
  end(): DagBuilder;
}
```

### SupervisorBuilder

```typescript
class SupervisorBuilder {
  checkpointLevel(level: 'VALIDATE' | 'APPROVE' | 'ESCALATE'): this;
  escalationPolicy(policy: 'onAnyFailure' | 'onMajorityFailure'): this;
  verdictTimeout(ms: number): this;
  humanReviewRequired(required: boolean): this;
  
  end(): DagBuilder;
}
```

---

## Examples

### Example 1: Simple Code Review

```typescript
import { DagBuilder } from '@ai-agencee/ai-kit-agent-executor';

const reviewDag = new DagBuilder('simple-review')
  .description('Basic code review workflow')
  .budget(2.50)
  
  .lane('code-review')
    .displayName('Code Review')
    .check('review')
      .type('llm-review')
      .taskType('code-review')
      .prompt('Review src/ for code quality, type safety, and best practices')
      .model('sonnet')
      .output('review_result')
      .pass('✅ Code review complete')
    .end()
  .end()
  
  .build();

// Use immediately
const orchestrator = new DagOrchestrator(projectRoot);
const result = await orchestrator.execute(reviewDag);
```

### Example 2: Reusable Components

```typescript
// Helper: Create a standard code review check
function codeReviewCheck(
  checkId: string,
  path: string,
  model: 'haiku' | 'sonnet' | 'opus' = 'sonnet'
): CheckBuilder {
  return new CheckBuilder(checkId)
    .type('llm-review')
    .taskType('code-review')
    .prompt(`Review ${path} for code quality, security, and performance`)
    .model(model)
    .output(`${checkId}_result`);
}

// Helper: Create a lane for specific service
function serviceLane(serviceName: string) {
  const builder = new LaneBuilder(serviceName);
  builder.displayName(`${serviceName} Review`);
  return builder;
}

// Build DAG using helpers
const dag = new DagBuilder('multi-service-review')
  .budget(15.00)
  
  .lane('auth-service')
    .displayName('Auth Service')
    .check('auth-review')
      .type('llm-review')
      .taskType('security-review')
      .prompt('Review authentication layer for security')
      .model('opus')
      .output('auth_review')
    .end()
  .end()
  
  .lane('api-service')
    .displayName('API Service')
    .check('api-review')
      .type('llm-review')
      .taskType('code-review')
      .prompt('Review API design for RESTful compliance')
      .model('sonnet')
      .output('api_review')
    .end()
  .end()
  
  .build();
```

### Example 3: Complex Workflow with Composition

```typescript
import { DagBuilder } from '@ai-agencee/ai-kit-agent-executor';

// Composition: Feature implementation workflow
function featureImplementationDag(featureName: string, budget: number) {
  return new DagBuilder(`${featureName}-impl`)
    .description(`Implement and review ${featureName}`)
    .budget(budget)
    
    // Phase 1: Architecture
    .lane('architecture')
      .displayName('Architecture')
      .check('design')
        .type('llm-generate')
        .taskType('architecture-decision')
        .prompt(`Design the system for ${featureName}`)
        .model('opus')
        .output('architecture')
      .end()
    .end()
    
    .barrier('architecture-done')
      .type('hard')
      .dependsOn('architecture')
    .end()
    
    // Phase 2: Implementation (depends on architecture)
    .lane('backend')
      .displayName('Backend Implementation')
      .dependsOn('architecture')
      .check('implement')
        .type('llm-generate')
        .taskType('code-generation')
        .prompt(`Implement backend for ${featureName}`)
        .model('sonnet')
        .maxTokens(4000)
        .output('backend_code')
      .end()
    .end()
    
    .lane('frontend')
      .displayName('Frontend Implementation')
      .dependsOn('architecture')
      .check('implement')
        .type('llm-generate')
        .taskType('code-generation')
        .prompt(`Implement React UI for ${featureName}`)
        .model('sonnet')
        .output('frontend_code')
      .end()
    .end()
    
    .barrier('implementation-done')
      .type('hard')
      .dependsOn('backend', 'frontend')
    .end()
    
    // Phase 3: Testing
    .lane('testing')
      .displayName('Testing')
      .dependsOn('implementation-done')
      .check('generate-tests')
        .type('llm-generate')
        .taskType('code-generation')
        .prompt(`Generate comprehensive tests for ${featureName}`)
        .model('sonnet')
        .output('tests')
      .end()
      .check('run-tests')
        .type('run-command')
        .input({ command: 'npm test' })
        .output('test_results')
      .end()
    .end()
    
    .barrier('ready-to-merge')
      .type('hard')
      .dependsOn('testing')
    .end()
    
    // Phase 4: Final review
    .lane('review')
      .displayName('Code Review')
      .dependsOn('ready-to-merge')
      .check('security-review')
        .type('llm-review')
        .taskType('security-review')
        .prompt(`Security audit for ${featureName}`)
        .model('opus')
        .output('security_audit')
      .end()
      .check('architecture-review')
        .type('llm-review')
        .taskType('architecture-decision')
        .prompt(`Architecture compliance check for ${featureName}`)
        .model('opus')
        .output('architecture_review')
      .end()
    .end()
    
    .supervisor()
      .checkpointLevel('APPROVE')
      .escalationPolicy('onAnyFailure')
    .end()
    
    .build();
}

// Use the composition
const dag = featureImplementationDag('real-time-notifications', 50.00);
console.log(dag);
```

---

## Advanced Features

### Conditional Execution

```typescript
const dag = new DagBuilder('conditional-flow')
  .lane('initial')
    .check('analyze')
      .type('llm-review')
      .output('analysis')
    .end()
  .end()
  
  // Only run if complexity >= high
  .lane('detailed-review')
    .displayName('Detailed Review (High Complexity)')
    .check('deep-analysis')
      .type('llm-review')
      .prompt('Perform deep analysis')
      .model('opus')  // More powerful model
      .output('detailed_findings')
    .end()
  .end()
  
  .build();
```

### Parameterized Prompts

```typescript
const builder = new CheckBuilder('review')
  .type('llm-review')
  .taskType('code-review');

// Template variables
const pathVar = '{path}';
const promptTemplate = `Review code in ${pathVar} for:
- Type safety
- Performance issues
- Security vulnerabilities`;

builder
  .prompt(promptTemplate)
  .model('sonnet');
```

---

## Export & Reuse

### Save to File

```typescript
const dag = new DagBuilder('my-workflow')
  .lane('backend')
    .check('review')
      .type('llm-review')
      .output('review')
    .end()
  .end()
  .build();

// Save as JSON
await new DagBuilder('my-workflow').saveToFile('agents/my-workflow.dag.json');

// Now it can be used from CLI
// ai-kit agent:dag agents/my-workflow.dag.json
```

### Import & Extend

```typescript
import { loadDagFromFile } from '@ai-agencee/engine';

const baseDag = await loadDagFromFile('agents/base-review.dag.json');

// Extend with new lanes
const extended = new DagBuilder(baseDag.name)
  // ... base configuration from baseDag
  .lane('additional-check')
    .check('new-check')
      .type('llm-review')
      .output('new_result')
    .end()
  .end()
  .build();
```

---

## Validation

### Type-Safe at Compile Time

```typescript
// ✅ Correct
const dag = new DagBuilder('test')
  .budget(5.00)  // Number type checked
  .lane('test')
    .check('check1')
      .model('sonnet')  // Valid option
      .end()
    .end()
  .build();

// ❌ Error: would not compile
const badDag = new DagBuilder('test')
  .budget('five')  // Type error: string not allowed
  .lane('test')
    .check('check1')
      .model('invalid-model')  // Type error
      .end()
    .end()
  .build();
```

### Runtime Validation

```typescript
try {
  const dag = new DagBuilder('test')
    .budget(0)  // Invalid: budget must be positive
    .build();
} catch (e) {
  console.error('DAG validation failed:', e.message);
  // Error: Budget must be greater than 0
}
```

---

## Related Features

- [DAG Orchestration](./01-dag-orchestration.md) — What builders create
- [JSON Schema](./26-json-schema.md) — Schema validation reference
- [CLI Commands](./15-cli-commands.md) — Execute built DAGs

---

**Last Updated**: March 5, 2026 | **Version**: 1.0.0
