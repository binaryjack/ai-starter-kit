import { PiiScrubber } from '../pii-scrubber.js'
import { patternNames, scrub, scrubPrompt } from './scrub.js'

Object.assign(PiiScrubber.prototype, { scrub, scrubPrompt, patternNames });
