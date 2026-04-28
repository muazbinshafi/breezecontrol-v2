// OneEuroFilter — adaptive low-pass filter (Casiez et al. 2012) that's the
// industry standard for jitter-free pointer / hand tracking. Cuts noise when
// the input is still and lets fast motion through with minimal lag.
//
// Tuning:
//   minCutoff  ↓ smoother / more lag      ↑ snappier / more jitter
//   beta       ↑ more responsive on fast motion (recommended 0.005..0.05)

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(minCutoff = 1.0, beta = 0.01, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  setParams(minCutoff: number, beta: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tNowMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tNowMs;
      return x;
    }
    const dt = Math.max(0.001, (tNowMs - this.tPrev) / 1000);
    this.tPrev = tNowMs;

    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = dxHat;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }
}

/** Convenience wrapper for 2D points (x,y) with shared parameters. */
export class OneEuroFilter2D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  constructor(minCutoff = 1.0, beta = 0.01) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
  }
  setParams(minCutoff: number, beta: number) {
    this.fx.setParams(minCutoff, beta);
    this.fy.setParams(minCutoff, beta);
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
  filter(x: number, y: number, tNowMs: number): [number, number] {
    return [this.fx.filter(x, tNowMs), this.fy.filter(y, tNowMs)];
  }
}

/** 3D wrapper — independent per-axis filters with shared params. */
export class OneEuroFilter3D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  private fz: OneEuroFilter;
  constructor(minCutoff = 1.0, beta = 0.01) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
    this.fz = new OneEuroFilter(minCutoff, beta);
  }
  setParams(minCutoff: number, beta: number) {
    this.fx.setParams(minCutoff, beta);
    this.fy.setParams(minCutoff, beta);
    this.fz.setParams(minCutoff, beta);
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
  filter(x: number, y: number, z: number, tNowMs: number): [number, number, number] {
    return [
      this.fx.filter(x, tNowMs),
      this.fy.filter(y, tNowMs),
      this.fz.filter(z, tNowMs),
    ];
  }
}
