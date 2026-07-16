import type { ChatMessage } from "../types";
import { ImageCard } from "./ImageCard";
import { ArtifactFrame } from "./ArtifactFrame";

export function MessageBubble({
  message,
  isStreaming,
  onOpenImage,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  onOpenImage: (src: string, label: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`message message--${message.role}`}>
      <div className="message__avatar" aria-hidden="true">
        {isUser ? "You" : "⚡"}
      </div>
      <div className="message__content">
        {message.text ? (
          <div className="message__text">{message.text}</div>
        ) : isStreaming ? (
          <div className="message__typing" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {message.displays && message.displays.length > 0 && (
          <div className="message__displays">
            {message.displays.map((display, i) =>
              display.type === "image" ? (
                <ImageCard key={`${display.manual}-${display.page}-${i}`} display={display} onOpen={onOpenImage} />
              ) : (
                <ArtifactFrame key={display.id} display={display} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
