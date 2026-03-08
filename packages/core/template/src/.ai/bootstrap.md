# Bootstrap Guide - ULTRA_HIGH Standards

## Quick Start (Strict Mode)

This project uses ULTRA_HIGH standards. Follow these steps:

### 1. Load Rules
```bash
# Rules are defined in:
# - .github/ai/architecture-rules.xml
# - src/.ai/rules.md
# - src/.ai/patterns.md
```

### 2. Enable STRICT_MODE
```
STRICT_MODE=1
IGNORE_HISTORY=1
NO_CHAT=1
```

### 3. Setup

```bash
# Clone and install
git clone <repo>
cd <project>
npm install

# Verify setup
npm run check  # tsc + eslint + jest
```

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
```

## Code Standards

### Naming
- Files: `kebab-case`
- No camelCase allowed

### Structure
- One item per file
- Clear separation of concerns
- Type definitions in `*.types.ts`

### Type Safety
- No `any` types
- Strict null checks
- Explicit union handling

### Functions
```typescript
// REQUIRED format
export const feature-name = function(params) {
  // implementation
}
```

### Classes

❌ **FORBIDDEN** - Use functions instead

## Testing

```bash
# Minimum 95% coverage required
npm test -- --coverage
```

## Pre-Commit Checks

```bash
# Run all checks
npm run check

# Individual checks
npm run type-check   # tsc
npm run lint         # eslint
npm test            # jest
```

## Pipeline

1. **SCAN** - Scan types/ directory
2. **AST_CHECK** - Check core/ AST
3. **BUILD** - Compile project
4. **VALIDATE** - Validate output
5. **OUTPUT** - Generate artifacts

## Forbidden Patterns

❌ `useImperativeHandle`
❌ `class` keyword
❌ ` any ` type
❌ `camelCase` naming
❌ Verbose code
❌ Multiple exports per file

## Performance Target

Target: **<=10% solid-js benchmark**
