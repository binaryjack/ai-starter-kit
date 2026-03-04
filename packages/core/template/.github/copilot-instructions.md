# Copilot Instructions

Custom instructions for AI assistants (Copilot, Claude, etc.) when working on this project.

## Project Overview
- **Name**: Your Project Name
- **Description**: Brief description of what the project does
- **Tech Stack**: List key technologies (React, Node.js, PostgreSQL, etc.)

## Code Style Guidelines
- Use TypeScript for type safety
- Follow the rules defined in `src/.ai/rules.md`
- Implement patterns from `src/.ai/patterns.md`
- Refer to architecture rules in `.github/ai/architecture-rules.xml`

## When Writing Code
1. Always add type annotations
2. Include error handling with meaningful messages
3. Write unit tests for business logic
4. Add JSDoc comments for public functions
5. Keep functions focused and under 30 lines when possible

## File Structure
```
src/
├── components/   # UI components
├── services/     # Business logic and API calls
├── utils/        # Helper functions
├── types/        # TypeScript type definitions
└── tests/        # Test files
```

## Common Tasks
- **Adding a feature**: Create component → Add service → Add tests → Update types
- **Fixing a bug**: Write failing test → Fix code → Ensure test passes
- **Refactoring**: Run tests → Make changes → Verify tests pass

## Resources
- Architecture docs: See `.github/ai/architecture-rules.xml`
- Setup instructions: See `src/.ai/bootstrap.md`
- Design patterns: See `src/.ai/patterns.md`
