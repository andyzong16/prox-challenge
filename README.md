# Vulcan OmniPro 220 — Welding Assistant

A multimodal support agent for the Vulcan OmniPro 220 welder, built on the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview). It answers setup/settings/troubleshooting questions by actually reading the source PDFs at query time — via its own vision, page by page — and shows the user the real manual pages and generated interactive artifacts inline, instead of describing them in prose.

The original assignment prompt is preserved in [CHALLENGE.md](CHALLENGE.md).

## Quick start

```bash
git clone <this-repo>
cd prox-challenge
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm install
npm run dev
```

Open **http://localhost:5173**. That's it — `npm run dev` runs the Express backend (`:3001`) and the Vite frontend (`:5173`, proxying `/api` to the backend) together via `concurrently`.

- `AGENT_MODEL` (optional, in `.env`) overrides the model — defaults to `claude-opus-4-8`.
- `PORT` (optional) overrides the backend port — defaults to `3001`.

## Try it

- "What's the duty cycle for MIG welding at 200A on 240V?"
- "I'm getting porosity in my flux-cored welds. What should I check?"
- "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?"
- "Build me a settings configurator: process + material + thickness → wire speed and voltage."

## How it works

```
Browser (React/Vite)  ──POST /api/chat──▶  Express (SSE)  ──▶  Claude Agent SDK query()
      ▲                                         │                       │
      │                images / artifacts       │                       ▼
      └─────────────────────────────────────────┘        custom in-process MCP tools:
                                                           read_manual_pages · create_artifact
```

The frontend sends the whole conversation so far as JSON; the backend folds it into a single prompt string and calls `query()` fresh per request — the server holds no session state of its own (see "Design decisions" below). The response comes back as Server-Sent Events: text deltas as Claude streams them, plus `image`/`artifact` events emitted the instant a tool fires, so the manual page or the generated widget appears inline exactly when the agent looks at it or builds it.

### Knowledge extraction — the agent reads the actual manual, not a summary

This was the most important decision in the project, and I changed course on it once already. My first pass hand-transcribed the manual's tables and facts into a big markdown string embedded in the system prompt — classic RAG-lite. I scrapped it: it meant *my* reading of the manual, not the agent's, was what actually got tested, and any transcription slip on my part becomes an invisible, hard-to-catch bug baked into every answer.

Instead:

- `files/*.pdf` are rendered once, offline, to PNG page images via `pdftoppm` (`web/public/manual/<doc>/page-NN.png` — 51 images total, ~18MB, committed to the repo). This is a pure rasterization step, not a comprehension step — no facts, tables, or summaries are extracted, just pixels.
- The agent's only source of product knowledge is the `read_manual_pages` tool (`server/src/tools/manualTools.ts`), which loads the requested page(s) as real images and passes them to Claude as native image content in the tool result — Claude reads them with its own vision, live, every time.
- The agent has **no pre-built table of contents or index either**. The system prompt (`server/src/agent/systemPrompt.ts`) just tells it that page 2 of the 48-page owner's manual is *that document's own* Table of Contents, and to read it first if it doesn't already know where something is — the same way a person would open the manual. From there it decides which pages to open, including cross-referencing pages across the three source documents (owner's manual, quick-start guide, selection chart) for questions that span them.
- Every number the agent states (amperage, voltage, SCFH, gauge, duty-cycle %) is grounded in a page it just looked at this turn, or earlier in the same conversation. The system prompt explicitly forbids answering from assumed/general welding knowledge.

The only content-shaped thing I wrote by hand is a few sentences of *strategy* ("read p.2 first if you're not sure where to look") — zero manual content is pre-authored anywhere in the codebase.

### Multimodal responses

`read_manual_pages` does double duty: the same tool call that grounds the agent's answer also pushes the page image straight to the frontend via SSE, so "the agent looked at page 24" and "the user sees page 24" are the same event. This is why diagrams, the polarity setup pages, the weld-diagnosis charts, the wiring schematic, and the process-selection poster show up as real images rather than descriptions — showing them costs the agent nothing extra over reading them.

For anything not already a picture in the manual — a duty-cycle calculator, a troubleshooting flowchart, a settings configurator — the agent calls `create_artifact` with a self-contained HTML/CSS/JS string. The frontend renders it in a sandboxed `<iframe sandbox="allow-scripts">` with no `allow-same-origin`, matching how Claude.ai artifacts isolate untrusted generated code: scripts run, but the iframe can't touch this page's cookies/storage, navigate it, or reach the network. The system prompt instructs the agent to read the relevant manual pages *before* building an artifact, so any numbers baked into it (e.g. duty-cycle percentages) come from the same grounding as a text answer would.

### Design decisions & tradeoffs

- **Stateless backend.** The client resends the full message history every turn (mirroring how the raw Messages API works), and the server builds one prompt string per request (`server/src/agent/transcript.ts`) rather than using the Agent SDK's own session persistence/resume. Simpler to reason about, nothing to garbage-collect, and it survives a server restart mid-conversation — at the cost of not getting the SDK's built-in session caching.
- **Every built-in Claude Code tool is disabled** (`tools: []`) — Bash, Read, Write, WebSearch, etc. all off. `allowedTools` only lists the two custom MCP tools. This agent should only ever look at the manual or render an artifact, nothing else.
- **Token-level streaming** via `includePartialMessages: true`, so text appears incrementally rather than in one lump per turn.
- **Model defaults to `claude-opus-4-8`.** This is a vision-heavy, correctness-critical, multi-hop-reasoning task (cross-referencing pages, reading dense tables/diagrams), which is where the extra intelligence pays for itself; it's configurable via `AGENT_MODEL` if you'd rather trade some accuracy for lower cost. Each query typically reads a handful of page images, so cost is meaningfully higher than a text-only chatbot — expect roughly $0.05–$0.40 per query depending on how many pages/artifacts it produces (you're billed directly by Anthropic; there's no markup or proxy here).

## Project structure

```
files/                        source PDFs (owner's manual, quick-start guide, selection chart)
web/public/manual/<doc>/       pre-rendered page PNGs (offline, one-time, via pdftoppm)
server/src/
  index.ts                    Express app, SSE /api/chat endpoint
  agent/systemPrompt.ts       the agent's instructions (strategy only, no manual content)
  agent/transcript.ts         folds client message history into one prompt string
  tools/manualTools.ts        read_manual_pages + create_artifact (Agent SDK custom MCP tools)
  knowledge/manifest.ts       page counts / file paths for the two tools (plumbing, not content)
web/src/
  App.tsx                     chat state machine, SSE consumption
  components/                 MessageBubble, ImageCard (+ lightbox), ArtifactFrame (sandboxed iframe)
```

## Known limitations

- The owner's manual repeatedly points to a **settings chart printed on the inside of the welder's door** (shielding-gas type/flow by material) that isn't included among the provided files — only `owner-manual.pdf`, `quick-start-guide.pdf`, and `selection-chart.pdf` were. If asked for anything only covered by that physical sticker, the agent is instructed to say so rather than invent a number.
- No auth, no multi-user session storage, no persistence across a server restart — this is a local take-home demo, not a hardened multi-tenant service.
- The chat holds one conversation per browser session (in React state); refreshing the page starts over.
