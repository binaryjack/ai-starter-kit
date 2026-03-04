# Quick Start: MCP Server for Claude

Get your project's ULTRA_HIGH standards working in Claude with one simple setup.

## 1️⃣ Install MCP Server

```bash
npm install @ai-agencee/ai-kit-mcp
```

Or ensure it's in your project dependencies.

## 2️⃣ Configure Claude Desktop

### macOS/Linux
Edit `~/.config/Claude/claude_desktop_config.json`:

### Windows  
Edit `%APPDATA%\Claude\claude_desktop_config.json`:

Add this to the config:

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

**Full example:**
```json
{
  "mcpServers": {
    "ai-kit": {
      "command": "npx",
      "args": ["@ai-agencee/ai-kit-mcp"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/your/allowed/path"]
    }
  }
}
```

## 3️⃣ Restart Claude

Completely close and reopen Claude Desktop. You should see "ai-kit" in the MCP connections (⚙️ icon, bottom right).

## 4️⃣ Start Using

In any Claude conversation, use these commands:

```
@init       → Initialize with ULTRA_HIGH standards
@check      → Validate your project structure  
@rules      → View your coding standards
@patterns   → View design patterns
@bootstrap  → View setup guide
```

## 📋 Example Usage

### Initialize & Ask for Help

```
@init
@rules

I need to create a new TypeScript component. 
What naming conventions and export patterns should I follow?
```

**Claude will respond based on YOUR project's rules, not generic advice!**

### Check Your Project

```
@check

Are there any issues with my project structure?
```

### Get Design Guidance

```
@patterns

Show me the recommended architecture for a data service.
```

## 🎯 What Happens

1. **You send** `@init` → Claude loads your project's TADEO/ULTRA_HIGH standards
2. **Server checks** → Reads from `.github/copilot-instructions.md`, `src/.ai/rules.md`, etc.
3. **Claude knows** → Your specific naming rules, forbidden patterns, testing requirements
4. **Better responses** → All code suggestions follow YOUR standards, not generic ones

## 📁 Required Files

The MCP server looks for these files. Create them with:

```bash
npx @ai-agencee/ai-kit-cli init --strict
```

This generates:
- `.github/copilot-instructions.md` - AI session setup
- `src/.ai/rules.md` - Your coding standards
- `src/.ai/patterns.md` - Architecture patterns  
- `.github/ai/manifest.xml` - Project manifest

If files are missing, you'll get helpful error messages.

## 🔧 Troubleshooting

| Problem | Fix |
|---------|-----|
| Claude doesn't show ai-kit in connections | Restart Claude completely |
| "File not found" errors | Run `npx @ai-agencee/ai-kit-cli init --strict` first |
| "Cannot find module" | Do `npm install @ai-agencee/ai-kit-mcp` in your project |
| Server won't start | Ensure Node.js 18+: `node --version` |

## 💡 Pro Tips

1. **Fresh Sessions**: Every new conversation loads your rules fresh - no context pollution
2. **BRUTAL Mode**: Server enforces strict standards, no shortcuts
3. **Local First**: Everything runs locally, your rules stay private
4. **Always Updated**: Reads files from disk every time, catches latest changes

## 🚀 What You Get

### TADEO/ULTRA_HIGH Standards Enforced

- ✅ **Naming**: `kebab-case` only (no camelCase)
- ✅ **Exports**: One item per file
- ✅ **Types**: No `any` types allowed  
- ✅ **Functions**: Proper export patterns
- ✅ **Classes**: Forbidden by default
- ✅ **Testing**: 95% coverage required
- ✅ **Performance**: ≤10% overhead limits

### Example Response

```
User: @init @rules - Should I use classes?

Claude: Based on your project rules (ULTRA_HIGH standards):

❌ Classes are FORBIDDEN
✅ Use functions instead:

export const userService = function() {
  // implementation
};

export const validateInput = function(input: string): boolean {
  // validation logic
};
```

## 📚 Learn More

- [MCP Server Documentation](./packages/mcp/README.md)
- [ULTRA_HIGH Standards](./template/src/.ai/rules.md)
- [@ai-agencee/ai-kit-cli Docs](./packages/cli/README.md)

## ⚡ One-Liner Setup

```bash
npm install @ai-agencee/ai-kit-mcp && echo '{
  "mcpServers": {
    "ai-kit": {
      "command": "npx",
      "args": ["@ai-agencee/ai-kit-mcp"]
    }
  }
}' > ~/.config/Claude/claude_desktop_config.json && npx @ai-agencee/ai-kit-cli init --strict
```

Then restart Claude and type `@init` to test!

---

**Questions?** Check the [full MCP documentation](./packages/mcp/README.md) or the [CLI docs](./packages/cli/README.md).
