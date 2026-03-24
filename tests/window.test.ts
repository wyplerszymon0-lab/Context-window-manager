import { describe, it, expect, beforeEach } from "vitest"
import { ContextWindowManager } from "../src/window"
import { totalTokens, messageTokens, estimateTokens } from "../src/tokenizer"
import { scoreMessage } from "../src/scorer"
import { Message } from "../src/types"

function makeManager(maxTokens = 1000) {
  return new ContextWindowManager({
    maxTokens,
    systemTokens:  0,
    reserveTokens: 0,
    minMessages:   1,
    strategy:      "oldest",
  })
}

function shortMsg(role: Message["role"] = "user", content = "hello"): Message {
  return { role, content, id: Math.random().toString(36).slice(2), tokens: 10 }
}

describe("estimateTokens", () => {
  it("estimates tokens as length divided by 4 rounded up", () => {
    expect(estimateTokens("aaaa")).toBe(1)
    expect(estimateTokens("a".repeat(400))).toBe(100)
  })

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })
})

describe("totalTokens", () => {
  it("sums tokens across messages", () => {
    const messages: Message[] = [
      { role: "user",      content: "hi",    tokens: 10 },
      { role: "assistant", content: "hello", tokens: 20 },
    ]
    expect(totalTokens(messages)).toBe(30)
  })

  it("returns 0 for empty array", () => {
    expect(totalTokens([])).toBe(0)
  })
})

describe("ContextWindowManager — add", () => {
  it("adds a message and returns it", () => {
    const mgr = makeManager()
    const msg = mgr.add("user", "hello")
    expect(msg.role).toBe("user")
    expect(msg.content).toBe("hello")
    expect(msg.id).toBeTruthy()
  })

  it("increments size after add", () => {
    const mgr = makeManager()
    expect(mgr.size).toBe(0)
    mgr.add("user", "hello")
    expect(mgr.size).toBe(1)
  })

  it("assigns timestamp automatically", () => {
    const mgr = makeManager()
    const msg = mgr.add("user", "hello")
    expect(msg.timestamp).toBeGreaterThan(0)
  })

  it("respects provided id", () => {
    const mgr = makeManager()
    const msg = mgr.add("user", "hello", { id: "custom-id" })
    expect(msg.id).toBe("custom-id")
  })
})

describe("ContextWindowManager — pin / unpin", () => {
  it("pins a message by id", () => {
    const mgr = makeManager()
    const msg = mgr.add("user", "important")
    const result = mgr.pin(msg.id!)
    expect(result).toBe(true)
    expect(mgr.getMessages()[0].pinned).toBe(true)
  })

  it("unpins a pinned message", () => {
    const mgr = makeManager()
    const msg = mgr.add("user", "important", { pinned: true })
    mgr.unpin(msg.id!)
    expect(mgr.getMessages()[0].pinned).toBe(false)
  })

  it("returns false for nonexistent id", () => {
    const mgr = makeManager()
    expect(mgr.pin("nonexistent")).toBe(false)
  })

  it("pinned messages survive oldest trim", () => {
    const mgr = makeManager(100)
    const pinned = mgr.add("user", "pinned message", { pinned: true, tokens: 10 })
    for (let i = 0; i < 8; i++) mgr.add("user", "filler message", { tokens: 12 })

    mgr.trim("oldest")

    const ids = mgr.getMessages().map(m => m.id)
    expect(ids).toContain(pinned.id)
  })
})

describe("ContextWindowManager — remove", () => {
  it("removes a message by id", () => {
    const mgr = makeManager()
    const msg = mgr.add("user", "hello")
    const result = mgr.remove(msg.id!)
    expect(result).toBe(true)
    expect(mgr.size).toBe(0)
  })

  it("returns false for nonexistent id", () => {
    const mgr = makeManager()
    expect(mgr.remove("nonexistent")).toBe(false)
  })
})

