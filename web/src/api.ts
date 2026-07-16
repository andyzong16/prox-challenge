import type { ChatMessage, ChatStreamEvent } from "./types";

/**
 * POSTs the full conversation to /api/chat and parses the SSE response
 * (text/event-stream over a plain fetch, since EventSource doesn't support
 * POST bodies). Calls onEvent for each `data: {...}` frame as it arrives.
 */
export async function streamChat(
  messages: ChatMessage[],
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice("data: ".length)) as ChatStreamEvent);
      } catch {
        // ignore malformed frame
      }
    }
  }
}
