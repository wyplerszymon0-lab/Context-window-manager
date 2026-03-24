export type Role = "system" | "user" | "assistant" | "tool"

export type TrimStrategy = "oldest" | "middle" | "scored"

export interface Message {
  role:      Role
  content:   string
  id?:       string
  timestamp?: number
  score?:    number
  pinned?:   boolean
  tokens?:   number
}

export interface WindowOptions {
  maxTokens?:    number
  systemTokens?: number
  reserveTokens?: number
  strategy?:     TrimStrategy
  minMessages?:  number
}

export interface TrimResult {
  messages:    Message[]
  removed:     number
  tokensBefore: number
  tokensAfter:  number
}

export interface WindowStats {
  totalMessages:   number
  pinnedMessages:  number
  tokenCount:      number
  maxTokens:       number
  utilizationPct:  number
  wouldTrim:       boolean
}
