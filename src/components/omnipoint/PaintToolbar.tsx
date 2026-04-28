// PaintToolbar — MS Paint–style floating toolbox shown while the cursor is in
// "draw" mode. Mutates the shared PaintStore; BrowserCursor reads from it on
// every frame so changes apply instantly to the next stroke.

import { PaintStore, type PenTool, type ShapeTool, type Tool } from "@/lib/omnipoint/PaintStore";
import { usePaint, usePaintHistory } from "@/hooks/usePaint";
import { exportPng, exportPdf, sharePng } from "@/lib/omnipoint/PaintExport";

interface Props {
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onCrop: () => void;
  onTogglePinchOverlay: () => void;
  pinchOverlayOn: boolean;
  getCanvas: () => HTMLCanvasElement | null;
}

const SWATCHES = [
  "#000000", "#ffffff", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
  "#6366f1", "#a855f7", "#ec4899", "#78716c",
];

const SIZE_PRESETS = [2, 4, 8, 16, 28];

const PEN_TOOLS: { id: PenTool; label: string; icon: string }[] = [
  { id: "pen",         label: "Pen",         icon: "✎" },
  { id: "marker",      label: "Marker",      icon: "▰" },
  { id: "highlighter", label: "Highlighter", icon: "▤" },
  { id: "eraser",      label: "Eraser",      icon: "⌫" },
];

const SHAPE_TOOLS: { id: ShapeTool; label: string; icon: string }[] = [
  { id: "line",    label: "Line",    icon: "╱" },
  { id: "rect",    label: "Rect",    icon: "▭" },
  { id: "ellipse", label: "Ellipse", icon: "◯" },
  { id: "arrow",   label: "Arrow",   icon: "➜" },
];

const FILL_TOOLS: { id: "fill"; label: string; icon: string }[] = [
  { id: "fill", label: "Fill bucket", icon: "🪣" },
];

const SPECIAL_TOOLS: { id: "picker" | "spray" | "text" | "select" | "polygon" | "curve"; label: string; icon: string }[] = [
  { id: "picker",  label: "Color picker (eyedropper)", icon: "💧" },
  { id: "spray",   label: "Spray / airbrush",          icon: "✺" },
  { id: "text",    label: "Text (type on keyboard)",   icon: "T" },
  { id: "select",  label: "Select & move",             icon: "▢" },
  { id: "polygon", label: "Polygon (double-pinch closes)", icon: "◇" },
  { id: "curve",   label: "Curve (3-point bezier)",    icon: "ᔕ" },
];

