import { useEffect, useRef, useState } from "react";
import type { ChatMessage, DisplayEvent } from "./types";
import { streamChat } from "./api";
import { MessageBubble } from "./components/MessageBubble";

const SUGGESTIONS = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?",
  "Build me a settings configurator: process + material + thickness -> wire speed and voltage.",
];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<{ text: string; displays: DisplayEvent[] } | null>(null);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", text: trimmed };
    const history = [...messages, userMessage];
    setMessages(history);
    setDraft("");
    setError(null);
    setIsStreaming(true);
    setPending({ text: "", displays: [] });

    let textSoFar = "";
    const displaysSoFar: DisplayEvent[] = [];
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        history,
        (event) => {
          if (event.type === "text_delta") {
            textSoFar += event.text;
            setPending({ text: textSoFar, displays: [...displaysSoFar] });
          } else if (event.type === "image" || event.type === "artifact") {
            displaysSoFar.push(event);
            setPending({ text: textSoFar, displays: [...displaysSoFar] });
          } else if (event.type === "error") {
            setError(event.message);
          } else if (event.type === "done") {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", text: textSoFar, displays: displaysSoFar },
            ]);
            setPending(null);
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Something went wrong talking to the agent.");
      }
      if (textSoFar || displaysSoFar.length > 0) {
        setMessages((prev) => [...prev, { role: "assistant", text: textSoFar, displays: displaysSoFar }]);
      }
      setPending(null);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <img className="app__logo" src="/product.webp" alt="Vulcan OmniPro 220" />
        <div>
          <h1>Vulcan OmniPro 220 Welding Assistant</h1>
          <p>Ask anything about setup, settings, or troubleshooting</p>
        </div>
      </header>

      <div className="app__body" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Try one of these, or ask your own question:</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={isStreaming}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <MessageBubble key={i} message={message} onOpenImage={(src, label) => setLightbox({ src, label })} />
        ))}

        {pending && (
          <MessageBubble
            message={{ role: "assistant", text: pending.text, displays: pending.displays }}
            isStreaming
            onOpenImage={(src, label) => setLightbox({ src, label })}
          />
        )}

        {error && <div className="error-banner">⚠ {error}</div>}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          value={draft}
          placeholder="Ask about setup, settings, or troubleshooting…"
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button type="submit" disabled={isStreaming || !draft.trim()}>
          {isStreaming ? "…" : "Send"}
        </button>
      </form>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt={lightbox.label} />
          <div className="lightbox__caption">{lightbox.label}</div>
        </div>
      )}
    </div>
  );
}
