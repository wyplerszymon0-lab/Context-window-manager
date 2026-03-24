import { Message, WindowOptions, TrimResult, WindowStats, TrimStrategy } from "./types"
import { messageTokens, totalTokens, estimateTokens } from "./tokenizer"
import { scoreMessages } from "./scorer"
import crypto from "crypto"

const DEFAULTS: Required<WindowOptions> = {
  maxTokens:     4000,
  systemTokens:  500,
  reserveTokens: 200,
  strategy:      "oldest",
  minMessages:   2,
}

function trimByOldest(messages: Message[], budget: number, minMessages: number): Message[] {
  const pinned = messages.filter(m => m.pinned || m.role === "system")
  const normal = messages.filter(m => !m.pinned && m.role !== "system")

  const result = [...normal]
  while (totalTokens([...pinned, ...result]) > budget && result.length > minMessages) {
    result.shift()
  }

  return [...pinned, ...result]
}

function trimByMiddle(messages: Message[], budget: number, minMessages: number): Message[] {
  const pinned = messages.filter(m => m.pinned || m.role === "system")
  const normal = messages.filter(m => !m.pinned && m.role !== "system")

  const result = [...normal]
  while (totalTokens([...pinned, ...result]) > budget && result.length > minMessages) {
    const mid = Math.floor(result.length / 2)
    result.splice(mid, 1)
  }

  return [...pinned, ...result]
}

function trimByScore(messages: Message[], budget: number, minMessages: number): Message[] {
  const scored = scoreMessages(messages)
  const sorted = [...scored].sort((a, b) => a._score - b._score)

  const result = [...scored]
  let i = 0
  while (totalTokens(result) > budget && result.length > minMessages && i < sorted.length) {
    const toRemove = sorted[i]
    const idx = result.findIndex(m => m.id === toRemove.id)
    if (idx !== -1) result.splice(idx, 1)
    i++
  }

  return result
}

export class ContextWindowManager {
  private messages: Message[] = []
  private opts:     Required<WindowOptions>

  constructor(options: WindowOptions = {}) {
    this.opts = { ...DEFAULTS, ...options }
  }

  get budget(): number {
    return this.opts.maxTokens - this.opts.systemTokens - this.opts.reserveTokens
  }

  add(role: Message["role"], content: string, options: Partial<Message> = {}): Message {
    const message: Message = {
      id:        options.id        ?? crypto.randomUUID(),
      role,
      content,
      timestamp: options.timestamp ?? Date.now(),
      pinned:    options.pinned    ?? false,
      score:     options.score,
      tokens:    options.tokens    ?? (estimateTokens(content) + 4),
    }
    this.messages.push(message)
    return message
  }

  pin(id: string): boolean {
    const msg = this.messages.find(m => m.id === id)
    if (!msg) return false
    msg.pinned = true
    return true
  }

  unpin(id: string): boolean {
    const msg = this.messages.find(m => m.id === id)
    if (!msg) return false
    msg.pinned = false
    return true
  }

  remove(id: string): boolean {
    const before = this.messages.length
    this.messages = this.messages.filter(m => m.id !== id)
    return this.messages.length < before
  }

  trim(strategy?: TrimStrategy): TrimResult {
    const strat      = strategy ?? this.opts.strategy
    const tokensBefore = totalTokens(this.messages)

    if (tokensBefore <= this.budget) {
      return {
        messages:    this.messages,
        removed:     0,
        tokensBefore,
        tokensAfter: tokensBefore,
      }
    }

    let trimmed: Message[]
    switch (strat) {
      case "middle":  trimmed = trimByMiddle(this.messages, this.budget, this.opts.minMessages); break
      case "scored":  trimmed = trimByScore(this.messages,  this.budget, this.opts.minMessages); break
      case "oldest":
      default:        trimmed = trimByOldest(this.messages, this.budget, this.opts.minMessages)
    }

    const removed    = this.messages.length - trimmed.length
    const tokensAfter = totalTokens(trimmed)
    this.messages    = trimmed

    return { messages: trimmed, removed, tokensBefore, tokensAfter }
  }

  fit(): TrimResult {
    return this.trim()
  }

  getMessages(autoTrim = false): Message[] {
    if (autoTrim) this.trim()
    return [...this.messages]
  }

  stats(): WindowStats {
    const tokenCount    = totalTokens(this.messages)
    const pinnedMessages = this.messages.filter(m => m.pinned).length
    return {
      totalMessages:  this.messages.length,
      pinnedMessages,
      tokenCount,
      maxTokens:      this.opts.maxTokens,
      utilizationPct: Math.round((tokenCount / this.opts.maxTokens) * 100),
      wouldTrim:      tokenCount > this.budget,
    }
  }

  clear(keepPinned = false): void {
    if (keepPinned) {
      this.messages = this.messages.filter(m => m.pinned || m.role === "system")
    } else {
      this.messages = []
    }
  }

  updateOptions(options: Partial<WindowOptions>): void {
    this.opts = { ...this.opts, ...options }
  }

  get size(): number {
    return this.messages.length
  }

  get tokenCount(): number {
    return totalTokens(this.messages)
  }
}