export function PaintToolbar({
  onClear, onUndo, onRedo, onSave, onCrop,
  onTogglePinchOverlay, pinchOverlayOn, getCanvas,
}: Props) {
  const paint = usePaint();
  const history = usePaintHistory();

  const setTool = (tool: Tool) => PaintStore.set({ tool });
  const setColor = (color: string) => PaintStore.set({ color });
  const setSize = (size: number) => PaintStore.set({ size });
  const setSprayDensity = (sprayDensity: number) => PaintStore.set({ sprayDensity });
  const setFontSize = (fontSize: number) => PaintStore.set({ fontSize });

  const handleExportPng = () => { const c = getCanvas(); if (c) exportPng(c); };
  const handleExportPdf = () => { const c = getCanvas(); if (c) exportPdf(c); };
  const handleShare = () => { const c = getCanvas(); if (c) void sharePng(c); };

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 panel backdrop-blur px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3 max-w-[calc(100vw-1rem)] flex-wrap justify-center overflow-y-auto max-h-[40vh]">
      <Group label="PENS">
        {PEN_TOOLS.map((t) => (
          <ToolBtn key={t.id} active={paint.tool === t.id} onClick={() => setTool(t.id)} title={t.label}>
            <span className="text-base leading-none">{t.icon}</span>
          </ToolBtn>
        ))}
      </Group>

      <Divider />

      <Group label="SHAPES">
        {SHAPE_TOOLS.map((t) => (
          <ToolBtn key={t.id} active={paint.tool === t.id} onClick={() => setTool(t.id)} title={t.label}>
            <span className="text-base leading-none">{t.icon}</span>
          </ToolBtn>
        ))}
      </Group>

      <Divider />

      <Group label="FILL">
        {FILL_TOOLS.map((t) => (
          <ToolBtn key={t.id} active={paint.tool === t.id} onClick={() => setTool(t.id)} title={t.label}>
            <span className="text-base leading-none">{t.icon}</span>
          </ToolBtn>
        ))}
      </Group>

      <Divider />

      <Group label="TOOLS">
        {SPECIAL_TOOLS.map((t) => (
          <ToolBtn key={t.id} active={paint.tool === t.id} onClick={() => setTool(t.id)} title={t.label}>
            <span className="text-base leading-none">{t.icon}</span>
          </ToolBtn>
        ))}
      </Group>

      <Divider />

      <Group label="COLOR">
        <div className="flex items-center gap-1">
          {SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`w-5 h-5 rounded-sm border transition-transform hover:scale-110 ${
                paint.color.toLowerCase() === c.toLowerCase()
                  ? "border-foreground ring-2 ring-foreground/40"
                  : "border-border"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="ml-1 cursor-pointer relative w-6 h-6 rounded-sm border border-border overflow-hidden">
            <input
              type="color"
              value={paint.color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
              title="Custom color"
            />
            <span className="absolute inset-0 grid place-items-center text-[10px] pointer-events-none"
              style={{ backgroundColor: paint.color, color: contrastText(paint.color) }}>
              +
            </span>
          </label>
        </div>
      </Group>

      <Divider />

      <Group label="SIZE">
        <div className="flex items-center gap-2">
          {SIZE_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              title={`${s}px`}
              className={`w-7 h-7 grid place-items-center border transition-colors ${
                paint.size === s
                  ? "border-primary text-primary bg-primary/10"
                  : "hairline text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: Math.min(s, 18), height: Math.min(s, 18) }}
              />
            </button>
          ))}
          <input
            type="range"
            min={1}
            max={40}
            value={paint.size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-20 accent-primary"
            title={`${paint.size}px`}
          />
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground w-8">
            {paint.size}px
          </span>
        </div>
      </Group>

      <Divider />

      <Group label={paint.tool === "spray" ? "DENSITY" : paint.tool === "text" ? "FONT" : "EXTRAS"}>
        {paint.tool === "spray" ? (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={4}
              max={40}
              value={paint.sprayDensity}
              onChange={(e) => setSprayDensity(Number(e.target.value))}
              className="w-20 accent-primary"
              title={`${paint.sprayDensity} drops`}
            />
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground w-10">
              {paint.sprayDensity}
            </span>
          </div>
        ) : paint.tool === "text" ? (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={10}
              max={96}
              value={paint.fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-20 accent-primary"
              title={`${paint.fontSize}px`}
            />
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground w-10">
              {paint.fontSize}px
            </span>
          </div>
        ) : (
          <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground/60">
            (tool-specific)
          </span>
        )}
      </Group>

      <Divider />

      <Group label="ACTIONS">
        <ActionBtn onClick={onUndo} disabled={!history.canUndo} title="Undo (open palm)">↶ UNDO</ActionBtn>
        <ActionBtn onClick={onRedo} disabled={!history.canRedo} title="Redo">↷ REDO</ActionBtn>
        {paint.tool === "select" && (
          <ActionBtn onClick={onCrop} title="Crop to selection">⛶ CROP</ActionBtn>
        )}
        <ActionBtn onClick={onSave} title="Quick save PNG">⤓ PNG</ActionBtn>
        <ActionBtn onClick={handleExportPng} title="Export PNG + JSON metadata">⇪ PNG+META</ActionBtn>
        <ActionBtn onClick={handleExportPdf} title="Export PDF with metadata">⇪ PDF</ActionBtn>
        <ActionBtn onClick={handleShare} title="Share canvas">↗ SHARE</ActionBtn>
        <ActionBtn
          onClick={onTogglePinchOverlay}
          title="Toggle pinch confidence monitor"
        >
          {pinchOverlayOn ? "◉ PINCH" : "○ PINCH"}
        </ActionBtn>
        <ActionBtn onClick={onClear} title="Clear canvas" tone="danger">✕ CLEAR</ActionBtn>
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function ToolBtn({
  active, onClick, title, children,
}: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 sm:w-8 sm:h-8 grid place-items-center border transition-colors touch-manipulation active:scale-95 ${
        active
          ? "border-primary text-primary bg-primary/10"
          : "hairline text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ActionBtn({
  onClick, disabled, title, tone, children,
}: {
  onClick: () => void; disabled?: boolean; title: string; tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`font-mono text-[10px] tracking-[0.2em] px-3 h-9 sm:px-2 sm:h-7 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation active:scale-95 ${
        tone === "danger"
          ? "hairline text-destructive hover:bg-destructive/10"
          : "hairline text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-9 bg-border self-end" />;
}

function contrastText(hex: string): string {
  // Pick black/white text for the custom-color swatch label based on luminance.
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#000";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#000" : "#fff";
}
