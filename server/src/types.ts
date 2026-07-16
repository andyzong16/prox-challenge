import type { DisplayEvent } from "./tools/manualTools.js";

/** One turn of conversation, as stored/sent by the client. The server is
 * intentionally stateless across requests: the client resends the full
 * history each turn (like the underlying Messages API), and the server
 * folds it into a single prompt string for the Agent SDK. */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Images/artifacts the assistant produced during this turn, if any. */
  displays?: DisplayEvent[];
}

export interface ChatRequestBody {
  messages: ChatMessage[];
}

/** Server-Sent Event payloads streamed from POST /api/chat. */
export type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | DisplayEvent
  | { type: "done"; costUsd: number | null }
  | { type: "error"; message: string };
