import * as path from 'path';

export const TEMPLATE_DIR = path.resolve(__dirname, '../../../../template');

export const REQUIRED_FILES = [
  '.github/copilot-instructions.md',
  '.github/ai/manifest.xml',
  '.github/ai/pipeline.xml',
  '.github/ai/architecture-rules.xml',
  '.github/ai/quality-gates.xml',
  'src/.ai/bootstrap.md',
  'src/.ai/rules.md',
  'src/.ai/patterns.md',
];

export const FORBIDDEN_PATTERNS = ['class ', ' any ', 'useImperativeHandle'];
