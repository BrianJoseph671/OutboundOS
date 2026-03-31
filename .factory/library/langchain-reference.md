# LangChain.js / LangGraph Reference

Quick reference for Phase 2 agent implementation.

## createReactAgent

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-20250514",
  temperature: 0.3,
  maxTokens: 4096,
  // ANTHROPIC_API_KEY read from env automatically
});

const myTool = tool(
  async ({ param1, param2 }) => {
    return JSON.stringify({ result: "..." });
  },
  {
    name: "my_tool",
    description: "Description for the LLM",
    schema: z.object({
      param1: z.string().describe("Description of param1"),
      param2: z.number().optional().describe("Description of param2"),
    }),
  }
);

const agent = createReactAgent({
  llm: model,
  tools: [myTool],
  prompt: "System prompt here",
});

// Invoke
const result = await agent.invoke({
  messages: [{ role: "user", content: "Do something" }],
});
const lastMsg = result.messages[result.messages.length - 1];
```

## LangSmith Tracing

Zero-config via env vars:
```
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...
LANGCHAIN_PROJECT=outboundos
```

## Package Versions
- @langchain/core ^0.3.0
- @langchain/anthropic ^0.3.0
- @langchain/langgraph ^0.2.0
- langsmith ^0.5.0

## Key Notes
- Use `tool()` (not DynamicStructuredTool) — simpler, recommended
- Always use `.describe()` on Zod fields — descriptions go to the LLM
- Agent returns { messages: BaseMessage[] } — last message is the answer
- `prompt` param replaces deprecated `messageModifier`/`stateModifier`
