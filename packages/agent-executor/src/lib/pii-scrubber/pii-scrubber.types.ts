export interface ScrubPattern {
  name:        string;
  pattern:     RegExp;
  replacement: string;
}

export interface ScrubResult {
  text:            string;
  scrubCount:      number;
  patternsMatched: string[];
}

export interface PiiScrubberOptions {
  enabled?:        boolean;
  customPatterns?: Array<{ name: string; pattern: string; flags?: string }>;
}
