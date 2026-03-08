import { PiiScrubber }                   from '../pii-scrubber.js';
import { scrub, scrubPrompt, patternNames } from './scrub.js';

Object.assign(PiiScrubber.prototype, { scrub, scrubPrompt, patternNames });
