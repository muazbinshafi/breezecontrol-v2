# BreezeControl Bridge

Local Python WebSocket daemon that turns BreezeControl's hand-tracked
gestures into real OS mouse and keyboard events. The web app stays in your
browser — the bridge just sits on `ws://127.0.0.1:8765` and translates
incoming motion frames into clicks, drags, scrolls, and cursor moves.

> **Why a local install?** Browsers can't move your real OS cursor, for
> security reasons. The bridge runs on _your_ machine, so only _you_ can
> drive your own input.

## Requirements

- Python **3.10+**
- Windows 10+, macOS 12+, or Linux (X11 or Wayland)
- On Linux: write access to `/dev/uinput` (see _Linux notes_ below)

## Install

```bash
cd bridge
python3 -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python3 omnipoint_bridge.py
# or with options:
python3 omnipoint_bridge.py --host 127.0.0.1 --port 8765 --verbose
```

You should see:

```
BreezeControl bridge v1.0.0 — linux/wayland — screen 2560x1440 — listening on ws://127.0.0.1:8765
```

Then in the BreezeControl web app:

1. Open the **Demo**.
2. Switch **Control mode** to **Bridge** in the top toolbar.
3. The endpoint is `ws://localhost:8765` (default).
4. Hit **Test bridge** in the Telemetry panel — you should see
   `Bridge reachable` and a green `STATUS` dot.

## Protocol

Plain JSON over WebSocket. The frontend sends:

| Direction | Message |
|-----------|---------|
| → bridge  | `{"event":"subscribe","channel":"motion"}` |
| → bridge  | `{"event":"motion","data":{"x":0..1,"y":0..1,"pressure":0..1,"gesture":"click"},"timestamp":...}` |
| → bridge  | `{"event":"heartbeat","type":"ping"}` |
| → bridge  | `{"type":"status"}` |
| ← bridge  | `{"type":"pong","timestamp":...}` |
| ← bridge  | `{"type":"status","uinput":true,"screen":{"w":1920,"h":1080},...}` |

There is also an HTTP fallback at `GET /status` returning the same status
payload, used by the in-app troubleshooter when the WS handshake stalls.

## Recognised gestures

| Gesture       | Action                              |
|---------------|-------------------------------------|
| `point`       | Move cursor only                    |
| `click`       | Left click (rising edge)            |
| `right_click` | Right click (rising edge)           |
| `drag`        | Hold left button while sustained    |
| `scroll_up`   | Wheel up                            |
| `scroll_down` | Wheel down                          |
| `thumbs_up`   | Press Enter (confirm)               |
| `open_palm`   | Idle (no input)                     |
| `fist`        | Emergency stop — releases held btn  |

## Linux notes (uinput)

The bridge uses `pynput`, which on Linux writes to `/dev/uinput`. Most
distros restrict that device to root by default. The cleanest fix is to
add a udev rule and put yourself in the `input` group:

```bash
echo 'KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"' \
  | sudo tee /etc/udev/rules.d/99-uinput.rules
sudo usermod -aG input "$USER"
sudo modprobe uinput
sudo udevadm control --reload-rules && sudo udevadm trigger
# log out and back in for the group change to take effect
```

Verify:

```bash
ls -l /dev/uinput     # should show group "input"
id -nG | tr ' ' '\n'  # should include "input"
```

Works under **X11**, **Wayland (GNOME, KDE, Sway, Hyprland)** — pynput
goes through the kernel uinput layer, so Wayland's per-client input
restrictions don't apply.

## macOS notes

On first run, macOS will prompt you to grant **Accessibility** and
**Input Monitoring** permission to the Python interpreter (or your
terminal). Approve both in **System Settings → Privacy & Security**, then
restart the bridge.

## Windows notes

No special permissions are required. If your antivirus flags the script,
allow it — `pynput` synthesises input via standard `SendInput` Win32 calls.

## Troubleshooting

The web app ships an in-product **Troubleshooter** that runs the same
checks you'd do manually (port reachability, handshake, daemon status,
uinput permissions). Open it from the Telemetry panel when the bridge
status is anything other than green.

## License

Same license as the parent BreezeControl project.
