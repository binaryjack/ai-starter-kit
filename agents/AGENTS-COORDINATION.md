# Agent Coordination Protocol (Enhanced with Business Analyst)

**Coordinator**: @Agent:BusinessAnalyst  
**Supervisor**: @Agent:Supervisor  
**Execution Team**: Architecture → Backend → Frontend → Testing → E2E

## Overview

This document defines how specialized AI agents communicate, coordinate, and hand off work during feature implementation. The Business Analyst orchestrates the entire workflow, breaking down specs into actionable features and assigning them to the optimal agent sequence with supervisor quality gates at each checkpoint.

## Operational Workflow

```
PRODUCT SPEC (OWNER)
        ↓
@Agent:BusinessAnalyst (BREAKS DOWN SPEC)
        ↓
Creates: Feature roadmap, dependencies, agent assignments
        ↓
For each Feature:
  ├─ @Agent:Architecture ─→ @Agent:Supervisor [CHECKPOINT]
  ├─ @Agent:Backend      ─→ @Agent:Supervisor [CHECKPOINT]
  ├─ @Agent:Frontend     ─→ @Agent:Supervisor [CHECKPOINT]
  ├─ @Agent:Testing      ─→ @Agent:Supervisor [CHECKPOINT]
  └─ @Agent:E2E         ─→ @Agent:Supervisor [CHECKPOINT] ✓ COMPLETE
```

## Core Principles

- **BA-Driven Coordination**: Business Analyst breaks down specs, assigns features, sequences agents
- **Sequential Execution**: Agents work in defined order (Architecture → Backend → Frontend → Testing → E2E)
- **Supervisor Checkpoints**: EVERY agent handoff requires supervisor approval before next agent starts
- **Explicit Handoffs**: Each agent declares readiness and context for next agent
- **Context Preservation**: Output from one agent becomes input for the next
- **Blocking Issues**: Any blocker escalates: Agent → BA → Supervisor → Resolution
- **Status Tracking**: BA tracks completion across all agents, all phases

## Agent Roles & Responsibilities

### 0. Business Analyst Agent (NEW - ORCHESTRATOR)

**Responsibility**: Break down specs, identify dependencies, assign agents, coordinate workflow, track progress

**Authority**:

- Analyzes product specifications
- Creates implementation roadmaps
- Assigns features to agents
- Sequences agent work
- Escalates blockers to Supervisor
- Tracks progress across all phases

**Inputs**:

- product.specs.master.md (specifications)
- IMPLEMENTATION_PLAN.md (roadmap reference)
- Agent capabilities (from agent docs)

**Outputs**:

- Feature breakdown with priorities
- Agent assignments per feature
- Dependency matrix
- Timeline estimates
- Progress tracking

**Communication Pattern**:

```
@Agent:Architecture
@Agent:Backend
@Agent:Frontend
@Agent:Testing
@Agent:E2E

FEATURE: [FeatureName]
PHASE: [Phase X]
PRIORITY: [High/Medium/Low]
DEPENDENCIES: [List required features]
BLOCKING: [What this blocks]

AGENT SEQUENCE:
1. Architecture [Days X-Y]
2. Backend [Days Z-W] (depends on Architecture)
3. Frontend [Days A-B] (depends on Backend)
4. Testing [Days C-D] (depends on Frontend+Backend)
5. E2E [Days E-F] (depends on full stack)

DETAILED REQUIREMENTS: [See IMPLEMENTATION_PLAN.md]

Supervisor checkpoints at each handoff.

---
@Agent:BusinessAnalyst (ORCHESTRATOR)
```

**Success Criteria**:

- ✅ All features mapped with clear dependencies
- ✅ No feature blocked due to missing prerequisites
- ✅ All agents have explicit requirements
- ✅ Supervisor checkpoints prevent defects early
- ✅ Issues escalated appropriately
- ✅ Implementation stays on schedule

**Blocks**: None (orchestrator, not executor)
**Blocked by**: None (first in pipeline after user request)

---

### 1. Architecture Agent

**Responsibility**: Define structure, enforce isolation, validate design

**Deliverables**:

- Feature slice directory structure
- Public API (index.ts) exports
- Import boundaries & no cross-slice rules
- Type definitions & interfaces
- Constants & configuration

**Output Format**:

