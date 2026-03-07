export type LexiconCategory =
  | 'engine'
  | 'provider'
  | 'resilience'
  | 'security'
  | 'ai'
  | 'pattern'
  | 'api'
  | 'project'

export interface LexiconEntry {
  /** Kebab-case unique id (used for anchor links and seeAlso references). */
  id:          string
  /** Display name shown in the UI. */
  term:        string
  /** Acronym expansion or short-form alias, if applicable. */
  acronym?:    string
  /** Single uppercase letter for alphabetical grouping. */
  letter:      string
  /** Plain-text definition shown in the card and indexed for search. */
  definition:  string
  /** Semantic category for badge colouring and filter chips. */
  category:    LexiconCategory
  /** IDs of related entries (cross-references). */
  seeAlso?:    string[]
  /** When set, this entry is a cross-reference alias; redirect to the given entry id. */
  redirect?:   string
}
