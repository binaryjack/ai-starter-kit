import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AgentResult } from './types.js';

const execAsync = promisify(exec);

/**
 * Business Analyst Agent - Understands project structure and requirements
 */
export async function runBusinessAnalystAgent(projectRoot: string): Promise<AgentResult> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  try {
    // Read package.json
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJsonContent = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    // Check for pnpm workspace
    const workspacePath = path.join(projectRoot, 'pnpm-workspace.yaml');
    let isMonorepo = false;
    try {
      await fs.access(workspacePath);
      isMonorepo = true;
    } catch {
      // Not a monorepo
    }

    if (isMonorepo) {
      findings.push('✅ Monorepo structure detected (pnpm workspace)');
    } else {
      findings.push('📦 Single package structure');
    }

    // Check for key files
    const files = await fs.readdir(projectRoot);
    if (files.includes('tsconfig.json')) {
      findings.push('✅ TypeScript configured');
    }
    if (files.includes('.eslintrc.json') || files.includes('.eslintrc.js')) {
      findings.push('✅ ESLint configured');
    }
    if (files.includes('jest.config.js')) {
      findings.push('✅ Jest configured');
    }

    // Count packages if monorepo
    if (isMonorepo) {
      const packagesDir = path.join(projectRoot, 'packages');
      try {
        const packages = await fs.readdir(packagesDir);
        const packageDirs = (
          await Promise.all(
            packages.map(async (pkg) => {
              const stats = await fs.stat(path.join(packagesDir, pkg));
              return stats.isDirectory() ? pkg : null;
            })
          )
        ).filter(Boolean);

        findings.push(`📚 ${packageDirs.length} packages found`);
        details.packages = packageDirs;
      } catch {
        // Packages dir doesn't exist
      }
    }

    // Check main dependencies
    const deps = Object.keys(packageJsonContent.dependencies || {});
    const devDeps = Object.keys(packageJsonContent.devDependencies || {});

    findings.push(`📦 ${deps.length} production dependencies`);
    findings.push(`🔧 ${devDeps.length} dev dependencies`);

    details.mainDependencies = deps.slice(0, 10);
    details.projectName = packageJsonContent.name;
    details.version = packageJsonContent.version;

    recommendations.push('Review and audit all dependencies regularly');
    recommendations.push('Keep dev and production dependencies separate');

    return {
      agentName: 'Business Analyst',
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      agentName: 'Business Analyst',
      status: 'error',
      findings: [`❌ Error analyzing project: ${error}`],
      recommendations: [],
      details: { error: String(error) },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Architecture Agent - Reviews system design and structure
 */
export async function runArchitectureAgent(projectRoot: string): Promise<AgentResult> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  try {
    const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(await fs.readFile(tsConfigPath, 'utf-8'));

    // Check TypeScript strictness
    if (tsconfig.compilerOptions?.strict === true) {
      findings.push('✅ TypeScript strict mode enabled');
    } else {
      findings.push('⚠️  TypeScript strict mode not enabled');
      recommendations.push('Enable TypeScript strict mode for better type safety');
    }

    // Check for source organization
    const srcPath = path.join(projectRoot, 'src');
    try {
      const srcContents = await fs.readdir(srcPath);
      findings.push(`📁 Source files organized (${srcContents.length} top-level directories)`);
      details.sourceStructure = srcContents;
    } catch {
      findings.push('⚠️  No src/ directory found');
      recommendations.push('Organize source code in src/ directory');
    }

    // Check for build output
    const distPath = path.join(projectRoot, 'dist');
    try {
      await fs.access(distPath);
      findings.push('✅ Build output directory exists');
    } catch {
      findings.push('ℹ️  No dist/ directory (clean state)');
    }

    // Analyze package structure if monorepo
    const packagesPath = path.join(projectRoot, 'packages');
    try {
      const packages = await fs.readdir(packagesPath);
      let circularDepsWarning = false;

      for (const pkg of packages) {
        const pkgJsonPath = path.join(packagesPath, pkg, 'package.json');
        try {
          const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
          const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

          // Check for workspace dependencies
          const workspaceDeps = Object.keys(deps).filter((d) => d.includes('@ai-agencee'));
          if (workspaceDeps.length > 0) {
            details[`${pkg}_deps`] = workspaceDeps;
          }
        } catch {
          // Skip if package.json doesn't exist
        }
      }

      findings.push(`🏗️  Package isolation: ${packages.length} packages analyzed`);
    } catch {
      // Not a monorepo
    }

    recommendations.push('Document architecture decisions in ADRs (Architecture Decision Records)');
    recommendations.push('Regularly review package dependencies for circular imports');

    return {
      agentName: 'Architecture Agent',
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      agentName: 'Architecture Agent',
      status: 'error',
      findings: [`❌ Error analyzing architecture: ${error}`],
      recommendations: [],
      details: { error: String(error) },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Backend Agent - Analyzes server-side code patterns
 */
export async function runBackendAgent(projectRoot: string): Promise<AgentResult> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  try {
    const srcPath = path.join(projectRoot, 'src');
    const files = (await fs.readdir(srcPath, { recursive: true })).filter(
      (f) => typeof f === 'string' && f.endsWith('.ts')
    ) as string[];

    const backendFiles = files.filter((f) => !f.includes('component') && !f.includes('Component'));

    if (backendFiles.length === 0) {
      return {
        agentName: 'Backend Agent',
        status: 'success',
        findings: ['ℹ️  No backend code detected'],
        recommendations: [],
        details: {},
        timestamp: new Date().toISOString(),
      };
    }

    findings.push(`📊 ${backendFiles.length} backend files found`);

    // Check for API patterns
    let hasControllers = false;
    let hasServices = false;
    let hasMiddleware = false;

    for (const file of backendFiles.slice(0, 20)) {
      const content = await fs.readFile(path.join(srcPath, file as string), 'utf-8');

      if (content.includes('Controller') || content.includes('router')) {
        hasControllers = true;
      }
      if (content.includes('Service') || content.includes('service')) {
        hasServices = true;
      }
      if (content.includes('middleware') || content.includes('Middleware')) {
        hasMiddleware = true;
      }
    }

    if (hasControllers) findings.push('✅ Controller pattern detected');
    if (hasServices) findings.push('✅ Service layer detected');
    if (hasMiddleware) findings.push('✅ Middleware pattern detected');

    if (!hasControllers && !hasServices) {
      recommendations.push('Consider implementing Controller/Service separation');
    }

    details.backendFileCount = backendFiles.length;
    recommendations.push('Add comprehensive error handling and logging');
    recommendations.push('Implement request/response validation');

    return {
      agentName: 'Backend Agent',
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      agentName: 'Backend Agent',
      status: 'error',
      findings: [`❌ Error analyzing backend: ${error}`],
      recommendations: [],
      details: { error: String(error) },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Frontend Agent - Analyzes UI/component architecture
 */
export async function runFrontendAgent(projectRoot: string): Promise<AgentResult> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  try {
    const srcPath = path.join(projectRoot, 'src');
    const files = (await fs.readdir(srcPath, { recursive: true })).filter(
      (f) => typeof f === 'string' && (f.endsWith('.tsx') || f.endsWith('.jsx'))
    ) as string[];

    if (files.length === 0) {
      return {
        agentName: 'Frontend Agent',
        status: 'success',
        findings: ['ℹ️  No React/JSX components detected'],
        recommendations: [],
        details: {},
        timestamp: new Date().toISOString(),
      };
    }

    findings.push(`🎨 ${files.length} React components found`);

    // Analyze component structure
    let functionalComponents = 0;
    let classComponents = 0;
    let hooksUsage = 0;

    for (const file of files.slice(0, 30)) {
      const content = await fs.readFile(path.join(srcPath, file as string), 'utf-8');

      if (content.includes('extends React.Component') || content.includes('extends Component')) {
        classComponents++;
      } else if (content.includes('export const') || content.includes('export function')) {
        functionalComponents++;
      }

      if (content.includes('useState') || content.includes('useEffect') || content.includes('useContext')) {
        hooksUsage++;
      }
    }

    findings.push(`✅ ${functionalComponents} functional components`);
    if (classComponents > 0) {
      findings.push(`⚠️  ${classComponents} class components (consider migrating to hooks)`);
    }
    findings.push(`🪝 ${hooksUsage} files using React hooks`);

    details.componentCount = files.length;
    details.functionalComponents = functionalComponents;
    details.classComponents = classComponents;

    if (classComponents > 0) {
      recommendations.push('Migrate class components to functional components with hooks');
    }

    recommendations.push('Implement component composition patterns');
    recommendations.push('Add Storybook for component documentation');

    return {
      agentName: 'Frontend Agent',
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      agentName: 'Frontend Agent',
      status: 'error',
      findings: [`❌ Error analyzing frontend: ${error}`],
      recommendations: [],
      details: { error: String(error) },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Testing Agent - Analyzes test coverage and quality
 */
export async function runTestingAgent(projectRoot: string): Promise<AgentResult> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  try {
    const testsPath = path.join(projectRoot, 'tests');
    let testFiles: string[] = [];

    try {
      testFiles = (await fs.readdir(testsPath, { recursive: true })).filter(
        (f) => typeof f === 'string' && f.endsWith('.test.ts')
      ) as string[];
    } catch {
      // Tests directory doesn't exist
    }

    if (testFiles.length === 0) {
      findings.push('⚠️  No test files found');
      recommendations.push('Create test suite for your application');
      recommendations.push('Aim for 80%+ code coverage');
      return {
        agentName: 'Testing Agent',
        status: 'success',
        findings,
        recommendations,
        details: { testCount: 0 },
        timestamp: new Date().toISOString(),
      };
    }

    findings.push(`✅ ${testFiles.length} test files found`);

    // Check for jest config
    const jestConfigPath = path.join(projectRoot, 'jest.config.js');
    try {
      await fs.access(jestConfigPath);
      findings.push('✅ Jest configured');
    } catch {
      findings.push('⚠️  Jest not configured');
      recommendations.push('Set up Jest for consistent testing');
    }

    // Analyze test patterns
    let unitTests = 0;
    let integrationTests = 0;
    let e2eTests = 0;

    for (const file of testFiles.slice(0, 10)) {
      const content = await fs.readFile(path.join(testsPath, file as string), 'utf-8');

      if (content.includes('describe') && content.includes('it(')) {
        unitTests++;
      }
      if (content.includes('integration') || content.includes('Integration')) {
        integrationTests++;
      }
      if (content.includes('e2e') || content.includes('E2E')) {
        e2eTests++;
      }
    }

    findings.push(`📊 Unit tests detected: ${unitTests}`);
    if (integrationTests > 0) findings.push(`🔗 Integration tests detected: ${integrationTests}`);
    if (e2eTests > 0) findings.push(`🔄 E2E tests detected: ${e2eTests}`);

    details.testCount = testFiles.length;
    details.testTypes = { unitTests, integrationTests, e2eTests };

    recommendations.push('Measure and report code coverage regularly');
    recommendations.push('Add integration tests for critical paths');
    recommendations.push('Implement mutation testing to verify test quality');

    return {
      agentName: 'Testing Agent',
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      agentName: 'Testing Agent',
      status: 'error',
      findings: [`❌ Error analyzing tests: ${error}`],
      recommendations: [],
      details: { error: String(error) },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * E2E Agent - Suggests end-to-end test scenarios
 */
export async function runE2EAgent(projectRoot: string): Promise<AgentResult> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  try {
    findings.push('🔍 E2E Testing Strategy');

    const e2eScenarios = [
      'User authentication flow',
      'Core feature workflows',
      'Error handling and recovery',
      'Performance under load',
      'Cross-browser compatibility',
    ];

    findings.push(`✅ Identified ${e2eScenarios.length} critical test scenarios`);
    details.scenarioCount = e2eScenarios.length;
    details.scenarios = e2eScenarios;

    recommendations.push('Implement Playwright or Cypress for E2E testing');
    recommendations.push('Test critical user journeys end-to-end');
    recommendations.push('Set up CI/CD pipeline for automated E2E tests');
    recommendations.push('Monitor performance metrics in E2E tests');

    return {
      agentName: 'E2E Testing Agent',
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      agentName: 'E2E Testing Agent',
      status: 'error',
      findings: [`❌ Error creating E2E strategy: ${error}`],
      recommendations: [],
      details: { error: String(error) },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Supervisor Agent - Consolidates findings and provides strategic recommendations
 */
export async function runSupervisorAgent(agentResults: AgentResult[]): Promise<AgentResult> {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const details: Record<string, unknown> = {};

  try {
    // Aggregate findings
    const allFindings = agentResults.flatMap((r) => r.findings);
    const allRecommendations = agentResults.flatMap((r) => r.recommendations);
    const successfulAgents = agentResults.filter((r) => r.status === 'success').length;

    findings.push(`📊 Analysis Summary: ${successfulAgents}/${agentResults.length} agents completed`);
    findings.push(`📈 ${allFindings.length} findings collected`);
    findings.push(`💡 ${allRecommendations.length} recommendations generated`);

    // Prioritize recommendations
    const prioritized = allRecommendations.slice(0, 10);
    findings.push('\n🎯 Top Recommendations:');
    prioritized.forEach((rec, i) => {
      findings.push(`${i + 1}. ${rec}`);
    });

    // Add supervisory insights
    recommendations.push('CRITICAL: Address findings marked with ⚠️ or 🔴');
    recommendations.push('Review all architecture recommendations with team');
    recommendations.push('Create improvement plan for next sprint');
    recommendations.push('Schedule architecture review meeting');

    details.totalFindings = allFindings.length;
    details.totalRecommendations = allRecommendations.length;
    details.agentsRun = agentResults.map((r) => r.agentName);
    details.recommendations = prioritized;

    return {
      agentName: 'Supervisor',
      status: 'success',
      findings,
      recommendations,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      agentName: 'Supervisor',
      status: 'error',
      findings: [`❌ Error in supervisor analysis: ${error}`],
      recommendations: [],
      details: { error: String(error) },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Run all agents in sequence — uses JSON-driven agent chain + Supervisor
 */
export async function runAllAgents(projectRoot: string): Promise<AgentResult[]> {
  const { AgentChainExecutor } = await import('./agent-chain.js');

  console.log('🤖 Starting agent analysis...\n');

  // Load and run all *.agent.json definitions bundled with this package
  const agentsDir = path.resolve(__dirname, '../agents');
  const executor = new AgentChainExecutor();
  await executor.loadFromDirectory(agentsDir);
  const results = await executor.execute(projectRoot);

  // Legacy agents kept for backward compatibility (skipped if JSON covers them)
  // Keeping Business Analyst just as a reference — remove once JSON fully replaces it
  // const baResult = await runBusinessAnalystAgent(projectRoot);
  // results.push(baResult);

  // Supervisor consolidates all JSON-agent results
  console.log('✔️  Supervisor consolidating results...');
  const supervisorResult = await runSupervisorAgent(results);
  results.push(supervisorResult);
  console.log(`   ✅ Complete\n`);

  return results;
}