```
## Architecture Deliverable: [FeatureName]

Location: `src/features/[feature]/`

Structure:
├── ui/
├── model/
├── api/
├── store/
├── lib/
├── config/
├── [feature].tsx
└── index.ts

Public API Exports: [list all exports from index.ts]

Type Definitions: [reference to .types.ts]

Dependencies:
- Entities: [list]
- Shared: [list]

⚠️ Rules:
- NO imports from other features (except via index.ts)
- All types exported from model/
- Hooks exported from lib/

Ready for Backend Agent? YES/NO [reason if NO]
```

**Blocks**: All other agents (Architecture first)
**Blocked by**: None

---

### 2. Backend Agent

**Responsibility**: Implement API layer, business logic, data access

**Prerequisites**: Architecture Agent completed

**Deliverables**:

- FastAPI routes (CRUD endpoints)
- Pydantic models & validation
- Service layer (business logic)
- Repository layer (data access)
- Error handling & logging
- Type hints on ALL functions

**Output Format**:

````
## Backend Deliverable: [FeatureName]

API Endpoints:
- GET /api/[entities]
- GET /api/[entities]/{id}
- POST /api/[entities]
- PUT /api/[entities]/{id}
- DELETE /api/[entities]/{id}

Request/Response Types:
```typescript
// Request
{
  title: string
  // ... fields
}

// Response (200)
{
  status: "success"
  data: { id, title, ... }
}

// Error (4xx/5xx)
{
  status: "error"
  code: "ERROR_CODE"
  message: "User readable message"
  details: {...}
}
````

Routes Implementation:

- File: `backend/app/routes/[entity].py`
- Service: `backend/app/services/[entity]_service.py`
- Repository: `backend/app/repositories/[entity]_repository.py`

Error Codes:

- 400: [validation errors]
- 404: [not found]
- 500: [server errors]

Dependencies:

- Models: [Pydantic models used]
- Validators: [custom validators]

Ready for Frontend Agent? YES/NO [reason if NO]

```

**Blocks**: Frontend Agent, Testing Agent
**Blocked by**: Architecture Agent

---

### 3. Frontend Agent
**Responsibility**: Build React UI, Redux state management, hooks

**Prerequisites**: Architecture + Backend agents completed

**Deliverables**:
- UI Components (form, list, detail, card)
- Redux slice & state shape
- Redux saga (API integration)
- Custom hooks
- Type-safe API integration
- Error boundaries & loading states

**Output Format**:
```

## Frontend Deliverable: [FeatureName]

Components:

- [feature]-form.tsx: Form for create/update
- [feature]-list.tsx: List display with search/filter
- [feature]-detail.tsx: Detail view
- [feature]-card.tsx: Reusable card component

Redux State Shape:

```typescript
{
  [feature]: {
    items: [...],
    selectedId: number | null,
    loading: boolean,
    error: string | null
  }
}
```

Selectors:

- selectExperienceList: () => []
- selectExperienceById: (id) => {}
- selectExperienceLoading: () => boolean
- selectExperienceError: () => string | null

Custom Hooks:

- use[Feature]: Main hook for feature
- use[Feature]Form: Form handling hook

Redux Integration:

- Slice: `store/slice/[feature].slice.ts`
- Saga: `store/saga/[feature].saga.ts`

Error Handling:

- Error boundaries: [yes/no]
- Loading states: [yes/no]
- User feedback: [error messages implemented]

Type Safety:

- All types from Backend API
- Redux types correctly typed
- NO any types

Ready for Testing Agent? YES/NO [reason if NO]

```

**Blocks**: Testing Agent, E2E Agent
**Blocked by**: Architecture Agent + Backend Agent

---

### 4. Testing Agent
**Responsibility**: Unit & integration tests, high coverage, behavior testing

**Prerequisites**: Frontend + Backend agents completed

**Deliverables**:
- Unit tests for all utilities, selectors, reducers
- Component tests (React Testing Library)
- Service tests (pytest)
- Integration tests (Redux + API)
- Mock strategies & fixtures
- >80% code coverage

