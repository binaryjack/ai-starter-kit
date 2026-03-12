/**
 * Unit tests for ParserRegistry
 */

import { createParserRegistry } from './create-parser-registry'
import { createTypeScriptParser } from './create-typescript-parser'
import type { ParserRegistryInstance } from './parser-registry'

describe('ParserRegistry', () => {
  let registry: ParserRegistryInstance;

  beforeEach(() => {
    registry = createParserRegistry({});
  });

  describe('registerParser', () => {
    it('should register a parser for a language', () => {
      const parser = createTypeScriptParser({ language: 'typescript' });
      
      registry.registerParser('typescript', parser);
      
      const retrieved = registry.getParser('typescript');
      expect(retrieved).toBe(parser);
    });

    it('should allow registering multiple parsers', () => {
      const tsParser = createTypeScriptParser({ language: 'typescript' });
      const jsParser = createTypeScriptParser({ language: 'javascript' });
      
      registry.registerParser('typescript', tsParser);
      registry.registerParser('javascript', jsParser);
      
      expect(registry.getParser('typescript')).toBe(tsParser);
      expect(registry.getParser('javascript')).toBe(jsParser);
    });

    it('should override existing parser for language', () => {
      const parser1 = createTypeScriptParser({ language: 'typescript' });
      const parser2 = createTypeScriptParser({ language: 'typescript' });
      
      registry.registerParser('typescript', parser1);
      registry.registerParser('typescript', parser2);
      
      expect(registry.getParser('typescript')).toBe(parser2);
    });
  });

  describe('getParser', () => {
    it('should return registered parser', () => {
      const parser = createTypeScriptParser({ language: 'typescript' });
      registry.registerParser('typescript', parser);
      
      const retrieved = registry.getParser('typescript');
      
      expect(retrieved).toBeDefined();
      expect(retrieved).toBe(parser);
    });

    it('should return undefined for unregistered language', () => {
      const parser = registry.getParser('python');
      expect(parser).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      const parser = createTypeScriptParser({ language: 'typescript' });
      registry.registerParser('typescript', parser);
      
      expect(registry.getParser('TypeScript')).toBeUndefined();
    });
  });

  describe('hasParser', () => {
    it('should return true for registered parser', () => {
      const parser = createTypeScriptParser({ language: 'typescript' });
      registry.registerParser('typescript', parser);
      
      expect(registry.hasParser('typescript')).toBe(true);
    });

    it('should return false for unregistered parser', () => {
      expect(registry.hasParser('python')).toBe(false);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return empty array initially', () => {
      const languages = registry.getSupportedLanguages();
      expect(languages).toEqual([]);
    });

    it('should return all registered languages', () => {
      const tsParser = createTypeScriptParser({ language: 'typescript' });
      const jsParser = createTypeScriptParser({ language: 'javascript' });
      
      registry.registerParser('typescript', tsParser);
      registry.registerParser('javascript', jsParser);
      
      const languages = registry.getSupportedLanguages();
      
      expect(languages).toHaveLength(2);
      expect(languages).toContain('typescript');
      expect(languages).toContain('javascript');
    });

    it('should not include duplicates', () => {
      const parser1 = createTypeScriptParser({ language: 'typescript' });
      const parser2 = createTypeScriptParser({ language: 'typescript' });
      
      registry.registerParser('typescript', parser1);
      registry.registerParser('typescript', parser2);
      
      const languages = registry.getSupportedLanguages();
      
      expect(languages).toEqual(['typescript']);
    });
  });

  describe('parseFile', () => {
    beforeEach(() => {
      const parser = createTypeScriptParser({ language: 'typescript' });
      registry.registerParser('typescript', parser);
    });

    it('should delegate to appropriate parser', async () => {
      const sourceCode = 'export function test() {}';
      
      const result = await registry.parseFile(sourceCode, 'test.ts', 'typescript');
      
      expect(result).toBeDefined();
      expect(result.filePath).toBe('test.ts');
      expect(result.language).toBe('typescript');
    });

    it('should throw error for unsupported language', async () => {
      await expect(async () => {
        await registry.parseFile('code', 'test.py', 'python');
      }).rejects.toThrow('No parser registered for language: python');
    });

    it('should parse and return symbols', async () => {
      const sourceCode = `
        export function func1() {}
        export function func2() {}
      `;
      
      const result = await registry.parseFile(sourceCode, 'test.ts', 'typescript');
      
      expect(result.symbols).toHaveLength(2);
    });

    it('should parse and return imports', async () => {
      const sourceCode = `
        import { helper } from './helper';
        import React from 'react';
      `;
      
      const result = await registry.parseFile(sourceCode, 'test.ts', 'typescript');
      
      expect(result.imports).toHaveLength(2);
    });

    it('should parse and return exports', async () => {
      const sourceCode = `
        export function func1() {}
        export class Class1 {}
      `;
      
      const result = await registry.parseFile(sourceCode, 'test.ts', 'typescript');
      
      expect(result.exports).toHaveLength(2);
    });

    it('should calculate file hash', async () => {
      const result = await registry.parseFile('export function test() {}', 'test.ts', 'typescript');
      
      expect(result.hash).toBeDefined();
      expect(result.hash).toHaveLength(64); // SHA-256 hex string
    });

    it('should calculate file size', async () => {
      const sourceCode = 'export function test() {}';
      const result = await registry.parseFile(sourceCode, 'test.ts', 'typescript');
      
      expect(result.sizeBytes).toBe(Buffer.byteLength(sourceCode, 'utf-8'));
    });
  });

  describe('integration with multiple parsers', () => {
    it('should handle TypeScript and JavaScript separately', async () => {
      const tsParser = createTypeScriptParser({ language: 'typescript' });
      const jsParser = createTypeScriptParser({ language: 'javascript' });
      
      registry.registerParser('typescript', tsParser);
      registry.registerParser('javascript', jsParser);
      
      const tsResult = await registry.parseFile('export function test() {}', 'test.ts', 'typescript');
      const jsResult = await registry.parseFile('export function test() {}', 'test.js', 'javascript');
      
      expect(tsResult.language).toBe('typescript');
      expect(jsResult.language).toBe('javascript');
    });
  });
});
