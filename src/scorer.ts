import { Message } from "./types"

export function scoreMessage(message: Message, index: number, total: number): number {
  let score = 0

  if (message.pinned)              score += 1000
  if (message.role === "system")   score += 900

  const positionRatio = index / Math.max(total - 1, 1)
  score += positionRatio * 50

  const contentLen = message.content.length
  if (contentLen > 500) score += 20
  if (contentLen > 200) score += 10

  const keywords = ["important", "remember", "key", "critical", "must", "always", "never"]
  const lower    = message.content.toLowerCase()
  for (const kw of keywords) {
    if (lower.includes(kw)) { score += 15; break }
  }

  if (message.score !== undefined) score += message.score

  return score
}

export function scoreMessages(messages: Message[]): Array<Message & { _score: number }> {
  return messages.map((m, i) => ({
    ...m,
    _score: scoreMessage(m, i, messages.length),
  }))
}