**Output Format**:
```

## Testing Deliverable: [FeatureName]

Frontend Tests:

- Selectors: `model/selectors.test.ts` (100% coverage)
- Reducers: `store/slice/[feature].slice.test.ts` (100%)
- Components: `ui/*.test.tsx` (>80% coverage)
- Hooks: `lib/hooks.test.ts` (>80% coverage)
- Sagas: `store/saga/[feature].saga.test.ts` (>80%)
- Integration: `[feature].test.tsx` (>80%)

Backend Tests:

- Routes: `tests/test_[entity]_api.py` (>80%)
- Services: `tests/test_[entity]_service.py` (>90%)
- Repositories: `tests/test_[entity]_repository.py` (>80%)

Coverage Report:

- Frontend: XX% (lines XX/XX)
- Backend: XX% (lines XX/XX)
- Target met: YES/NO

Test Patterns:

- Fixtures: [list shared fixtures]
- Mocks: [list mocked dependencies]
- Edge cases: [covered scenarios]

Running Tests:
frontend: npm run test:features
backend: pytest tests/

Ready for E2E Agent? YES/NO [reason if NO]

```

**Blocks**: E2E Agent
**Blocked by**: Frontend Agent + Backend Agent

---

### 5. E2E Testing Agent
**Responsibility**: User workflow testing, cross-browser, accessibility

**Prerequisites**: All other agents completed

**Deliverables**:
- Page Object Models
- CRUD workflow tests
- Search/filter tests
- Validation error tests
- Error handling tests
- Cross-browser tests (Chromium, Firefox, WebKit)

**Output Format**:
```

## E2E Deliverable: [FeatureName]

Test Suites:

- Workflows: `e2e/tests/[feature]-crud.spec.ts`
- Search/Filter: `e2e/tests/[feature]-search.spec.ts`
- Validation: `e2e/tests/[feature]-validation.spec.ts`
- Error Handling: `e2e/tests/[feature]-errors.spec.ts`

Page Objects:

- File: `e2e/pages/[feature].page.ts`
- Selectors: All use accessible attributes (getByRole, getByLabel)
- Methods: List main actions

Test Cases:

- Create: [flows tested]
- Read: [flows tested]
- Update: [flows tested]
- Delete: [flows tested]
- Search: [flows tested]
- Error scenarios: [covered]

Browser Coverage:

- Chromium: ✓
- Firefox: ✓
- WebKit: ✓
- Mobile: [optional]

Running Tests:
npx playwright test e2e/tests/[feature]-\*.spec.ts

All Tests Passing: YES/NO

```

**Blocks**: Feature complete
**Blocked by**: All agents (last in pipeline)

---

## Feature Implementation Workflow (BA-Coordinated)

### Step 0: Business Analyst Analyzes Specs

**Invoke**: Business Analyst

```

@Agent:BusinessAnalyst

Analyze product specification and create implementation breakdown

Input: product.specs.master.md

Tasks:

1. Break down all 14 features into phases
2. Identify dependencies (what blocks what)
3. Assign agents per feature
4. Estimate timeline for each feature
5. Create priority matrix
6. Identify parallelization opportunities
7. Create master implementation roadmap

Output:

- IMPLEMENTATION_PLAN.md (master roadmap)
- Feature breakdown (each feature with agent sequence)
- Dependency matrix
- Timeline estimates
- Progress tracking mechanism

Ready to dispatch features to agents? YES/NO

```

**BA Output**:
- IMPLEMENTATION_PLAN.md (detailed roadmap)
- FEATURE_BREAKDOWN_WORKFLOW.md (per-feature details)
- Agent assignments with sequencing
- Supervisor checkpoint requirements

---

### Step 1: Request Feature Implementation (BA Dispatch)

**BA creates and issues**:

```

@Agent:Architecture
@Agent:Backend
@Agent:Frontend
@Agent:Testing
@Agent:E2E

FEATURE IMPLEMENTATION REQUEST

FEATURE: [FeatureName]
PHASE: [Phase X]
PRIORITY: [High/Medium/Low]
COMPLEXITY: [Simple/Medium/High]
BLOCKING: [Yes - blocks X, Y, Z / No]
DEPENDENCIES:

- Feature: [required feature] (status: complete/in-progress/blocked)
- Entity: [required entity]
- Component: [required component]

IMPLEMENTATION SEQUENCE:

1. @Agent:Architecture
   - Task: Define types, folder structure, public API
   - Timeline: X days
   - Depends on: [list]
   - Blocks: Backend Agent start
2. @Agent:Backend
   - Task: Implement API, models, service layer
   - Timeline: Y days
   - Depends on: Architecture complete
   - Blocks: Frontend Agent start
3. @Agent:Frontend
   - Task: Implement UI, Redux state, hooks
   - Timeline: Z days
   - Depends on: Backend API complete
   - Blocks: Testing Agent start
4. @Agent:Testing
   - Task: Write tests >80% coverage
   - Timeline: W days
   - Depends on: Backend + Frontend code
   - Blocks: E2E Agent start
5. @Agent:E2E
   - Task: Write E2E workflows
   - Timeline: V days
   - Depends on: Full stack working + tests passing
   - Blocks: None (end of pipeline)

SUPERVISOR CHECKPOINTS:

- After Architecture: Type validation (NO any types)
- After Backend: API validation (working endpoints)
- After Frontend: UI validation (components working)
- After Testing: Coverage validation (>80%)
- After E2E: Workflow validation (all browsers passing)

DETAILED SPECIFICATIONS:
[Reference to IMPLEMENTATION_PLAN.md section X.Y]

---

@Agent:BusinessAnalyst DISPATCHING FEATURE TO ARCHITECTURE AGENT

```

---

### Step 2: Architecture Phase

**Invoke**: Architecture Agent

```

@Agent:Architecture

Implement Feature-Sliced Design for [FeatureName]

[Detailed specifications from BA dispatch]

Provide:

1. Directory structure
2. Type definitions (types.ts)
3. Public API (index.ts)
4. Import rules
5. Readiness for Backend

Output format: See "Architecture Deliverable" section above

---

READY FOR NEXT AGENT? [Architecture signals to Supervisor]

```

**Architecture delivers**: Architecture Deliverable document

**Supervisor reviews** (Checkpoint 1):
```

@Agent:Supervisor

FEATURE: [FeatureName]
STAGE: Architecture Complete
CURRENT AGENT: @Agent:Architecture
NEXT AGENT: @Agent:Backend

REVIEW CHECKLIST:
✓ All types properly defined (NO any types)
✓ Public API exports complete
✓ FSD structure correct
✓ Import boundaries enforced
✓ No placeholder types
✓ Dependencies documented

DECISION:

- APPROVE: [Invoke Backend Agent]
- REQUEST FIXES: [Return to Architecture Agent with specifics]
- ESCALATE: [Report blocker to BA]

---

@Agent:Supervisor

```

**If APPROVED**: Supervisor invokes Backend Agent
**If REQUEST FIXES**: Supervisor returns to Architecture Agent
**If ESCALATE**: Supervisor reports to BA for dependency/sequence adjustment

---

### Step 3: Backend Phase

**Invoke**: Backend Agent (after Supervisor approval)

```

@Agent:Backend

Implement API for [FeatureName]

Prerequisites:

- Architecture Deliverable: [link from previous step]
- [Import Architecture types, public API, structure]

[Detailed specifications from BA dispatch]

Provide:

1. FastAPI routes implementation
2. Pydantic models & validation
3. Service & repository layers
4. Error handling & logging
5. Type hints on ALL functions
6. API documentation
7. Readiness for Frontend

Output format: See "Backend Deliverable" section

---

READY FOR NEXT AGENT? [Backend signals to Supervisor]

```

**Backend delivers**: Backend Deliverable document

**Supervisor reviews** (Checkpoint 2):
```

@Agent:Supervisor

FEATURE: [FeatureName]
STAGE: Backend Complete
CURRENT AGENT: @Agent:Backend
NEXT AGENT: @Agent:Frontend

REVIEW CHECKLIST:
✓ All endpoints implemented (CRUD)
✓ Type hints on ALL functions
✓ Error handling complete
✓ Validation rules implemented
✓ No stub implementations
✓ No any types in signatures

DECISION:

- APPROVE: [Invoke Frontend Agent]
- REQUEST FIXES: [Return to Backend Agent with specifics]
- ESCALATE: [Report blocker to BA]

---

@Agent:Supervisor

```

---

### Step 4: Frontend Phase

**Invoke**: Frontend Agent (after Supervisor approval)

```

@Agent:Frontend

Implement UI for [FeatureName]

Prerequisites:

- Architecture Deliverable: [link]
- Backend Deliverable: [link]
- [Import API contracts, types from both]

[Detailed specifications from BA dispatch]

Provide:

1. React components (form, list, detail, card)
2. Redux slice with state shape
3. Redux saga (API integration)
4. Custom hooks
5. Error boundaries & loading states
6. Readiness for Testing

Output format: See "Frontend Deliverable" section

---

READY FOR NEXT AGENT? [Frontend signals to Supervisor]

```

**Frontend delivers**: Frontend Deliverable document

**Supervisor reviews** (Checkpoint 3):
```

@Agent:Supervisor

FEATURE: [FeatureName]
STAGE: Frontend Complete
CURRENT AGENT: @Agent:Frontend
NEXT AGENT: @Agent:Testing

REVIEW CHECKLIST:
✓ All components implemented
✓ Redux integration working
✓ No any types in code
✓ Error boundaries present
✓ Loading states present
✓ Type-safe API integration

DECISION:

- APPROVE: [Invoke Testing Agent]
- REQUEST FIXES: [Return to Frontend Agent]
- ESCALATE: [Report blocker to BA]

---

@Agent:Supervisor

```

---

### Step 5: Testing Phase

**Invoke**: Testing Agent (after Supervisor approval)

```

@Agent:Testing

Implement tests for [FeatureName]

Prerequisites:

- Architecture Deliverable: [link]
- Backend Deliverable: [link]
- Frontend Deliverable: [link]

[Detailed specifications from BA dispatch]

Provide:

1. Unit tests (selectors, reducers, services)
2. Component tests (React Testing Library)
3. Integration tests (Redux + API)
4. Backend tests (pytest)
5. Coverage report (>80%)
6. Readiness for E2E

Output format: See "Testing Deliverable" section

---

READY FOR NEXT AGENT? [Testing signals to Supervisor]

```

**Testing delivers**: Testing Deliverable document

**Supervisor reviews** (Checkpoint 4):
```

@Agent:Supervisor

FEATURE: [FeatureName]
STAGE: Testing Complete
CURRENT AGENT: @Agent:Testing
NEXT AGENT: @Agent:E2E

REVIEW CHECKLIST:
✓ Frontend coverage >80%
✓ Backend coverage >80%
✓ All tests passing
✓ Edge cases covered
✓ Mocks properly configured
✓ No flaky tests

DECISION:

- APPROVE: [Invoke E2E Agent]
- REQUEST FIXES: [Return to Testing Agent]
- ESCALATE: [Report blocker to BA]

---

@Agent:Supervisor

```

---

### Step 6: E2E Testing Phase

**Invoke**: E2E Agent (after Supervisor approval)

```

@Agent:E2E

Implement end-to-end tests for [FeatureName]

Prerequisites:

- All previous deliverables complete
- Full stack working
- Tests passing (>80% coverage)

[Detailed specifications from BA dispatch]

Provide:

1. Page Object Models
2. CRUD workflow tests
3. Search/filter tests
4. Validation error tests
5. Cross-browser tests (Chromium, Firefox, WebKit)
6. All tests passing

Output format: See "E2E Deliverable" section

---

READY FOR PRODUCTION? [E2E signals to Supervisor]

```

**E2E delivers**: E2E Deliverable document

**Supervisor reviews** (Checkpoint 5):

```

@Agent:Supervisor

FEATURE: [FeatureName]
STAGE: E2E Complete
CURRENT: @Agent:E2E
STATUS: Feature Ready

REVIEW CHECKLIST:
✓ All CRUD workflows passing
✓ Search/filter tested
✓ Validation tested
✓ Error scenarios tested
✓ Chromium passing
✓ Firefox passing
✓ WebKit passing
✓ No flaky tests

DECISION:

- APPROVE & MERGE: [Feature production ready]
- REQUEST FIXES: [Return to E2E Agent]
- ESCALATE: [Critical blocker]

---

@Agent:Supervisor

FEATURE: [FeatureName] STATUS: ✅ COMPLETE & PRODUCTION READY

```

---

### Step 7: Progress Tracking (BA Responsibility)

**BA maintains ongoing status**:

```

PHASE X PROGRESS REPORT:

FEATURES IN PROGRESS:
┌─────────────────────────────────┐
│ Feature 1: [Name] │
├─────────────────────────────────┤
│ Architecture: ✓ Complete │
│ Backend: 🔄 In Progress (Day 2/3)│
│ Frontend: ⏳ Queued │
│ Testing: ⏳ Queued │
│ E2E: ⏳ Queued │
└─────────────────────────────────┘

BLOCKERS:

- None

NEXT MILESTONE:

- Feature 1 → Frontend (expected Day 3)
- Feature 2 → Architecture (ready to start)

---

@Agent:BusinessAnalyst (PROGRESS COORDINATOR)

```

---

## Escalation Path (BA-Coordinated)

```

AGENT ENCOUNTERS ISSUE
↓
Agent: "I cannot proceed because [reason]"
↓
Agent → @Agent:BusinessAnalyst (reports blocker)
↓
BA analyzes:
├─ Is this a dependency issue?
│ └─ YES: Adjust sequencing, notify agents
│
├─ Is this an agent capability issue?
│ └─ YES: Escalate to Supervisor for re-invoke decision
│
└─ Is this a requirement clarity issue?
└─ YES: BA clarifies with user (OWNER) or supervisor

        ↓

IF dependency: BA adjusts timeline, retries with cleared blockers
IF capability: Supervisor decides re-invoke or escalate to user
IF clarity: BA clarifies + agent retries

        ↓

RESULT: Blocker resolved or escalated to user

````

---

## Supervisor Integration (Enhanced)

**Supervisor's role in BA-coordinated workflow**:

1. **Quality Gate at Each Agent Transition**:
   - Reviews current agent deliverable against checklist
   - Approves or rejects based on quality standards
   - Rejects if: NO any types, NO stubs, NO TODOs, error handling complete

2. **Invoke Next Agent or Return Current**:
   - If approved: Supervisor invokes next agent with full context
   - If rejected: Supervisor returns to current agent with specifics

3. **Escalation to BA**:
   - If blocker is dependency-related: Supervisor escalates to BA
   - BA adjusts sequencing and resolves

4. **Integration with BA Progress Tracking**:
   - BA knows which agent is current (from supervisor notifications)
   - BA tracks all checkpoint approvals
   - BA identifies parallelization opportunities

---



## Feature Status Tracking Template

```markdown
# Feature: [FeatureName]

## Implementation Status

| Agent | Status | Deliverable | Notes |
|-------|--------|-------------|-------|
| Architecture | [ ] | [Link if done] | |
| Backend | [ ] | [Link if done] | |
| Frontend | [ ] | [Link if done] | |
| Testing | [ ] | [Link if done] | |
| E2E | [ ] | [Link if done] | |

## Blocking Issues

- None yet

## Next Agent

Architecture Agent (ready to start)

## Context for Next Agent

[Summary of current state for next agent to consume]
````

---

## Handoff Checklist

Each agent must verify before handing off to next:

### Architecture Agent

- [ ] Directory structure created
- [ ] Type definitions complete
- [ ] Public API exports defined
- [ ] Import rules documented
- [ ] Ready for Backend

### Backend Agent

- [ ] All CRUD endpoints implemented
- [ ] Pydantic models with validation
- [ ] Service & repository layers
- [ ] Type hints on ALL functions
- [ ] Error handling consistent
- [ ] All tests pass
- [ ] Ready for Frontend

### Frontend Agent

- [ ] All components implemented
- [ ] Redux state shape defined
- [ ] Sagas handle API calls
- [ ] Custom hooks working
- [ ] Type-safe API integration
- [ ] Error boundaries present
- [ ] Loading states present
- [ ] All tests pass
- [ ] Ready for Testing

### Testing Agent

- [ ] Frontend coverage >80%
- [ ] Backend coverage >80%
- [ ] All edge cases tested
- [ ] Mocks properly configured
- [ ] Fixtures reusable
- [ ] All tests pass
- [ ] Ready for E2E

### E2E Agent

- [ ] Page Objects created
- [ ] CRUD workflows passing
- [ ] Search/filter tested
- [ ] Validation tested
- [ ] Error scenarios tested
- [ ] Chromium passing
- [ ] Firefox passing
- [ ] WebKit passing
- [ ] Feature ready for production

---

## Communication Example

### Feature Request

```
Build Experience CRUD feature

User Story:
- As a user, I want to manage my professional experiences
- I can create, read, update, delete experiences
- I can search experiences by title or company
- I can filter by date range

Fields:
- id (auto-generated)
- title (required, string)
- company (required, string)
- description (optional, text)
- startDate (required, date)
- endDate (optional, date)
- skills (array of strings)

Workflows:
1. View all experiences (list page)
2. Create new experience (form page)
3. Edit experience (form page)
4. Delete experience (confirmation)
5. Search by title/company (list page)
6. Filter by date range (list page)

Agents: ALL (Architecture → Backend → Frontend → Testing → E2E)
```

### Architecture Delivers

```
## Architecture Deliverable: Experience

Location: src/features/experience/

Structure created with:
- Types: experience.types.ts
- Selectors: selectors.ts
- API layer placeholder: api/
- Redux store structure
- Public exports in index.ts

Ready for Backend: YES
```

### Backend Delivers

```
## Backend Deliverable: Experience

Endpoints:
- GET /api/experiences
- GET /api/experiences/{id}
- POST /api/experiences
- PUT /api/experiences/{id}
- DELETE /api/experiences/{id}

Request/Response types defined
Validation rules implemented
Service layer: ExperienceService
Repository layer: ExperienceRepository

Ready for Frontend: YES
```

### Frontend Delivers

```
## Frontend Deliverable: Experience

Components:
- ExperienceForm (create/update)
- ExperienceList (display with search)
- ExperienceDetail (single view)
- ExperienceCard (reusable card)

Redux:
- State shape: { items, selectedId, loading, error }
- Saga: fetchExperiencesSaga
- Selectors: selectExperienceList, selectExperienceById, etc.
- Hooks: useExperience, useExperienceForm

Ready for Testing: YES
```

### Testing Delivers

```
## Testing Deliverable: Experience

Coverage:
- Frontend: 85% (components, selectors, hooks)
- Backend: 92% (routes, services, repositories)

Test files:
- Selectors: 100%
- Components: 82%
- Services: 95%
- Routes: 87%

All tests passing: YES

Ready for E2E: YES
```

### E2E Delivers

```
## E2E Deliverable: Experience

Test suites:
- CRUD: Create, Read, Update, Delete workflows
- Search: Search by title, company
- Filter: Date range filtering
- Validation: Form validation errors
- Errors: Network errors, server errors

Browsers: All passing (Chromium, Firefox, WebKit)

Ready for Production: YES ✓
```

---

## Agent Invocation Commands

Use these exact patterns when requesting agent work:

### Start Feature (All Agents)

```
Build [FeatureName] feature

[Feature specification with user stories, fields, workflows]

@Agent:Architecture
@Agent:Backend
@Agent:Frontend
@Agent:Testing
@Agent:E2E

Sequence: Architecture → Backend → Frontend → Testing → E2E
```

### Single Agent Invocation

```
@Agent:Frontend

Continue from Backend Deliverable (see link)

[Frontend-specific requirements]
```

### With Dependencies

```
@Agent:Testing

Depends on:
- Backend: [link to Backend Deliverable]
- Frontend: [link to Frontend Deliverable]

[Testing requirements]
```

---

## Debugging & Blockers

### When an Agent Encounters Issues

1. **Document the issue** in Deliverable format
2. **Mark status**: BLOCKED
3. **Explain**: Why it's blocked
4. **Link**: To the blocking issue
5. **Request**: Human intervention or previous agent fix

**Example**:

```
## Backend Deliverable: Experience

Status: BLOCKED ❌

Blocking Issue:
- Architecture Deliverable missing repository interface
- Cannot implement ExperienceRepository without interface contract

Resolution Needed:
- @Agent:Architecture: Update model/ with repository interface definition
- Then retry Backend implementation
```

### Re-invoking After Fix

```
@Agent:Backend

Previous attempt: [link to previous Deliverable]

Issue fixed:
- Architecture now provides repository interface

Resume implementation
```

---

## Best Practices

✅ **DO**

- Follow the workflow order strictly
- Provide full context when handing off
- Document issues clearly
- Use exact Deliverable format
- Link to previous deliverables
- Mark blocking issues immediately
- Request human intervention if stuck

❌ **DON'T**

- Skip phases to save time
- Assume previous work is complete
- Hand off incomplete code
- Mix multiple agents' work in one request
- Create new files without approval
- Ignore type safety for speed
- Skip test coverage requirements

---

**Agent Coordination: Disciplined. Sequential. Complete.**
