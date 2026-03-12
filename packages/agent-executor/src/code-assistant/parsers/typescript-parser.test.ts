/**
 * Unit tests for TypeScriptParser
 */

import { createTypeScriptParser } from './create-typescript-parser'
import type { TypeScriptParserInstance } from './typescript-parser'

describe('TypeScriptParser', () => {
  let parser: TypeScriptParserInstance;

  beforeEach(() => {
    parser = createTypeScriptParser({
      language: 'typescript'
    });
  });

  describe('extractSymbols', () => {
    it('should extract function declarations', async () => {
      const sourceCode = `
        export function testFunction() {
          return true;
        }
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: 'testFunction',
        kind: 'function',
        isExported: true
      });
    });

    it('should extract arrow functions assigned to const', async () => {
      const sourceCode = `
        const arrowFunc = () => {
          return 42;
        };
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: 'arrowFunc',
        kind: 'function',
        isExported: false
      });
    });

    it('should extract class declarations', async () => {
      const sourceCode = `
        export class TestClass {
          constructor() {}
          
          method1() {}
          method2() {}
        }
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: 'TestClass',
        kind: 'class',
        isExported: true
      });
      expect(symbols[0].methods).toContain('method1');
      expect(symbols[0].methods).toContain('method2');
    });

    it('should extract interface declarations', async () => {
      const sourceCode = `
        export interface TestInterface {
          prop1: string;
          prop2: number;
        }
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: 'TestInterface',
        kind: 'interface',
        isExported: true
      });
    });

    it('should extract type aliases', async () => {
      const sourceCode = `
        export type TestType = {
          id: string;
          value: number;
        };
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: 'TestType',
        kind: 'type',
        isExported: true
      });
    });

    it('should extract variable declarations', async () => {
      const sourceCode = `
        export const CONFIG = {
          apiUrl: 'https://api.example.com'
        };
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: 'CONFIG',
        kind: 'variable',
        isExported: true
      });
    });

    it('should capture line numbers', async () => {
      const sourceCode = `
        // Line 1 (blank)
        // Line 2 (comment)
        function testFunc() {
          // function body
          return true;
        }
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols[0].lineStart).toBe(4);
      expect(symbols[0].lineEnd).toBeGreaterThan(4);
    });

    it('should capture function signatures', async () => {
      const sourceCode = `
        export function calculate(a: number, b: number): number {
          return a + b;
        }
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols[0].signature).toContain('calculate');
      expect(symbols[0].signature).toContain('number');
    });

    it('should extract JSDoc comments', async () => {
      const sourceCode = `
        /**
         * Calculates the sum of two numbers
         * @param a First number
         * @param b Second number
         */
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols[0].docstring).toBeDefined();
      expect(symbols[0].docstring).toContain('Calculates the sum');
    });

    it('should handle multiple symbols in one file', async () => {
      const sourceCode = `
        export function func1() {}
        export function func2() {}
        export class MyClass {}
        export interface MyInterface {}
        export type MyType = string;
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(5);
      expect(symbols.map((s: any) => s.name)).toEqual([
        'func1',
        'func2',
        'MyClass',
        'MyInterface',
        'MyType'
      ]);
    });

    it('should handle empty file', async () => {
      const ast = await parser.parse('', { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);
      expect(symbols).toEqual([]);
    });

    it('should handle non-exported symbols', async () => {
      const sourceCode = `
        function internalFunc() {}
        const internalVar = 42;
        class InternalClass {}
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(3);
      expect(symbols.every((s: any) => !s.isExported)).toBe(true);
    });
  });

  describe('extractImports', () => {
    it('should extract ES6 imports', async () => {
      const sourceCode = `
        import { func1, func2 } from './module';
        import React from 'react';
        import * as fs from 'fs';
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports).toHaveLength(3);
    });

    it('should identify local imports', async () => {
      const sourceCode = `
        import { helper } from './utils/helper';
        import { Component } from '../components/Component';
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports).toHaveLength(2);
      expect(imports.every((imp: any) => imp.type === 'local')).toBe(true);
    });

    it('should identify npm imports', async () => {
      const sourceCode = `
        import React from 'react';
        import { render } from '@testing-library/react';
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports).toHaveLength(2);
      expect(imports.every((imp: any) => imp.type === 'npm')).toBe(true);
    });

    it('should identify builtin Node.js imports', async () => {
      const sourceCode = `
        import * as fs from 'fs';
        import * as path from 'path';
        import { createServer } from 'http';
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports).toHaveLength(3);
      expect(imports.every((imp: any) => imp.type === 'builtin')).toBe(true);
    });

    it('should extract named imports', async () => {
      const sourceCode = `
        import { named1, named2, named3 } from 'module';
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports[0].names).toEqual(['named1', 'named2', 'named3']);
    });

    it('should handle default imports', async () => {
      const sourceCode = `
        import DefaultExport from 'module';
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports[0].names).toEqual(['DefaultExport']);
    });

    it('should handle namespace imports', async () => {
      const sourceCode = `
        import * as Everything from 'module';
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports[0].names).toEqual(['*']);
    });

    it('should handle require() calls', async () => {
      const sourceCode = `
        const fs = require('fs');
        const path = require('path');
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);

      expect(imports).toHaveLength(2);
      expect(imports[0].specifier).toBe('fs');
      expect(imports[1].specifier).toBe('path');
    });

    it('should handle empty file', async () => {
      const ast = await parser.parse('', { filePath: 'test.ts' });
      const imports = await parser.extractImports(ast);
      expect(imports).toEqual([]);
    });
  });

  describe('extractExports', () => {
    it('should extract named function exports', async () => {
      const sourceCode = `
        export function func1() {}
        export function func2() {}
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);

      expect(exports).toHaveLength(2);
      expect(exports[0]).toMatchObject({
        name: 'func1',
        kind: 'function'
      });
      expect(exports[1]).toMatchObject({
        name: 'func2',
        kind: 'function'
      });
    });

    it('should extract class exports', async () => {
      const sourceCode = `
        export class MyClass {}
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);

      expect(exports[0]).toMatchObject({
        name: 'MyClass',
        kind: 'class'
      });
    });

    it('should extract interface exports', async () => {
      const sourceCode = `
        export interface MyInterface {}
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);

      expect(exports[0]).toMatchObject({
        name: 'MyInterface',
        kind: 'interface'
      });
    });

    it('should extract type exports', async () => {
      const sourceCode = `
        export type MyType = string;
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);

      expect(exports[0]).toMatchObject({
        name: 'MyType',
        kind: 'type'
      });
    });

    it('should extract variable exports', async () => {
      const sourceCode = `
        export const CONFIG = {};
        export let counter = 0;
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);

      expect(exports).toHaveLength(2);
      expect(exports.every((exp: any) => exp.kind === 'variable')).toBe(true);
    });

    it('should handle export lists', async () => {
      const sourceCode = `
        function func1() {}
        function func2() {}
        const var1 = 1;
        
        export { func1, func2, var1 };
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);

      expect(exports).toHaveLength(3);
      expect(exports.map((e: any) => e.name)).toEqual(['func1', 'func2', 'var1']);
    });

    it('should handle default exports', async () => {
      const sourceCode = `
        export default function() {}
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);

      expect(exports[0].name).toBe('default');
    });

    it('should handle empty file', async () => {
      const ast = await parser.parse('', { filePath: 'test.ts' });
      const exports = await parser.extractExports(ast);
      expect(exports).toEqual([]);
    });
  });

  describe('parse', () => {
    it('should return TypeScript AST SourceFile', async () => {
      const sourceCode = `
        import { helper } from './helper';
        
        /**
         * Test function
         */
        export function testFunction() {
          return helper();
        }
      `;

      const ast = await parser.parse(sourceCode, { filePath: 'src/test.ts' });

      expect(ast).toBeDefined();
      expect(ast.fileName).toBeDefined();
      expect(ast.statements).toBeDefined();
    });

    it('should parse empty file without error', async () => {
      const ast = await parser.parse('', { filePath: 'test.ts' });

      expect(ast).toBeDefined();
      expect(ast.statements).toHaveLength(0);
    });

    it('should parse file with syntax', async () => {
      const sourceCode = 'export function test() {}';
      const ast = await parser.parse(sourceCode, { filePath: 'test.ts' });

      expect(ast).toBeDefined();
      expect(ast.statements.length).toBeGreaterThan(0);
    });
  });
});
