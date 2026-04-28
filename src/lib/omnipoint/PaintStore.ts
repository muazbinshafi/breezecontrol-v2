// PaintStore — reactive shared state for the MS Paint–style toolbox.
// BrowserCursor reads from this on every frame; the toolbar UI mutates it.
//
// User-facing prefs (color, size, fontSize, sprayDensity, last tool) are
// auto-persisted to localStorage and re-hydrated on load. The per-stroke
// `tool history` is kept in memory for the active session and exported
// alongside the PNG/PDF when the user shares their canvas.

export type PenTool = "pen" | "marker" | "highlighter" | "eraser";
export type ShapeTool = "line" | "rect" | "ellipse" | "arrow";
export type FillTool = "fill";
export type SpecialTool =
  | "picker"
  | "spray"
  | "text"
  | "select"
  | "polygon"
  | "curve";
export type Tool = PenTool | ShapeTool | FillTool | SpecialTool;

export interface Stroke {
  kind: "free" | ShapeTool;
  tool: PenTool;
  color: string;
  size: number;
  alpha: number;
  composite: GlobalCompositeOperation;
  points: { x: number; y: number }[];
}

export interface PaintSnapshot {
  tool: Tool;
  color: string;
  size: number;
  alpha: number;
  composite: GlobalCompositeOperation;
  /** Active text being typed when tool === "text". Cleared when committed. */
  textBuffer: string;
  /** Where the text caret was placed (canvas pixels). */
  textAnchor: { x: number; y: number } | null;
  /** Font size for the text tool (px). */
  fontSize: number;
  /** Spray density (drops per spatter, 4–40). */
  sprayDensity: number;
}

export interface ToolHistoryEntry {
  ts: number;
  /** "tool" = user picked a tool, "action" = stroke/fill/text committed, etc. */
  kind: "tool" | "action";
  tool: Tool;
  /** Optional human-readable detail (e.g. "fill #22d3a5", "stroke 4px"). */
  detail?: string;
}

const initial: PaintSnapshot = {
  tool: "pen",
  color: "#22d3a5",
  size: 4,
  alpha: 1,
  composite: "source-over",
  textBuffer: "",
  textAnchor: null,
  fontSize: 28,
  sprayDensity: 12,
};

// Persistence ---------------------------------------------------------------
// We persist only the user-tweakable fields. Transient state (textBuffer,
// textAnchor, alpha, composite) is intentionally excluded.
const PERSIST_KEY = "omnipoint.paintPrefs.v1";
type PersistShape = Pick<
  PaintSnapshot,
  "tool" | "color" | "size" | "fontSize" | "sprayDensity"
>;

function loadPrefs(): Partial<PersistShape> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistShape>;
  } catch {
    return {};
  }
}

function savePrefs(s: PaintSnapshot) {
  if (typeof localStorage === "undefined") return;
  try {
    const p: PersistShape = {
      tool: s.tool,
      color: s.color,
      size: s.size,
      fontSize: s.fontSize,
      sprayDensity: s.sprayDensity,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(p));
  } catch {
    /* quota — ignore */
  }
}

let snapshot: PaintSnapshot = { ...initial, ...loadPrefs() };
// Re-derive render hints for the hydrated tool so highlighter/eraser load right.
{
  const hints = deriveRenderHints(snapshot.tool);
  snapshot.alpha = hints.alpha;
  snapshot.composite = hints.composite;
}

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function deriveRenderHints(tool: Tool): { alpha: number; composite: GlobalCompositeOperation } {
  switch (tool) {
    case "highlighter":
      return { alpha: 0.28, composite: "source-over" };
    case "marker":
      return { alpha: 0.95, composite: "source-over" };
    case "eraser":
      return { alpha: 1, composite: "destination-out" };
    default:
      return { alpha: 1, composite: "source-over" };
  }
}

export const PaintStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get(): PaintSnapshot {
    return snapshot;
  },
  set(patch: Partial<PaintSnapshot>) {
    const next = { ...snapshot, ...patch };
    if (patch.tool && patch.alpha === undefined && patch.composite === undefined) {
      const hints = deriveRenderHints(patch.tool);
      next.alpha = hints.alpha;
      next.composite = hints.composite;
    }
    snapshot = next;
    if (
      patch.tool !== undefined ||
      patch.color !== undefined ||
      patch.size !== undefined ||
      patch.fontSize !== undefined ||
      patch.sprayDensity !== undefined
    ) {
      savePrefs(snapshot);
    }
    if (patch.tool !== undefined) {
      ToolHistory.record({ kind: "tool", tool: patch.tool });
    }
    emit();
  },
  isShape(tool: Tool = snapshot.tool): tool is ShapeTool {
    return tool === "line" || tool === "rect" || tool === "ellipse" || tool === "arrow";
  },
  isFill(tool: Tool = snapshot.tool): tool is FillTool {
    return tool === "fill";
  },
  isSpecial(tool: Tool = snapshot.tool): tool is SpecialTool {
    return (
      tool === "picker" || tool === "spray" || tool === "text" ||
      tool === "select" || tool === "polygon" || tool === "curve"
    );
  },
};

// Undo / redo stacks live here so the toolbar buttons and the cursor can
// share them. BrowserCursor pushes a snapshot before each new stroke.
const undoStack: ImageData[] = [];
const redoStack: ImageData[] = [];
const MAX_HISTORY = 30;

export const PaintHistory = {
  push(snap: ImageData) {
    undoStack.push(snap);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    emitHistory();
  },
  undo(): ImageData | null {
    const top = undoStack.pop();
    if (!top) return null;
    redoStack.push(top);
    emitHistory();
    return undoStack[undoStack.length - 1] ?? null;
  },
  redo(): ImageData | null {
    const top = redoStack.pop();
    if (!top) return null;
    undoStack.push(top);
    emitHistory();
    return top;
  },
  clear() {
    undoStack.length = 0;
    redoStack.length = 0;
    emitHistory();
  },
  canUndo() {
    return undoStack.length > 0;
  },
  canRedo() {
    return redoStack.length > 0;
  },
};

const historyListeners = new Set<() => void>();
function emitHistory() {
  for (const l of historyListeners) l();
}
export function subscribeHistory(cb: () => void) {
  historyListeners.add(cb);
  return () => historyListeners.delete(cb);
}

// Tool history --------------------------------------------------------------
// Lightweight running log of every tool switch and committed action this
// session. Surfaced in PNG sidecar / PDF metadata when the user exports.
const MAX_TOOL_HISTORY = 200;
const toolHistory: ToolHistoryEntry[] = [];

export const ToolHistory = {
  record(entry: Omit<ToolHistoryEntry, "ts">) {
    toolHistory.push({ ...entry, ts: Date.now() });
    if (toolHistory.length > MAX_TOOL_HISTORY) toolHistory.shift();
  },
  list(): ToolHistoryEntry[] {
    return [...toolHistory];
  },
  clear() {
    toolHistory.length = 0;
  },
};
