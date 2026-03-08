# Project Rules - ULTRA_HIGH Standards

## Core Configuration
```
U=OWNER
STD=ULTRA_HIGH
COM=BRUTAL
VERBOSITY=0
POLITE=0
PROSE=0
HEADLESS=1
DELEGATE=0
STRICT_MODE=1
IGNORE_HISTORY=1
NO_CHAT=1
```

## Code Style
- **NAMING**: kebab-case (file names and constants)
- **FILE**: one-item-per-file (one export per file)
- **ANY**: forbidden (no `any` types)
- **UNION**: strict (no union types without explicit handling)
- **REACT**: declarative-only (no imperative patterns)
- **CLASS**: forbidden (use functions only)

## Type Definitions
```typescript
// Correct Constructor Pattern
export const Name = function(...) { ... }

// Correct Method Pattern
// Use prototype/* for methods

// Non-enumerable Properties
Object.defineProperty(this, 'x', { enumerable: false })
```

## File Naming Convention
- `*.types.ts` - Type definitions
- `feature.ts` - Constructor functions
- `create-feature.ts` - Factory functions
- `index.ts` - Exports only

## Testing & Performance
- **TEST.min_coverage**: 95% (minimum code coverage)
- **PERF.target**: <=10% solid-js (performance target)

## Required Checks
```
CHECKS=["tsc","eslint","jest"]
```

## Forbidden Patterns
❌ `useImperativeHandle`
❌ `class` keyword
❌ ` any ` type
❌ `camelCase` (use kebab-case)
❌ Verbose code
