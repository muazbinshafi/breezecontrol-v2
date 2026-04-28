import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIDBridge } from "./HIDBridge";
import { TelemetryStore } from "./TelemetryStore";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  message(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  fail() {
    this.onerror?.({} as Event);
  }
}

function resetTelemetry() {
  TelemetryStore.set({
    fps: 0,
    inferenceMs: 0,
    confidence: 0,
    packetsPerSec: 0,
    gesture: "none",
    cursorX: 0.5,
    cursorY: 0.5,
    wsState: "disconnected",
    bridgeUrl: "ws://localhost:8765",
    emergencyStop: false,
    sensorLost: false,
    initialized: false,
    bridgeProbe: "idle",
    bridgeValidated: false,
    bridgeProbeMsg: "Not tested",
    bridgeProbeRttMs: 0,
  });
}

describe("HIDBridge", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    resetTelemetry();
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  it("keeps probe success even when the probe socket closes immediately after open", async () => {
    const bridge = new HIDBridge("ws://localhost:8765");
    const probePromise = bridge.probe(2500);
    const socket = MockWebSocket.instances[0];

    socket.open();
    await vi.advanceTimersByTimeAsync(150);

    await expect(probePromise).resolves.toMatchObject({ ok: true, message: "Bridge reachable" });
    expect(TelemetryStore.get().bridgeValidated).toBe(true);
    expect(TelemetryStore.get().bridgeProbe).toBe("ok");
  });

  it("marks the live bridge connected on open and invalidates it when the socket drops", () => {
    const bridge = new HIDBridge("ws://localhost:8765");
    bridge.connect();

    const socket = MockWebSocket.instances[0];
    socket.open();
    expect(TelemetryStore.get().wsState).toBe("connected");
    expect(TelemetryStore.get().bridgeValidated).toBe(true);

    socket.close(1006, "abnormal");
    expect(TelemetryStore.get().wsState).toBe("disconnected");
    expect(TelemetryStore.get().bridgeValidated).toBe(false);
    expect(TelemetryStore.get().bridgeProbeMsg).toContain("Closed (1006)");
  });
});
