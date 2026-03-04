# @ai-agencee/ai-kit-mcp

MCP (Model Context Protocol) Server for [@ai-agencee/ai-kit](https://www.npmjs.com/package/@ai-agencee/ai-kit-cli). This server enables AI assistants to automatically load and enforce your project's ULTRA_HIGH coding standards when working with your codebase.

## Features

✅ **Initialize AI Sessions** - Load TADEO/ULTRA_HIGH standards automatically  
✅ **Project Validation** - Check project structure against rules  
✅ **Standards Discovery** - Access project rules, patterns, and guidelines  
✅ **Bootstrap Resources** - Load AI session initialization config  

## Installation

```bash
npm install @ai-agencee/ai-kit-mcp
```

## Quick Start

### 1. Start the MCP Server

```bash
npx @ai-agencee/ai-kit-mcp
```

The server starts on stdio and connects to your MCP client.

### 2. Configure Your AI Assistant

For Claude or other MCP-compatible AI assistants, add this server to your configuration:

**Claude Desktop (macOS/Windows/Linux)**

Edit `~/.config/Claude/claude_desktop_config.json` (or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "ai-kit": {
      "command": "npx",
      "args": ["@ai-agencee/ai-kit-mcp"]
    }
  }
}
```

### 3. Use in AI Sessions

Once configured, use these tools in your AI assistant:

```
@init              # Initialize session with ULTRA_HIGH standards
@check             # Validate project structure
@rules             # View coding standards
@patterns          # View design patterns
@bootstrap         # Get setup instructions
```

Example prompt:

```
@init
@rules

Based on the project rules, how should I structure my TypeScript component?
```

## Tools Available

### @init

Initializes AI session with TADEO/ULTRA_HIGH standards.

**Parameters:**
- `strict` (boolean, optional): Enable STRICT_MODE. Default: `true`

**Returns:**
- Configuration summary
- Project rules loaded
- Available tools list
- Next steps

### @check

Validates current project structure against rules.

**Returns:**
- Type safety check status
- Linting results  
- Testing coverage
- Rules compliance

### @rules

Get your project's coding standards and conventions.

**Parameters:**
- `format` (string): `markdown` or `text`. Default: `markdown`

**Returns:**
- File naming conventions
- Export patterns
- Type requirements
- Testing standards
- Forbidden patterns

### @patterns

Get design patterns and architecture guidelines for your project.

**Parameters:**
- `format` (string): `markdown` or `text`. Default: `markdown`

**Returns:**
- Architecture patterns
- Best practices
- Common examples
- Anti-patterns

### @bootstrap

Get bootstrap configuration and setup instructions.

**Parameters:**
- `format` (string): `markdown`, `text`, or `config`. Default: `markdown`

**Returns:**
- Project setup guide
- Environment configuration
- Development workflow

## Resources Available

MCP Resources provide direct access to project files:

- `bootstrap://init` - AI session initialization guide
- `bootstrap://rules` - Project coding rules
- `bootstrap://patterns` - Design patterns guide
- `bootstrap://manifest` - Project manifest and capabilities

## ULTRA_HIGH Standards Reference

The MCP server enforces these TADEO/ULTRA_HIGH standards:

| Standard | Rule |
|----------|------|
| **Naming** | kebab-case (no camelCase) |
| **Files** | One export per file |
| **Types** | No `any` type allowed |
| **Functions** | `export const Name = function(...) { ... }` |
| **Classes** | FORBIDDEN |
| **Testing** | 95% minimum coverage required |
| **Performance** | ≤10% solid-js overhead |

### Configuration Flags

```
U=TADEO                 # Universe: TADEO framework
STD=ULTRA_HIGH          # Standard level
COM=BRUTAL              # Communication: Direct and honest
VERBOSITY=0             # Minimal output
POLITE=0                # Direct without pleasantries
PROSE=0                 # Code-focused, minimal narrative
HEADLESS=1              # Non-interactive mode
DELEGATE=0              # No delegating tasks
STRICT_MODE=1           # Strict type and rule checking
IGNORE_HISTORY=1        # Fresh context each session
NO_CHAT=1               # No chat mode, direct instructions
```

## Architecture

The MCP server is built on the [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/python-sdk) with:

- **Transport**: Stdio-based communication with MCP clients
- **Tools**: Four request handlers for AI assistant integration
- **Resources**: File-based resources for project documentation
- **Error Handling**: Graceful error messages and fallback behavior

## Integration Examples

### With Claude

```
👤 User: @init

🤖 Assistant: 
# AI SESSION INITIALIZED

## Configuration
U=TADEO
STD=ULTRA_HIGH
...

Ready to start development with strict standards applied!

---

👤 User: @rules

How should I name my variables?

🤖 Assistant:
All variables must use kebab-case naming:
✓ user-input
✓ api-response  
✗ userData
✗ apiResponse
```

### With Other AI Assistants

Any MCP-compatible client can use this server:
- Anthropic Claude
- OpenAI Assistants (with MCP wrapper)
- Cline/cursor
- VS Code Copilot (with MCP integration)

## Troubleshooting

### Server not starting

Ensure you have Node.js 18+ installed:

```bash
node --version  # Should be v18.0.0 or higher
```

### Cannot find project files

The server reads files from the current working directory. Make sure you're running it from your project root:

```bash
cd /path/to/project
npx @ai-agencee/ai-kit-mcp
```

### File not found errors

The server looks for these paths relative to project root:
- `.github/copilot-instructions.md`
- `src/.ai/rules.md`
- `src/.ai/patterns.md`
- `.github/ai/manifest.xml`

Create these files using [@ai-agencee/ai-kit-cli](https://www.npmjs.com/package/@ai-agencee/ai-kit-cli):

```bash
npx @ai-agencee/ai-kit-cli init --strict
```

## License

MIT - See [LICENSE](../../LICENSE) for details

## Related Packages

- [@ai-agencee/ai-kit-cli](https://www.npmjs.com/package/@ai-agencee/ai-kit-cli) - Command-line scaffolding tool
- [@ai-agencee/ai-kit-core](https://www.npmjs.com/package/@ai-agencee/ai-kit-core) - Shared utilities and templates