describe("ContextWindowManager — trim strategies", () => {
  it("does not trim when within budget", () => {
    const mgr = makeManager(1000)
    mgr.add("user", "hello", { tokens: 10 })
    const result = mgr.trim()
    expect(result.removed).toBe(0)
  })

  it("oldest strategy removes oldest non-pinned messages first", () => {
    const mgr = makeManager(100)
    const old  = mgr.add("user", "oldest message",  { tokens: 40 })
    const mid  = mgr.add("user", "middle message",  { tokens: 40 })
    const new_ = mgr.add("user", "newest message",  { tokens: 40 })

    mgr.trim("oldest")

    const ids = mgr.getMessages().map(m => m.id)
    expect(ids).not.toContain(old.id)
    expect(ids).toContain(new_.id)
  })

  it("middle strategy removes middle messages first", () => {
    const mgr = makeManager(80)
    const first  = mgr.add("user", "first",  { tokens: 30 })
    const middle = mgr.add("user", "middle", { tokens: 30 })
    const last   = mgr.add("user", "last",   { tokens: 30 })

    mgr.trim("middle")

    const ids = mgr.getMessages().map(m => m.id)
    expect(ids).not.toContain(middle.id)
    expect(ids).toContain(first.id)
    expect(ids).toContain(last.id)
  })

  it("trim returns correct removed count", () => {
    const mgr = makeManager(50)
    mgr.add("user", "msg1", { tokens: 20 })
    mgr.add("user", "msg2", { tokens: 20 })
    mgr.add("user", "msg3", { tokens: 20 })

    const result = mgr.trim("oldest")
    expect(result.removed).toBeGreaterThan(0)
    expect(result.tokensBefore).toBeGreaterThan(result.tokensAfter)
  })

  it("trim reduces token count below budget", () => {
    const mgr = makeManager(100)
    for (let i = 0; i < 10; i++) mgr.add("user", `msg ${i}`, { tokens: 15 })

    mgr.trim()

    expect(mgr.tokenCount).toBeLessThanOrEqual(100)
  })
})

describe("ContextWindowManager — stats", () => {
  it("returns correct stats after adding messages", () => {
    const mgr = makeManager(1000)
    mgr.add("user",      "hello", { tokens: 10 })
    mgr.add("assistant", "hi",    { tokens: 10 })

    const stats = mgr.stats()
    expect(stats.totalMessages).toBe(2)
    expect(stats.tokenCount).toBe(20)
    expect(stats.utilizationPct).toBe(2)
    expect(stats.wouldTrim).toBe(false)
  })

  it("wouldTrim is true when over budget", () => {
    const mgr = makeManager(30)
    mgr.add("user", "msg1", { tokens: 15 })
    mgr.add("user", "msg2", { tokens: 15 })
    mgr.add("user", "msg3", { tokens: 15 })

    const stats = mgr.stats()
    expect(stats.wouldTrim).toBe(true)
  })

  it("counts pinned messages correctly", () => {
    const mgr = makeManager()
    mgr.add("user", "normal")
    mgr.add("user", "pinned", { pinned: true })

    const stats = mgr.stats()
    expect(stats.pinnedMessages).toBe(1)
  })
})

describe("ContextWindowManager — clear", () => {
  it("clears all messages", () => {
    const mgr = makeManager()
    mgr.add("user", "hello")
    mgr.add("user", "world")
    mgr.clear()
    expect(mgr.size).toBe(0)
  })

  it("keeps pinned messages when keepPinned is true", () => {
    const mgr    = makeManager()
    const pinned = mgr.add("system", "system prompt", { pinned: true })
    mgr.add("user", "hello")
    mgr.clear(true)

    expect(mgr.size).toBe(1)
    expect(mgr.getMessages()[0].id).toBe(pinned.id)
  })
})

describe("ContextWindowManager — updateOptions", () => {
  it("updates maxTokens", () => {
    const mgr = makeManager(1000)
    mgr.updateOptions({ maxTokens: 2000 })
    expect(mgr.stats().maxTokens).toBe(2000)
  })
})

describe("scoreMessage", () => {
  it("gives higher score to pinned messages", () => {
    const pinned   = scoreMessage({ role: "user", content: "test", pinned: true  }, 0, 10)
    const unpinned = scoreMessage({ role: "user", content: "test", pinned: false }, 0, 10)
    expect(pinned).toBeGreaterThan(unpinned)
  })

  it("gives higher score to system messages", () => {
    const system = scoreMessage({ role: "system", content: "test" }, 0, 10)
    const user   = scoreMessage({ role: "user",   content: "test" }, 0, 10)
    expect(system).toBeGreaterThan(user)
  })

  it("gives higher score to recent messages", () => {
    const recent = scoreMessage({ role: "user", content: "test" }, 9,  10)
    const old    = scoreMessage({ role: "user", content: "test" }, 0,  10)
    expect(recent).toBeGreaterThan(old)
  })

  it("boosts messages with important keywords", () => {
    const important = scoreMessage({ role: "user", content: "this is critical information" }, 0, 10)
    const normal    = scoreMessage({ role: "user", content: "this is regular information" },  0, 10)
    expect(important).toBeGreaterThan(normal)
  })
})
