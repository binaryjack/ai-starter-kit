/**
 * Parser Registry - Manages language parsers
 * Maps file extensions to appropriate parsers
 */

import * as path from 'path'
import type { Parser, ParserRegistryOptions } from './parser-protocol.types'

export type ParserRegistryInstance = {
  _parsers: Map<string, Parser>;
  register(language: string, parser: Parser): ParserRegistryInstance;
  registerParser(language: string, parser: Parser): void;
  getParser(filePathOrLanguage: string): Parser | undefined;
  supports(language: string): boolean;
  hasParser(language: string): boolean;
  getSupportedLanguages(): string[];
  parseFile(sourceCode: string, filePath: string, language: string): Promise<import('./parser-protocol.types').FileParseResult>;
};

export const ParserRegistry = function(this: ParserRegistryInstance, options: ParserRegistryOptions = {}) {
  const { customParsers = {} } = options;
  
  Object.defineProperty(this, '_parsers', {
    enumerable: false,
    value: new Map()
  });
  
  // Register custom parsers
  Object.entries(customParsers).forEach(([lang, parser]) => {
    this.register(lang, parser);
  });
};

ParserRegistry.prototype.register = function(this: ParserRegistryInstance, language: string, parser: Parser) {
  this._parsers.set(language, parser);
  return this;
};

ParserRegistry.prototype.registerParser = function(this: ParserRegistryInstance, language: string, parser: Parser): void {
  this._parsers.set(language, parser);
};

ParserRegistry.prototype.hasParser = function(this: ParserRegistryInstance, language: string): boolean {
  return this._parsers.has(language);
};

ParserRegistry.prototype.parseFile = async function(this: ParserRegistryInstance, sourceCode: string, filePath: string, language: string): Promise<import('./parser-protocol.types').FileParseResult> {
  const crypto = require('crypto');
  
  const parser = this._parsers.get(language);
  if (!parser) {
    throw new Error(`No parser registered for language: ${language}`);
  }
  
  // Parse AST
  const ast = await parser.parse(sourceCode, { filePath });
  
  // Extract symbols, imports, exports
  const symbols = await parser.extractSymbols(ast);
  const imports = await parser.extractImports(ast);
  const exports = await parser.extractExports(ast);
  
  // Calculate hash and size
  const hash = crypto.createHash('sha256').update(sourceCode, 'utf-8').digest('hex');
  const sizeBytes = Buffer.byteLength(sourceCode, 'utf-8');
  
  return {
    filePath,
    language,
    hash,
    sizeBytes,
    symbols,
    imports,
    exports
  };
};

ParserRegistry.prototype.getParser = function(this: ParserRegistryInstance, filePathOrLanguage: string): Parser | undefined {
  // Check if it's already a language name
  if (this._parsers.has(filePathOrLanguage)) {
    return this._parsers.get(filePathOrLanguage);
  }
  
  // Otherwise, try to detect language from file extension
  const ext = path.extname(filePathOrLanguage).slice(1);
  
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'mjs': 'javascript',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust'
  };
  
  const language = langMap[ext] || ext;
  
  return this._parsers.get(language);
};

ParserRegistry.prototype.supports = function(this: ParserRegistryInstance, language: string): boolean {
  return this._parsers.has(language);
};

ParserRegistry.prototype.getSupportedLanguages = function(this: ParserRegistryInstance): string[] {
  return Array.from(this._parsers.keys());
};
