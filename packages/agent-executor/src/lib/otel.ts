/**
 * otel.ts — Opt-in OpenTelemetry instrumentation hooks for ai-starter-kit.
 *
 * Zero hard dependency: if `@opentelemetry/api` is not installed the module
 * silently provides no-op spans so the rest of the codebase stays clean.
 *
 * ## Opt-in
 * Set the standard OTEL env var before starting your process:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
 *
 * Or initialise programmatically by calling `initOtel()` before running DAGs.
 *
 * ## Trace hierarchy produced
 *   dag.run                      (root span, runId attribute)
 *     └─ dag.lane                (child per lane)
 *          ├─ llm.call           (child per LLM completion, model/tokens/cost attrs)
 *          └─ tool.call          (child per built-in tool invocation)
 *
 * ## Install (optional)
 *   pnpm add @opentelemetry/api @opentelemetry/sdk-node \
 *            @opentelemetry/exporter-trace-otlp-grpc
 *
 * ## Usage
 *   import { createRunTracer } from '@ai-agencee/ai-kit-agent-executor';
 *   const tracer = createRunTracer();
 *   const rootSpan = tracer.startDagRun(runId, dagName);
 *   // ... run dag ...
 *   rootSpan.end();
 */

// ─── Public span handle (wraps real or no-op span) ───────────────────────────

export interface OtelSpanHandle {
  /** Set an attribute on the span. */
  setAttribute(key: string, value: string | number | boolean): this;
  /** Record an exception event on the span. */
  recordException(err: Error): this;
  /** Set span status: 'ok' | 'error'. */
  setStatus(status: 'ok' | 'error', message?: string): this;
  /** End the span (MUST be called or the span will leak). */
  end(): void;
  /** True when a real OTEL span is backing this handle. */
  readonly active: boolean;
}

// ─── Tracer facade ───────────────────────────────────────────────────────────

export interface DagTracer {
  /** Start the root DAG span; call `.end()` once the run completes. */
  startDagRun(runId: string, dagName: string): OtelSpanHandle;
  /** Start a child lane span; call `.end()` when the lane finishes. */
  startLane(runId: string, laneId: string, parentSpan?: OtelSpanHandle): OtelSpanHandle;
  /** Start a child llm.call span; call `.end()` when the response arrives. */
  startLlmCall(laneId: string, model: string, parentSpan?: OtelSpanHandle): OtelSpanHandle;
  /** Start a child tool.call span; call `.end()` when the tool returns. */
  startToolCall(laneId: string, toolName: string, parentSpan?: OtelSpanHandle): OtelSpanHandle;
}

// ─── No-op implementation (used when @opentelemetry/api is absent) ───────────

const NO_OP_SPAN: OtelSpanHandle = {
  setAttribute:    () => NO_OP_SPAN,
  recordException: () => NO_OP_SPAN,
  setStatus:       () => NO_OP_SPAN,
  end:             () => { /* no-op */ },
  active:          false,
};

const NO_OP_TRACER: DagTracer = {
  startDagRun:  () => NO_OP_SPAN,
  startLane:    () => NO_OP_SPAN,
  startLlmCall: () => NO_OP_SPAN,
  startToolCall: () => NO_OP_SPAN,
};

// ─── Real OTEL span handle adapter ───────────────────────────────────────────

function wrapSpan(span: OtelApiSpan): OtelSpanHandle {
  const handle: OtelSpanHandle = {
    setAttribute(key, value) {
      span.setAttribute(key, value);
      return handle;
    },
    recordException(err) {
      span.recordException(err);
      return handle;
    },
    setStatus(status, message) {
      span.setStatus({
        code:    status === 'ok' ? 1 : 2,   // SpanStatusCode.OK = 1, ERROR = 2
        message: message ?? '',
      });
      return handle;
    },
    end() { span.end(); },
    active: true,
  };
  return handle;
}

// ─── Lazy OTEL API loader ─────────────────────────────────────────────────────

/**
 * Minimal subset of `@opentelemetry/api` we need.
 * Typed here so we don't require the package at build time.
 */
interface OtelApiSpan {
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(err: Error): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}

interface OtelApiTracer {
  startActiveSpan<F extends (span: OtelApiSpan) => ReturnType<F>>(
    name: string,
    fn: F,
  ): ReturnType<F>;
  startSpan(name: string, options?: { attributes?: Record<string, string | number | boolean> }): OtelApiSpan;
}

interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): OtelApiTracer;
    getActiveSpan(): OtelApiSpan | undefined;
  };
  context: {
    with<T>(ctx: unknown, fn: () => T): T;
  };
}

function tryLoadOtel(): OtelApi | null {
  try {
    // Dynamic require — no-op if not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@opentelemetry/api') as OtelApi;
  } catch {
    return null;
  }
}

// ─── Real OTEL tracer implementation ─────────────────────────────────────────

class RealDagTracer implements DagTracer {
  private readonly tracer: OtelApiTracer;

  constructor(api: OtelApi) {
    this.tracer = api.trace.getTracer('ai-kit-agent-executor', '1.0.0');
  }

  startDagRun(runId: string, dagName: string): OtelSpanHandle {
    const span = this.tracer.startSpan('dag.run', {
      attributes: {
        'ai.run.id':   runId,
        'ai.dag.name': dagName,
      },
    });
    return wrapSpan(span);
  }

  startLane(runId: string, laneId: string, _parentSpan?: OtelSpanHandle): OtelSpanHandle {
    const span = this.tracer.startSpan('dag.lane', {
      attributes: {
        'ai.run.id':  runId,
        'ai.lane.id': laneId,
      },
    });
    return wrapSpan(span);
  }

  startLlmCall(laneId: string, model: string, _parentSpan?: OtelSpanHandle): OtelSpanHandle {
    const span = this.tracer.startSpan('llm.call', {
      attributes: {
        'ai.lane.id': laneId,
        'ai.llm.model': model,
      },
    });
    return wrapSpan(span);
  }

  startToolCall(laneId: string, toolName: string, _parentSpan?: OtelSpanHandle): OtelSpanHandle {
    const span = this.tracer.startSpan('tool.call', {
      attributes: {
        'ai.lane.id':   laneId,
        'ai.tool.name': toolName,
      },
    });
    return wrapSpan(span);
  }
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Create a `DagTracer` backed by `@opentelemetry/api` if available, or a no-op
 * tracer otherwise.  Call once at application start; the instance is cheap to
 * reuse across runs.
 *
 * @example
 * ```typescript
 * const tracer = createDagTracer();
 * const root = tracer.startDagRun(runId, dag.name);
 * // ... run lanes ...
 * root.setStatus('ok').end();
 * ```
 */
export function createDagTracer(): DagTracer {
  const api = tryLoadOtel();
  if (!api) return NO_OP_TRACER;
  try {
    return new RealDagTracer(api);
  } catch {
    return NO_OP_TRACER;
  }
}

/**
 * Global singleton tracer.  Lazily created on first access.
 * Use `createDagTracer()` if you need a fresh instance (e.g. for testing).
 */
let _globalTracer: DagTracer | null = null;

export function getGlobalTracer(): DagTracer {
  if (!_globalTracer) {
    _globalTracer = createDagTracer();
  }
  return _globalTracer;
}

/** Reset the global tracer (useful in tests). */
export function resetGlobalTracer(): void {
  _globalTracer = null;
}
