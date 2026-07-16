import type { DisplayEvent } from "../types";

type ArtifactDisplay = Extract<DisplayEvent, { type: "artifact" }>;

/**
 * Renders agent-generated HTML in a sandboxed iframe — the same trust
 * boundary Claude.ai artifacts use. `allow-scripts` without
 * `allow-same-origin` gives the iframe an opaque origin: its scripts can
 * run, but it cannot read cookies/storage from this page, cannot navigate
 * the parent, and (with no allow-forms/allow-popups) cannot submit forms or
 * open windows either. Combined with instructing the model to keep
 * artifacts fully self-contained (no external requests), this is safe to
 * render without a second look at the generated HTML.
 */
export function ArtifactFrame({ display }: { display: ArtifactDisplay }) {
  return (
    <div className="artifact-frame">
      <div className="artifact-frame__title">{display.title}</div>
      <div className="artifact-frame__body">
        <iframe title={display.title} srcDoc={display.html} sandbox="allow-scripts" />
      </div>
    </div>
  );
}
