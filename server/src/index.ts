import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT } from "./agent/systemPrompt.js";
import { buildPrompt } from "./agent/transcript.js";
import { createManualMcpServer, MANUAL_TOOL_NAMES } from "./tools/manualTools.js";
import type { ChatRequestBody, ChatStreamEvent } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

const PORT = Number(process.env.PORT ?? 3001);
const MODEL = process.env.AGENT_MODEL ?? "claude-opus-4-8";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[warn] ANTHROPIC_API_KEY is not set. Copy .env.example to .env at the repo root and add your key.",
  );
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post("/api/chat", async (req, res) => {
  const body = req.body as ChatRequestBody;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  let prompt: string;
  try {
    prompt = buildPrompt(body.messages);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const emit = (event: ChatStreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  try {
    const manualServer = createManualMcpServer((displayEvent) => emit(displayEvent));
    const stream = query({
      prompt,
      options: {
        model: MODEL,
        systemPrompt: SYSTEM_PROMPT,
        // Disable every built-in Claude Code tool (Bash, Read, Write, WebSearch, ...) —
        // this agent may only look at the manual and render artifacts.
        tools: [],
        mcpServers: { manual: manualServer },
        allowedTools: MANUAL_TOOL_NAMES,
        includePartialMessages: true,
        persistSession: false,
        maxTurns: 14,
        abortController,
        stderr: (data) => {
          if (data.trim()) console.error("[claude-agent-sdk]", data.trim());
        },
      },
    });

    for await (const message of stream) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          emit({ type: "text_delta", text: event.delta.text });
        }
      } else if (message.type === "system" && message.subtype === "init") {
        const failed = message.mcp_servers.filter((s) => s.status !== "connected");
        if (failed.length > 0) {
          console.error("[claude-agent-sdk] MCP server(s) failed to connect:", failed);
        }
      } else if (message.type === "result") {
        if (message.subtype !== "success") {
          emit({ type: "error", message: `Agent stopped early: ${message.subtype}` });
        }
        emit({ type: "done", costUsd: message.total_cost_usd ?? null });
      }
    }
  } catch (err) {
    if (!abortController.signal.aborted) {
      console.error("[api/chat] error:", err);
      emit({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
    }
  } finally {
    res.end();
  }
});

// Serve the built frontend in production (npm run build && npm start).
// In dev, the Vite dev server (web/) handles the UI and proxies /api here.
const WEB_DIST = path.join(REPO_ROOT, "web", "dist");
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Vulcan OmniPro 220 agent server listening on http://localhost:${PORT}`);
});
