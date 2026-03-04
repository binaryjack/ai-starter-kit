import { spawn } from 'child_process';

export const runMcp = async (): Promise<void> => {
  console.log('Starting AI Kit MCP Server...');
  console.log('');
  console.log('Configuration: TADEO/ULTRA_HIGH standards');
  console.log('Available tools:');
  console.log('  @init       - Initialize AI session with standards');
  console.log('  @check      - Validate project structure');
  console.log('  @rules      - View coding rules and standards');
  console.log('  @patterns   - View design patterns');
  console.log('  @bootstrap  - View setup instructions');
  console.log('');
  console.log('For Claude Desktop, add to ~/.config/Claude/claude_desktop_config.json:');
  console.log(JSON.stringify({
    mcpServers: {
      'ai-kit': {
        command: 'npx',
        args: ['@ai-agencee/ai-kit-mcp'],
      },
    },
  }, null, 2));
  console.log('');
  
  const server = spawn('npx', ['@ai-agencee/ai-kit-mcp'], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  server.on('error', (error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });

  server.on('exit', (code) => {
    if (code !== 0) {
      console.error(`MCP server exited with code ${code}`);
      process.exit(code);
    }
  });
};
