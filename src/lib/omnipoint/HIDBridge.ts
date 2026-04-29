// HID Bridge - persistent WebSocket with exponential backoff & heartbeat.
// Sends OmniPoint payload schema to local Linux daemon (ws://localhost:8765).
//
// Lifecycle:
//   connect() opens the persistent stream; if it drops, scheduleReconnect()
//   retries with exponential backoff capped at `maxReconnectAttempts`. On
//   successful reopen we replay a "subscribe" hello so the daemon knows the
//   client wants live motion packets again. emergencyStop() halts everything
//   until rearm() is called.

import { TelemetryStore, type GestureKind } from "./TelemetryStore";
import { BridgeLog } from "./BridgeLog";

export interface MotionPayload {
  event: "motion";
  data: {
    x: number;
    y: number;
    pressure: number;
    gesture: GestureKind;
    hand?: "Left" | "Right";
  };
  timestamp: number;
}

export interface DaemonStatus {
  ok: boolean;
  message: string;
  uinput?: boolean;
  evdev?: boolean;
  screen?: { w: number; h: number };
  version?: string;
  raw?: unknown;
}

export interface PortDiagnostics {
  ok: boolean;
  url: string;
  host: string;
  port: number;
  protocol: string;
  reachable: boolean;
  rttMs: number;
  message: string;
  suggestedUrl?: string;
}

