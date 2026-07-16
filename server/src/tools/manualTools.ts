import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { MANUALS, isValidManual, pageImageSrc, type ManualKey } from "../knowledge/manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/tools -> server/src -> server -> repo root -> web/public/manual
const MANUAL_IMAGES_ROOT = path.resolve(__dirname, "../../../web/public/manual");

export type DisplayEvent =
  | { type: "image"; manual: ManualKey; page: number; src: string; label: string }
  | { type: "artifact"; id: string; title: string; html: string };

const MAX_PAGES_PER_CALL = 10;

/**
 * Builds a fresh MCP server (with fresh tool handlers) for a single request,
 * so each handler can close over that request's `emit` callback and push
 * display events onto that request's SSE stream in real time.
 */
export function createManualMcpServer(emit: (event: DisplayEvent) => void) {
  const readManualPages = tool(
    "read_manual_pages",
    "Look at specific pages of one of the three source PDFs by rendering them as images you can see. " +
      "This is your ONLY way to read the manual — you have no pre-built summary of its contents. " +
      "Every page you read here is also shown to the user inline in the chat, so prefer calling this " +
      "over describing a diagram/table/photo from memory. Ground every specific number or instruction " +
      "in a page you actually looked at (in this call or earlier in the conversation) — never guess.",
    {
      manual: z
        .enum(["owner-manual", "quick-start-guide", "selection-chart"])
        .describe(
          "Which document: 'owner-manual' (48 pages, the full Owner's Manual & Safety Instructions — " +
            "page 2 is its own Table of Contents, read that first if you don't know where something is), " +
            "'quick-start-guide' (2 pages), or 'selection-chart' (1 page, the 'How to Choose a Welder' poster).",
        ),
      pages: z
        .array(z.number().int().min(1))
        .min(1)
        .max(MAX_PAGES_PER_CALL)
        .describe(
          `Which page number(s) to read, 1-indexed (max ${MAX_PAGES_PER_CALL} per call). ` +
            "You can pass several pages at once, including across a range you want to cross-reference.",
        ),
      reason: z
        .string()
        .optional()
        .describe("Optional one-line caption describing why you're showing this page, shown to the user above the image."),
    },
    async ({ manual, pages, reason }) => {
      if (!isValidManual(manual)) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown manual "${manual}".` }],
        };
      }
      const meta = MANUALS[manual];
      const invalid = pages.filter((p) => p < 1 || p > meta.pageCount);
      if (invalid.length > 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `${manual} only has ${meta.pageCount} page(s). Invalid page number(s): ${invalid.join(", ")}.`,
            },
          ],
        };
      }

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
      for (const page of pages) {
        const padded = String(page).padStart(2, "0");
        const filePath = path.join(MANUAL_IMAGES_ROOT, manual, `page-${padded}.png`);
        const bytes = await readFile(filePath);
        const label = `${meta.label} — page ${page} of ${meta.pageCount}`;
        content.push({ type: "text", text: label });
        content.push({ type: "image", data: bytes.toString("base64"), mimeType: "image/png" });
        emit({
          type: "image",
          manual,
          page,
          src: pageImageSrc(manual, page),
          label: reason?.trim() || label,
        });
      }

      return { content };
    },
  );

  const createArtifact = tool(
    "create_artifact",
    "Render a self-contained interactive HTML artifact for the user — a duty-cycle calculator, a " +
      "troubleshooting flowchart, a settings configurator, a redrawn diagram, etc. Use this when a " +
      "question is too cognitively hard to answer in prose alone and something interactive or visual " +
      "would explain it better. ALWAYS read the relevant manual page(s) with read_manual_pages first so " +
      "any numbers you build into the artifact (durations, amperages, voltages, gauges) are grounded in " +
      "what the manual actually says, not assumed. The HTML must be fully self-contained: inline <style> " +
      "and <script> only, no external network requests (it renders in a sandboxed iframe with no network " +
      "access). Keep it visually clean and legible in both light and dark host pages.",
    {
      title: z.string().describe("Short human-readable title shown above the artifact."),
      html: z
        .string()
        .describe(
          "A complete, self-contained HTML document (or fragment) with inline CSS/JS. No external " +
            "scripts, stylesheets, fonts, or images from the network.",
        ),
    },
    async ({ title, html }) => {
      const id = `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      emit({ type: "artifact", id, title, html });
      return {
        content: [{ type: "text", text: `Rendered interactive artifact "${title}" for the user.` }],
      };
    },
  );

  return createSdkMcpServer({
    name: "manual",
    version: "1.0.0",
    tools: [readManualPages, createArtifact],
  });
}

export const MANUAL_TOOL_NAMES = ["mcp__manual__read_manual_pages", "mcp__manual__create_artifact"];
