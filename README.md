# context-window-manager

Manages LLM context window for long conversations. Automatically trims message history when approaching token limits — without losing the most important context.

## How It Works
```
New message added
      ↓
Token count exceeds budget?
      ↓ yes
Trim strategy runs
      ↓
oldest  — removes oldest messages first
middle  — removes middle messages first
scored  — removes lowest-scored messages first
      ↓
Pinned and system messages always preserved
```

## Features

- Three trim strategies — oldest, middle, scored
- Pin messages to protect them from trimming
- Importance scoring — recency, keywords, message length
- Configurable budget — maxTokens, systemTokens, reserveTokens
- Full stats — utilization %, token count, pinned count
- Auto-trim on getMessages()

## Usage
```typescript
import { ContextWindowManager } from "./src/window"

const manager = new ContextWindowManager({
  maxTokens:     4000,
  reserveTokens: 300,
  strategy:      "scored",
})

manager.add("system", "You are a helpful assistant.", { pinned: true })
manager.add("user",      "Hello!")
manager.add("assistant", "Hi there!")

const trimResult = manager.fit()
console.log(`Removed: ${trimResult.removed} messages`)

const messages = manager.getMessages()
console.log(manager.stats())
```

## Trim Strategies

| Strategy | Description | Best for |
|---|---|---|
| `oldest` | Removes oldest non-pinned messages | General conversations |
| `middle` | Removes middle messages, keeps start and end | Narratives |
| `scored` | Removes lowest importance messages | Complex sessions |

## Test
```bash
npm install
npm test
```

## Project Structure
```
context-window-manager/
├── src/
│   ├── index.ts     # Demo with OpenAI
│   ├── window.ts    # ContextWindowManager core
│   ├── tokenizer.ts # Token estimation
│   ├── scorer.ts    # Message importance scoring
│   └── types.ts     # Interfaces and types
├── tests/
│   └── window.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Author

**Szymon Wypler** 
