// Mirrors server/src/types.ts and server/src/tools/manualTools.ts (DisplayEvent).
// Duplicated here rather than shared across the two workspace packages to
// keep the client build fully independent of server source files.

export type ManualKey = "owner-manual" | "quick-start-guide" | "selection-chart";

export type DisplayEvent =
  | { type: "image"; manual: ManualKey; page: number; src: string; label: string }
  | { type: "artifact"; id: string; title: string; html: string };

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  displays?: DisplayEvent[];
}

export type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | DisplayEvent
  | { type: "done"; costUsd: number | null }
  | { type: "error"; message: string };
