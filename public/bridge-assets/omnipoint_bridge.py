#!/usr/bin/env python3
"""
BreezeControl / OmniPoint local HID bridge.

Speaks the WebSocket protocol the BreezeControl web app expects on
ws://127.0.0.1:8765 and turns gesture events into real OS mouse / keyboard
input via `pynput`.

Cross-platform: Windows, macOS, Linux (X11 + Wayland — Wayland uses
/dev/uinput-backed pynput).

Protocol (JSON, one message per WS frame):

  Client → bridge
    { "event": "subscribe", "channel": "motion", "timestamp": ... }
    { "event": "heartbeat", "type": "ping", "timestamp": ... }
    { "event": "ping",      "type": "ping", "timestamp": ... }
    { "type":  "status" }
    { "event": "motion",
      "data":  { "x": 0..1, "y": 0..1, "pressure": 0..1, "gesture": "..." },
      "timestamp": ... }

  Bridge → client
    { "type": "pong",   "timestamp": ... }
    { "type": "status", "uinput": bool, "evdev": bool,
      "screen": {"w": int, "h": int}, "version": str,
      "wayland": bool, "x11": bool, "session_type": str,
      "os": "windows"|"darwin"|"linux", "message": str }

Recognised gestures (everything else is treated as `idle`/`hover`):
    none, point          -> move only
    click                -> left click on rising edge, release on fall
    right_click          -> right click on rising edge
    drag                 -> hold left button while gesture sustained
    scroll_up / scroll_down
    thumbs_up            -> "confirm" (Enter)
    open_palm            -> idle / park (no input)
    fist                 -> emergency stop (release any held button)

Run:
    python3 omnipoint_bridge.py --host 127.0.0.1 --port 8765
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import platform
import signal
import sys
import time
from dataclasses import dataclass
from typing import Any, Optional

VERSION = "1.0.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765

# ---------------------------------------------------------------------------
# Dependency import with friendly error messages
# ---------------------------------------------------------------------------
try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "\n[bridge] Missing dependency: websockets\n"
        "         pip install -r requirements.txt\n\n"
    )
    sys.exit(1)

try:
    from pynput.mouse import Button, Controller as MouseController
    from pynput.keyboard import Key, Controller as KeyboardController
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "\n[bridge] Missing dependency: pynput\n"
        "         pip install -r requirements.txt\n\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Screen geometry
# ---------------------------------------------------------------------------
def detect_screen() -> tuple[int, int]:
    """Best-effort primary screen size. Falls back to 1920x1080."""
    # 1) screeninfo is the most portable
    try:
        from screeninfo import get_monitors
        monitors = get_monitors()
        if monitors:
            m = monitors[0]
            return int(m.width), int(m.height)
    except Exception:  # noqa: BLE001
        pass

    # 2) Tk fallback (ships with most CPython installs)
    try:
        import tkinter
        root = tkinter.Tk()
        root.withdraw()
        w = root.winfo_screenwidth()
        h = root.winfo_screenheight()
        root.destroy()
        if w > 0 and h > 0:
            return int(w), int(h)
    except Exception:  # noqa: BLE001
        pass

    return 1920, 1080


# ---------------------------------------------------------------------------
# Input controller — wraps pynput so we can mock it in tests
# ---------------------------------------------------------------------------
@dataclass
class InputState:
    holding_left: bool = False
    last_click_time: float = 0.0
    last_right_click_time: float = 0.0
    last_confirm_time: float = 0.0
    last_scroll_time: float = 0.0


class InputBackend:
    """Real OS input backend. Safe to construct without an active display
    context — pynput throws lazily on first event, which we catch."""

    def __init__(self, screen_w: int, screen_h: int) -> None:
        self.screen_w = screen_w
        self.screen_h = screen_h
        self.mouse = MouseController()
        self.keyboard = KeyboardController()
        self.state = InputState()
        self._available = True
        self._last_error: Optional[str] = None

    @property
    def available(self) -> bool:
        return self._available

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def _safe(self, fn, *args, **kwargs) -> None:
        try:
            fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            self._available = False
            self._last_error = repr(exc)
            logging.error("input backend failed: %s", exc)

    def move(self, nx: float, ny: float) -> None:
        # Clamp to [0, 1] — frontend already normalises, but be defensive.
        nx = max(0.0, min(1.0, nx))
        ny = max(0.0, min(1.0, ny))
        x = int(nx * (self.screen_w - 1))
        y = int(ny * (self.screen_h - 1))
        self._safe(setattr, self.mouse, "position", (x, y))

    def left_press(self) -> None:
        if self.state.holding_left:
            return
        self._safe(self.mouse.press, Button.left)
        self.state.holding_left = True

    def left_release(self) -> None:
        if not self.state.holding_left:
            return
        self._safe(self.mouse.release, Button.left)
        self.state.holding_left = False

    def left_click(self) -> None:
        # Debounce 180ms — the UI should already debounce, but the bridge is
        # the last line of defense against duplicate clicks on edge flicker.
        now = time.monotonic()
        if now - self.state.last_click_time < 0.18:
            return
        self.state.last_click_time = now
        self._safe(self.mouse.click, Button.left, 1)

    def right_click(self) -> None:
        now = time.monotonic()
        if now - self.state.last_right_click_time < 0.25:
            return
        self.state.last_right_click_time = now
        self._safe(self.mouse.click, Button.right, 1)

    def scroll(self, dy: int) -> None:
        now = time.monotonic()
        if now - self.state.last_scroll_time < 0.05:
            return
        self.state.last_scroll_time = now
        self._safe(self.mouse.scroll, 0, dy)

    def confirm(self) -> None:
        now = time.monotonic()
        if now - self.state.last_confirm_time < 0.6:
            return
        self.state.last_confirm_time = now
        self._safe(self.keyboard.press, Key.enter)
        self._safe(self.keyboard.release, Key.enter)

    def panic(self) -> None:
        """Release any held buttons — used for fist/emergency stop."""
        if self.state.holding_left:
            self._safe(self.mouse.release, Button.left)
            self.state.holding_left = False


# ---------------------------------------------------------------------------
# Gesture → action dispatcher
# ---------------------------------------------------------------------------
class GestureDispatcher:
    """Translates the frontend's per-frame gesture stream into OS events."""

    SCROLL_GAIN = 1  # one notch per scroll_up/down event

    def __init__(self, backend: InputBackend) -> None:
        self.backend = backend
        self._prev_gesture: str = "none"

    def handle(self, gesture: str, x: float, y: float, pressure: float) -> None:
        # Always update cursor position first — even on scroll/click frames.
        self.backend.move(x, y)

        prev = self._prev_gesture
        g = (gesture or "none").lower()

        # --- emergency stop ------------------------------------------------
        if g == "fist":
            self.backend.panic()
            self._prev_gesture = g
            return

        # --- left button hold for drag ------------------------------------
        if g == "drag":
            self.backend.left_press()
        elif prev == "drag" and g != "drag":
            self.backend.left_release()

        # --- discrete edge-triggered events --------------------------------
        if g == "click" and prev != "click":
            self.backend.left_click()
        elif g == "right_click" and prev != "right_click":
            self.backend.right_click()
        elif g == "thumbs_up" and prev != "thumbs_up":
            self.backend.confirm()

        # --- continuous scroll --------------------------------------------
        if g == "scroll_up":
            self.backend.scroll(self.SCROLL_GAIN)
        elif g == "scroll_down":
            self.backend.scroll(-self.SCROLL_GAIN)

        self._prev_gesture = g


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------
class BridgeServer:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.screen_w, self.screen_h = detect_screen()
        self.backend = InputBackend(self.screen_w, self.screen_h)
        self.dispatcher = GestureDispatcher(self.backend)
        self.os_name = platform.system().lower()  # "windows" / "darwin" / "linux"
        self.session_type = self._detect_session_type()
        self.wayland = self.session_type == "wayland"
        self.x11 = self.session_type == "x11"
        self.clients: set[WebSocketServerProtocol] = set()
        self.frames_received = 0
        self.start_time = time.monotonic()

    # -- environment introspection -----------------------------------------
    def _detect_session_type(self) -> str:
        import os
        if self.os_name != "linux":
            return self.os_name  # "windows" / "darwin"
        return (
            os.environ.get("XDG_SESSION_TYPE")
            or os.environ.get("WAYLAND_DISPLAY") and "wayland"
            or os.environ.get("DISPLAY") and "x11"
            or "unknown"
        )

    def status_payload(self) -> dict[str, Any]:
        # uinput / evdev are Linux concepts; on other OSes report True iff the
        # backend is currently usable (so the UI shows green).
        if self.os_name == "linux":
            uinput = self._uinput_writable()
            evdev = uinput
            message = (
                "Daemon ready — /dev/uinput accessible"
                if uinput
                else "/dev/uinput not writable — see troubleshooter"
            )
        else:
            uinput = self.backend.available
            evdev = self.backend.available
            message = (
                f"Daemon ready on {self.os_name}"
                if self.backend.available
                else (self.backend.last_error or "Input backend not ready")
            )
        return {
            "type": "status",
            "version": VERSION,
            "os": self.os_name,
            "session_type": self.session_type,
            "wayland": self.wayland,
            "x11": self.x11,
            "uinput": uinput,
            "evdev": evdev,
            "screen": {"w": self.screen_w, "h": self.screen_h},
            "message": message,
            "uptime_s": round(time.monotonic() - self.start_time, 1),
            "frames_received": self.frames_received,
        }

    def _uinput_writable(self) -> bool:
        import os
        try:
            return os.access("/dev/uinput", os.W_OK)
        except Exception:  # noqa: BLE001
            return False

    # -- per-connection handler --------------------------------------------
    async def handle_client(self, ws: WebSocketServerProtocol) -> None:
        peer = getattr(ws, "remote_address", ("?", "?"))
        logging.info("client connected from %s", peer)
        self.clients.add(ws)
        try:
            async for raw in ws:
                if not isinstance(raw, str):
                    continue
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                await self._on_message(ws, msg)
        except websockets.ConnectionClosed:
            pass
        except Exception as exc:  # noqa: BLE001
            logging.exception("client error: %s", exc)
        finally:
            self.clients.discard(ws)
            # Release any held button if the controlling client vanishes —
            # otherwise a tab-close mid-drag leaves the user stuck.
            self.backend.panic()
            logging.info("client disconnected from %s", peer)

    async def _on_message(self, ws: WebSocketServerProtocol, msg: dict[str, Any]) -> None:
        event = msg.get("event")
        mtype = msg.get("type")

        # Heartbeat / ping / probe — both forms map to a pong.
        if mtype == "ping" or event in ("heartbeat", "ping"):
            await ws.send(json.dumps({"type": "pong", "timestamp": int(time.time() * 1000)}))
            return

        # Status request
        if mtype == "status" or event == "status":
            await ws.send(json.dumps(self.status_payload()))
            return

        # Subscribe (just acknowledged so the UI can log it)
        if event == "subscribe":
            await ws.send(json.dumps({
                "type": "subscribed",
                "channel": msg.get("channel", "motion"),
                "timestamp": int(time.time() * 1000),
            }))
            return

        # Motion frame
        if event == "motion":
            data = msg.get("data") or {}
            try:
                x = float(data.get("x", 0.0))
                y = float(data.get("y", 0.0))
                pressure = float(data.get("pressure", 0.0))
                gesture = str(data.get("gesture", "none"))
            except (TypeError, ValueError):
                return
            self.frames_received += 1
            self.dispatcher.handle(gesture, x, y, pressure)
            return

    # -- HTTP /status fallback ---------------------------------------------
    async def process_request(self, path: str, request_headers):  # noqa: ANN001
        """Handle plain HTTP GET /status before the WebSocket handshake.

        The frontend's BridgeTroubleshooter falls back to HTTP if the WS
        status query times out. Returning anything non-None aborts the WS
        upgrade for that request, so we only do it for the /status path."""
        if path != "/status":
            return None
        body = json.dumps(self.status_payload()).encode("utf-8")
        headers = [
            ("Content-Type", "application/json"),
            ("Access-Control-Allow-Origin", "*"),
            ("Cache-Control", "no-store"),
        ]
        # websockets ≥ 11 accepts (status, headers, body) tuple
        from http import HTTPStatus
        return HTTPStatus.OK, headers, body

    # -- run loop -----------------------------------------------------------
    async def serve(self) -> None:
        logging.info(
            "BreezeControl bridge v%s — %s/%s — screen %sx%s — listening on ws://%s:%d",
            VERSION, self.os_name, self.session_type,
            self.screen_w, self.screen_h, self.host, self.port,
        )
        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            process_request=self.process_request,
            ping_interval=20,
            ping_timeout=20,
            max_size=2 ** 20,
        ):
            await asyncio.Future()  # run forever


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="omnipoint_bridge",
        description="Local WebSocket → OS HID bridge for BreezeControl.",
    )
    p.add_argument("--host", default=DEFAULT_HOST,
                   help=f"bind address (default {DEFAULT_HOST})")
    p.add_argument("--port", type=int, default=DEFAULT_PORT,
                   help=f"bind port (default {DEFAULT_PORT})")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="enable debug logging")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    server = BridgeServer(args.host, args.port)

    # Graceful shutdown on Ctrl+C / SIGTERM
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    stop = loop.create_future()

    def _shutdown(*_: Any) -> None:
        if not stop.done():
            stop.set_result(None)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler for SIGTERM
            signal.signal(sig, lambda *_: _shutdown())

    async def runner() -> None:
        serve_task = asyncio.create_task(server.serve())
        await stop
        serve_task.cancel()
        try:
            await serve_task
        except asyncio.CancelledError:
            pass

    try:
        loop.run_until_complete(runner())
    finally:
        loop.close()
        logging.info("bridge stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
