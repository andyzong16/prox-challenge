import type { DisplayEvent } from "../types";

type ImageDisplay = Extract<DisplayEvent, { type: "image" }>;

export function ImageCard({ display, onOpen }: { display: ImageDisplay; onOpen: (src: string, label: string) => void }) {
  return (
    <figure className="image-card" onClick={() => onOpen(display.src, display.label)}>
      <img src={display.src} alt={display.label} loading="lazy" />
      <figcaption>{display.label}</figcaption>
    </figure>
  );
}
