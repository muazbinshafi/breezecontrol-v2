// PaintExport — bundles the current draw canvas into shareable artifacts:
// PNG (with a JSON sidecar containing tool history + active calibration
// profile), PDF (with the same metadata embedded), and a Web-Share fallback.

import jsPDF from "jspdf";
import { ToolHistory, PaintStore } from "./PaintStore";
import { GestureProfileStore } from "./GestureProfiles";
import { GestureSettingsStore } from "./GestureSettings";

export interface ExportMetadata {
  app: "OmniPoint";
  exportedAt: string;
  canvas: { width: number; height: number };
  paint: ReturnType<typeof PaintStore.get>;
  activeProfile: { id: string; name: string } | null;
  calibration: ReturnType<typeof GestureSettingsStore.get>["engineConfig"] | null;
  toolHistory: ReturnType<typeof ToolHistory.list>;
}

export function buildMetadata(canvas: HTMLCanvasElement): ExportMetadata {
  const active = GestureProfileStore.active();
  return {
    app: "OmniPoint",
    exportedAt: new Date().toISOString(),
    canvas: { width: canvas.width, height: canvas.height },
    paint: PaintStore.get(),
    activeProfile: active ? { id: active.id, name: active.name } : null,
    calibration: GestureSettingsStore.get().engineConfig ?? null,
    toolHistory: ToolHistory.list(),
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save PNG with a JSON sidecar (two files). */
export function exportPng(canvas: HTMLCanvasElement) {
  const stamp = Date.now();
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `omnipoint-${stamp}.png`);
  }, "image/png");
  const meta = buildMetadata(canvas);
  const metaBlob = new Blob([JSON.stringify(meta, null, 2)], {
    type: "application/json",
  });
  downloadBlob(metaBlob, `omnipoint-${stamp}.json`);
}

/** Save a PDF with the canvas as the first page and metadata on page 2. */
export function exportPdf(canvas: HTMLCanvasElement) {
  const meta = buildMetadata(canvas);
  const orientation = canvas.width >= canvas.height ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });

  // Page 1: the artwork
  const dataUrl = canvas.toDataURL("image/png");
  pdf.addImage(dataUrl, "PNG", 0, 0, canvas.width, canvas.height);

  // PDF document metadata
  pdf.setProperties({
    title: "OmniPoint Canvas Export",
    subject: meta.activeProfile?.name ?? "Untouched profile",
    author: "OmniPoint HCI",
    keywords: meta.toolHistory.map((e) => e.tool).join(","),
    creator: "OmniPoint",
  });

  // Page 2: human-readable metadata
  pdf.addPage([Math.max(595, canvas.width / 2), Math.max(842, canvas.height / 2)], "p");
  pdf.setFontSize(18);
  pdf.text("OmniPoint — Export Metadata", 40, 50);
  pdf.setFontSize(10);
  let y = 80;
  const lines = [
    `Exported: ${meta.exportedAt}`,
    `Canvas: ${meta.canvas.width} × ${meta.canvas.height}`,
    `Profile: ${meta.activeProfile?.name ?? "—"} (${meta.activeProfile?.id ?? "—"})`,
    "",
    "— Active calibration —",
    meta.calibration
      ? Object.entries(meta.calibration)
          .map(([k, v]) => `  ${k}: ${typeof v === "number" ? v.toFixed(3) : v}`)
          .join("\n")
      : "  (no per-profile calibration recorded)",
    "",
    "— Paint state —",
    `  tool: ${meta.paint.tool}   color: ${meta.paint.color}   size: ${meta.paint.size}px`,
    `  fontSize: ${meta.paint.fontSize}px   sprayDensity: ${meta.paint.sprayDensity}`,
    "",
    `— Tool history (${meta.toolHistory.length} events) —`,
  ];
  for (const line of lines) {
    for (const sub of line.split("\n")) {
      pdf.text(sub, 40, y);
      y += 14;
    }
  }
  for (const e of meta.toolHistory.slice(-40)) {
    const t = new Date(e.ts).toISOString().slice(11, 19);
    pdf.text(`  ${t}  ${e.kind.padEnd(6)} ${e.tool}${e.detail ? "  · " + e.detail : ""}`, 40, y);
    y += 12;
    if (y > pdf.internal.pageSize.getHeight() - 40) {
      pdf.addPage();
      y = 40;
    }
  }

  pdf.save(`omnipoint-${Date.now()}.pdf`);
}

/** Try the Web Share API; fall back to PNG download. */
export async function sharePng(canvas: HTMLCanvasElement): Promise<boolean> {
  const blob: Blob | null = await new Promise((res) =>
    canvas.toBlob((b) => res(b), "image/png"),
  );
  if (!blob) return false;
  const file = new File([blob], `omnipoint-${Date.now()}.png`, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: "OmniPoint canvas",
        text: "Drawn with OmniPoint hand-tracking",
      });
      return true;
    } catch {
      /* fall through */
    }
  }
  exportPng(canvas);
  return false;
}
