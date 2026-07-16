import type { ChatMessage } from "../types.js";

/**
 * Folds the client-provided message history into a single prompt string.
 * The server is stateless: rather than relying on the Agent SDK's own
 * session persistence, each request replays the whole conversation as
 * plain text so a fresh `query()` call has full context. Prior displays
 * (images/artifacts) are summarized as short bracketed breadcrumbs so the
 * model knows what it already showed without replaying HTML/base64 back
 * into its own context.
 */
export function buildPrompt(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    throw new Error("messages must not be empty");
  }
  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    throw new Error("the last message must be from the user");
  }

  const history = messages.slice(0, -1);
  const parts: string[] = [];

  if (history.length > 0) {
    parts.push("Conversation so far:");
    for (const message of history) {
      const speaker = message.role === "user" ? "User" : "Assistant";
      const breadcrumbs = (message.displays ?? [])
        .map((d) => (d.type === "image" ? `[shown: ${d.manual} p.${d.page}]` : `[artifact: ${d.title}]`))
        .join(" ");
      const line = breadcrumbs ? `${message.text}\n${breadcrumbs}` : message.text;
      parts.push(`${speaker}: ${line}`);
    }
    parts.push("");
    parts.push("Respond only to the new message below, using the history above for context.");
    parts.push("");
  }

  parts.push(`User: ${last.text}`);
  return parts.join("\n");
}
