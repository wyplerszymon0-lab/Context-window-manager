import * as dotenv from "dotenv"
import OpenAI from "openai"
import { ContextWindowManager } from "./window"

dotenv.config()

const client  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" })
const manager = new ContextWindowManager({
  maxTokens:     4000,
  reserveTokens: 300,
  strategy:      "oldest",
})

async function chat(userMessage: string): Promise<string> {
  manager.add("user", userMessage)

  const trimResult = manager.fit()
  if (trimResult.removed > 0) {
    console.log(`  [window] trimmed ${trimResult.removed} messages (${trimResult.tokensBefore} → ${trimResult.tokensAfter} tokens)`)
  }

  const messages = manager.getMessages()
  const response = await client.chat.completions.create({
    model:    "gpt-4o-mini",
    messages: messages.map(m => ({ role: m.role as any, content: m.content })),
    max_tokens: 500,
  })

  const reply = response.choices[0]?.message?.content ?? ""
  manager.add("assistant", reply)

  const stats = manager.stats()
  console.log(`  [window] ${stats.totalMessages} messages, ${stats.tokenCount} tokens (${stats.utilizationPct}%)`)

  return reply
}

async function main() {
  manager.add("system", "You are a helpful, concise assistant.", { pinned: true })

  const messages = [
    "What is a context window in LLMs?",
    "How does token counting work?",
    "What happens when the context window is full?",
    "How do different trimming strategies compare?",
    "Can you summarize what we discussed?",
  ]

  for (const msg of messages) {
    console.log(`\nUser: ${msg}`)
    const reply = await chat(msg)
    console.log(`AI:   ${reply.slice(0, 120)}...`)
  }
}

main().catch(console.error)