export class HIDBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private backoff = 250;
  private readonly backoffMax = 8000;
  private reconnectAttempts = 0;
  private heartbeatTimer: number | null = null;
  private heartbeatPendingSince = 0;
  private reconnectTimer: number | null = null;
  private lastErrorCode: "refused" | "timeout" | "invalid_url" | null = null;
  private packetCounter = 0;
  private packetWindowStart = performance.now();
  private stopped = false;
  private offlineLog: MotionPayload[] = [];
  private readonly logCap = 200;

  constructor(url: string) {
    this.url = url;
  }

  setUrl(url: string) {
    const nextUrl = url.trim();
    const changed = nextUrl !== this.url;
    if (changed) {
      BridgeLog.push("info", "ws", `Endpoint changed → ${nextUrl}`);
    }
    this.url = nextUrl;
    if (changed) {
      this.reconnect();
      return;
    }
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.connect();
    }
  }

  emergencyStop() {
    this.stopped = true;
    TelemetryStore.set({
      wsState: "stopped",
      emergencyStop: true,
      bridgeError: { code: "idle", message: "Bridge stopped" },
    });
    BridgeLog.push("warn", "system", "Emergency stop engaged");
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close(1000, "emergency_stop");
    } catch {
      /* noop */
    }
    this.ws = null;
  }

  rearm() {
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.backoff = 250;
    TelemetryStore.set({ emergencyStop: false });
    BridgeLog.push("info", "system", "Rearmed — attempting reconnect");
    this.connect();
  }

  connect() {
    if (this.stopped) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    // Validate URL up-front so we surface a precise error code instead of
    // letting the WebSocket constructor throw an opaque SyntaxError.
    try {
      const parsed = new URL(this.url);
      if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
        throw new Error(`Unsupported protocol ${parsed.protocol}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid URL";
      this.lastErrorCode = "invalid_url";
      TelemetryStore.set({
        wsState: "disconnected",
        bridgeError: {
          code: "invalid_url",
          message: `Invalid bridge URL "${this.url}" — ${message}`,
        },
      });
      BridgeLog.push("error", "ws", `Invalid URL: ${message}`);
      return;
    }
    TelemetryStore.set({ wsState: "connecting" });
    TelemetryStore.set({
      bridgeError: {
        code: "connecting",
        message: this.reconnectAttempts === 0
          ? `Connecting to ${this.url}…`
          : `Reconnecting to ${this.url} (attempt ${this.reconnectAttempts + 1})…`,
        attempt: this.reconnectAttempts,
      },
    });
    BridgeLog.push("info", "ws", `Connecting → ${this.url}`);
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      BridgeLog.push("error", "ws", `Constructor threw: ${err instanceof Error ? err.message : String(err)}`);
      this.lastErrorCode = "refused";
      this.scheduleReconnect();
      return;
    }
    const socket = this.ws;
    // Track whether we ever reached OPEN — distinguishes "refused"
    // (close before open) from "dropped after connect".
    let everOpened = false;
    const openTimeout = window.setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        this.lastErrorCode = "timeout";
        try { socket.close(4001, "open_timeout"); } catch { /* noop */ }
      }
    }, 4000);
    socket.onopen = () => {
      if (this.ws !== socket) return;
      window.clearTimeout(openTimeout);
      everOpened = true;
      this.lastErrorCode = null;
      this.backoff = 250;
      this.reconnectAttempts = 0;
      TelemetryStore.set({
        wsState: "connected",
        bridgeProbe: "ok",
        bridgeValidated: true,
        bridgeProbeMsg: "Live bridge connected",
        bridgeError: { code: "ok", message: "Bridge connected" },
      });
      BridgeLog.push("ok", "ws", "Live stream open");
      // Resubscribe hello so the daemon (or any proxy) knows we are back.
      try {
        socket.send(JSON.stringify({ event: "subscribe", channel: "motion", timestamp: Date.now() }));
        BridgeLog.push("debug", "ws", "Sent subscribe(motion)");
      } catch { /* noop */ }
      // Drain any motion packets buffered while offline.
      if (this.offlineLog.length) {
        BridgeLog.push("info", "ws", `Replaying ${this.offlineLog.length} buffered packets`);
        for (const pkt of this.offlineLog.splice(0)) {
          try { socket.send(JSON.stringify(pkt)); } catch { /* noop */ }
        }
      }
      if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
      this.heartbeatPendingSince = 0;
      this.heartbeatTimer = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (this.heartbeatPendingSince > 0 && Date.now() - this.heartbeatPendingSince > 10000) {
          BridgeLog.push("warn", "heartbeat", "No pong in 10s — forcing reconnect");
          try { socket.close(4000, "heartbeat_timeout"); } catch { /* noop */ }
          return;
        }
        try {
          socket.send(JSON.stringify({ event: "heartbeat", type: "ping", timestamp: Date.now() }));
          if (this.heartbeatPendingSince === 0) this.heartbeatPendingSince = Date.now();
        } catch { /* noop */ }
      }, 5000);
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (payload.type === "pong") {
          const rtt = this.heartbeatPendingSince ? Date.now() - this.heartbeatPendingSince : 0;
          this.heartbeatPendingSince = 0;
          BridgeLog.push("debug", "heartbeat", `pong (${rtt}ms)`);
        }
      } catch { /* noop */ }
    };
    socket.onclose = (event) => {
      if (this.ws !== socket) return;
      this.ws = null;
      window.clearTimeout(openTimeout);
      if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
      this.heartbeatPendingSince = 0;
      if (this.stopped) {
        TelemetryStore.set({ wsState: "stopped" });
        BridgeLog.push("info", "ws", `Closed (stopped, code ${event.code || 1005})`);
        return;
      }
      // Classify the failure so the UI can show a clear, actionable banner.
      if (!everOpened) {
        if (event.code === 4001 || this.lastErrorCode === "timeout") {
          this.lastErrorCode = "timeout";
        } else {
          this.lastErrorCode = "refused";
        }
      }
      TelemetryStore.set({
        wsState: "disconnected",
        bridgeValidated: false,
        bridgeProbeMsg: `Closed (${event.code || 1005})`,
        bridgeProbeRttMs: 0,
      });
      BridgeLog.push("warn", "ws", `Closed (code ${event.code || 1005}${event.reason ? `, ${event.reason}` : ""})`);
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      if (this.ws !== socket) return;
      BridgeLog.push("error", "ws", "Socket error event");
      if (!everOpened) this.lastErrorCode = "refused";
      try {
        socket.close();
      } catch {
        /* noop */
      }
    };
  }

  reconnect() {
    BridgeLog.push("info", "reconnect", "Manual reconnect");
    this.reconnectAttempts = 0;
    this.backoff = 250;
    this.lastErrorCode = null;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
    this.connect();
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    this.reconnectAttempts += 1;
    const wait = this.backoff;
    const code: "refused" | "timeout" = this.lastErrorCode === "timeout" ? "timeout" : "refused";
    const baseMsg = code === "timeout"
      ? `No response from ${this.url}. The bridge may be busy or blocked by a firewall.`
      : `Cannot reach the bridge at ${this.url}. Is the daemon running? Start it with: python omnipoint_bridge.py`;
    TelemetryStore.set({
      bridgeError: {
        code: "retrying",
        message: `${baseMsg} Retrying in ${(wait / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts}).`,
        nextRetryMs: wait,
        attempt: this.reconnectAttempts,
      },
    });
    BridgeLog.push(
      "info",
      "reconnect",
      `Retry ${this.reconnectAttempts} in ${wait}ms (${code})`,
    );
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.connect(), wait);
    this.backoff = Math.min(this.backoffMax, this.backoff * 2);
  }

  send(payload: MotionPayload) {
    if (this.stopped) return;
    // Gate HID emission until the bridge has been validated by the operator.
    if (!TelemetryStore.get().bridgeValidated) return;
    // Track packets/sec regardless of connection state
    this.packetCounter += 1;
    const now = performance.now();
    if (now - this.packetWindowStart >= 1000) {
      TelemetryStore.set({ packetsPerSec: this.packetCounter });
      this.packetCounter = 0;
      this.packetWindowStart = now;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {
        /* noop */
      }
    } else {
      this.offlineLog.push(payload);
      if (this.offlineLog.length > this.logCap) this.offlineLog.shift();
    }
  }

  getOfflineLog() {
    return this.offlineLog;
  }

  /**
   * Probe the configured WebSocket endpoint to confirm the local HID bridge
   * is reachable. Resolves with a status the UI can present to the operator.
   * Times out after `timeoutMs` to avoid hanging the UX on dead endpoints.
   */
  async probe(timeoutMs = 2500): Promise<{ ok: boolean; rttMs: number; message: string }> {
    const url = this.url;
    TelemetryStore.set({
      bridgeProbe: "probing",
      bridgeProbeMsg: `Probing ${url}…`,
    });
    BridgeLog.push("info", "probe", `Probing ${url}`);
    const start = performance.now();
    return await new Promise((resolve) => {
      let ws: WebSocket;
      let settled = false;
      let optimisticSuccessTimer: number | null = null;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid URL";
        TelemetryStore.set({
          bridgeProbe: "failed",
          bridgeValidated: false,
          bridgeProbeMsg: message,
        });
        BridgeLog.push("error", "probe", `Failed: ${message}`);
        resolve({ ok: false, rttMs: 0, message });
        return;
      }
      const finish = (ok: boolean, message: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (optimisticSuccessTimer) window.clearTimeout(optimisticSuccessTimer);
        const rttMs = Math.round(performance.now() - start);
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, ok ? "probe_complete" : "probe_failed");
          }
        } catch {
          /* noop */
        }
        TelemetryStore.set({
          bridgeProbe: ok ? "ok" : "failed",
          bridgeValidated: ok,
          bridgeProbeMsg: message,
          bridgeProbeRttMs: rttMs,
        });
        BridgeLog.push(ok ? "ok" : "error", "probe", `${message} (${rttMs}ms)`);
        // On success, opportunistically fetch the full daemon status so the
        // Status bar can show version + screen size without a separate UI step.
        if (ok) {
          this.fetchDaemonStatus(1500)
            .then((s) => {
              if (!s.version && !s.screen) return;
              TelemetryStore.set({
                daemon: {
                  version: s.version,
                  os: typeof (s.raw as { os?: unknown })?.os === "string"
                    ? ((s.raw as { os: string }).os)
                    : undefined,
                  sessionType: typeof (s.raw as { session_type?: unknown })?.session_type === "string"
                    ? ((s.raw as { session_type: string }).session_type)
                    : undefined,
                  screen: s.screen,
                  uinput: s.uinput,
                  evdev: s.evdev,
                },
              });
            })
            .catch(() => { /* non-fatal */ });
        } else {
          TelemetryStore.set({ daemon: null });
        }
        resolve({ ok, rttMs, message });
      };
      const timer = window.setTimeout(
        () => finish(false, `No response in ${timeoutMs}ms — is the bridge running?`),
        timeoutMs,
      );
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ event: "ping", type: "ping", timestamp: Date.now() }));
        } catch { /* noop */ }
        optimisticSuccessTimer = window.setTimeout(() => finish(true, "Bridge reachable"), 120);
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") {
          finish(true, "Bridge reachable");
          return;
        }
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (payload.type === "pong") {
            finish(true, "Bridge reachable");
            return;
          }
        } catch {
          /* noop */
        }
        finish(true, "Bridge reachable");
      };
      ws.onerror = () => finish(false, "Connection refused");
      ws.onclose = (ev) => {
        if (!settled && ev.code !== 1000) finish(false, `Closed (${ev.code || 1005})`);
      };
    });
  }

  /**
   * Validate the configured URL and check loopback host reachability via a
   * short WebSocket probe. Returns a structured diagnostic and a suggested
   * URL when something looks off (e.g. wrong protocol, non-loopback host).
   */
  async checkPort(timeoutMs = 1500): Promise<PortDiagnostics> {
    const raw = this.url;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      const suggested = "ws://127.0.0.1:8765";
      const msg = `Invalid URL "${raw}" — expected ${suggested}`;
      BridgeLog.push("error", "port", msg);
      return {
        ok: false, url: raw, host: "", port: 0, protocol: "",
        reachable: false, rttMs: 0, message: msg, suggestedUrl: suggested,
      };
    }
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "wss:" ? 443 : 80);
    const protocol = parsed.protocol;
    const isLoopback = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host.toLowerCase());

    if (protocol !== "ws:" && protocol !== "wss:") {
      const suggested = `ws://127.0.0.1:${port || 8765}`;
      const msg = `Unsupported protocol ${protocol} — must be ws:// or wss://`;
      BridgeLog.push("error", "port", msg);
      return { ok: false, url: raw, host, port, protocol, reachable: false, rttMs: 0, message: msg, suggestedUrl: suggested };
    }

    let suggestedUrl: string | undefined;
    if (!isLoopback) {
      suggestedUrl = `ws://127.0.0.1:${port || 8765}`;
      BridgeLog.push("warn", "port", `Non-loopback host ${host} — daemon usually binds 127.0.0.1`);
    }

    BridgeLog.push("info", "port", `Probing reachability of ${host}:${port}`);
    const start = performance.now();
    const reachable = await new Promise<boolean>((resolve) => {
      let ws: WebSocket;
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        try { ws?.close(); } catch { /* noop */ }
        resolve(ok);
      };
      try {
        ws = new WebSocket(raw);
      } catch {
        finish(false);
        return;
      }
      const t = window.setTimeout(() => finish(false), timeoutMs);
      ws.onopen = () => finish(true);
      ws.onerror = () => finish(false);
      ws.onclose = (ev) => { if (ev.code !== 1000) finish(false); };
    });
    const rttMs = Math.round(performance.now() - start);

    if (reachable) {
      const message = `Port ${port} reachable on ${host} (${rttMs}ms)`;
      BridgeLog.push("ok", "port", message);
      return { ok: true, url: raw, host, port, protocol, reachable, rttMs, message, suggestedUrl };
    }

    const hint = isLoopback
      ? `Nothing listening on ${host}:${port} — is the bridge daemon running?`
      : `Cannot reach ${host}:${port}. Try ${suggestedUrl} (run the daemon on this machine).`;
    BridgeLog.push("error", "port", hint);
    return {
      ok: false, url: raw, host, port, protocol, reachable, rttMs, message: hint,
      suggestedUrl: suggestedUrl ?? `ws://127.0.0.1:${port || 8765}`,
    };
  }

  /**
   * Ask the daemon for a status snapshot via WebSocket ({type: "status"}) and
   * (as fallback) HTTP GET /status. Surfaces uinput/evdev availability so the
   * UI can tell the operator whether the daemon can actually inject input.
   */
  async fetchDaemonStatus(timeoutMs = 1500): Promise<DaemonStatus> {
    const url = this.url;
    BridgeLog.push("info", "daemon", "Querying daemon status");

    // Try over WebSocket first (works even if daemon has no HTTP fallback).
    const wsResult = await new Promise<DaemonStatus | null>((resolve) => {
      let ws: WebSocket;
      let done = false;
      const finish = (r: DaemonStatus | null) => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        try { ws?.close(); } catch { /* noop */ }
        resolve(r);
      };
      try { ws = new WebSocket(url); } catch { finish(null); return; }
      const t = window.setTimeout(() => finish(null), timeoutMs);
      ws.onopen = () => {
        try { ws.send(JSON.stringify({ type: "status" })); } catch { finish(null); }
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          if (payload.type === "status") {
            finish({
              ok: Boolean(payload.uinput) && Boolean(payload.evdev),
              message: typeof payload.message === "string" ? payload.message : "Daemon responded",
              uinput: Boolean(payload.uinput),
              evdev: Boolean(payload.evdev),
              screen: payload.screen as { w: number; h: number } | undefined,
              version: typeof payload.version === "string" ? payload.version : undefined,
              raw: payload,
            });
          }
        } catch { /* noop */ }
      };
      ws.onerror = () => finish(null);
      ws.onclose = (ev) => { if (ev.code !== 1000) finish(null); };
    });

    if (wsResult) {
      BridgeLog.push(
        wsResult.ok ? "ok" : "warn",
        "daemon",
        `Status: uinput=${wsResult.uinput} evdev=${wsResult.evdev}`,
        wsResult.raw as Record<string, unknown> | undefined,
      );
      return wsResult;
    }

    // HTTP fallback — same host/port, http(s)://host:port/status
    try {
      const u = new URL(url);
      const httpScheme = u.protocol === "wss:" ? "https:" : "http:";
      const httpUrl = `${httpScheme}//${u.host}/status`;
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(httpUrl, { signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as Record<string, unknown>;
      const status: DaemonStatus = {
        ok: Boolean(payload.uinput) && Boolean(payload.evdev),
        message: typeof payload.message === "string" ? payload.message : "Daemon responded",
        uinput: Boolean(payload.uinput),
        evdev: Boolean(payload.evdev),
        screen: payload.screen as { w: number; h: number } | undefined,
        version: typeof payload.version === "string" ? payload.version : undefined,
        raw: payload,
      };
      BridgeLog.push(status.ok ? "ok" : "warn", "daemon", `HTTP status: uinput=${status.uinput} evdev=${status.evdev}`);
      return status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      BridgeLog.push("warn", "daemon", `Status unavailable: ${msg}`);
      return { ok: false, message: `Daemon status unavailable (${msg})` };
    }
  }

  invalidate() {
    TelemetryStore.set({
      bridgeProbe: "idle",
      bridgeValidated: false,
      bridgeProbeMsg: "Not tested",
      bridgeProbeRttMs: 0,
    });
  }
}
