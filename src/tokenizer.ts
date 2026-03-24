import { Message } from "./types"

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function messageTokens(message: Message): number {
  if (message.tokens !== undefined) return message.tokens
  const overhead = 4
  return estimateTokens(message.content) + overhead
}

export function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0)
}

export function fitsInWindow(messages: Message[], maxTokens: number): boolean {
  return totalTokens(messages) <= maxTokens
}
