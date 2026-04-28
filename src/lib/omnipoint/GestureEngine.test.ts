// Verifies the gesture/draw contract that pinch-draw relies on:
//   • clickThreshold < releaseThreshold (hysteresis exists)
//   • the BrowserCursor draw-engagement now relies ONLY on the engine's
//     `click` / `drag` gesture, not raw pinchDistance.

import { describe, it, expect } from "vitest";
import { defaultConfig } from "./GestureEngine";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("GestureEngine config", () => {
  it("has hysteresis: releaseThreshold > clickThreshold", () => {
    expect(defaultConfig.releaseThreshold).toBeGreaterThan(
      defaultConfig.clickThreshold,
    );
  });

  it("pinch thresholds are hand-size ratios, not raw distances", () => {
    // Ratios live in (0, 1.5). Raw 3D distances would be ~0.02..0.2.
    expect(defaultConfig.clickThreshold).toBeGreaterThan(0.1);
    expect(defaultConfig.clickThreshold).toBeLessThan(1.5);
  });
});

describe("BrowserCursor draw engagement", () => {
  it("never engages drawing from raw pinchDistance shortcut", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "BrowserCursor.ts"), "utf8");
    // The buggy pattern was: pinchDistance > 0 && pinchDistance < 0.55
    expect(src).not.toMatch(/pinchDistance\s*<\s*0\.\d+/);
  });
});
