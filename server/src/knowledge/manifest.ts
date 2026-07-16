/**
 * Registry of source documents and their pre-rendered page images.
 * Page images live in web/public/manual/<key>/page-NN.png (served as static
 * assets by Vite in dev and by Express in production) and were rendered
 * once, offline, from the PDFs in files/ — see README "Knowledge extraction".
 */
export type ManualKey = "owner-manual" | "quick-start-guide" | "selection-chart";

export interface ManualMeta {
  key: ManualKey;
  label: string;
  pageCount: number;
}

export const MANUALS: Record<ManualKey, ManualMeta> = {
  "owner-manual": { key: "owner-manual", label: "Owner's Manual & Safety Instructions", pageCount: 48 },
  "quick-start-guide": { key: "quick-start-guide", label: "Quick Start Guide", pageCount: 2 },
  "selection-chart": { key: "selection-chart", label: "How to Choose a Welder (process selection chart)", pageCount: 1 },
};

export function isValidManual(value: string): value is ManualKey {
  return value in MANUALS;
}

export function pageImageSrc(manual: ManualKey, page: number): string {
  const padded = String(page).padStart(2, "0");
  return `/manual/${manual}/page-${padded}.png`;
}
