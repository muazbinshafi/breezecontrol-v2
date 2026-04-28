// Per-OS bridge install guide. Walks the user end-to-end: install Python,
// clone/download the repo, set up the bridge venv, run the bridge daemon,
// run the web app locally (npm), and connect them inside BreezeControl.
//
// Reached from /bridge/windows, /bridge/macos, /bridge/linux.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Apple, Check, Copy, Cpu, ExternalLink, Github,
  Hand, Terminal, Download, ShieldCheck, Globe, PlayCircle, Package, Zap,
} from "lucide-react";

type OS = "windows" | "macos" | "linux";

const OS_META: Record<OS, { label: string; icon: typeof Cpu; pyUrl: string; pyHint: string }> = {
  windows: {
    label: "Windows",
    icon: Terminal,
    pyUrl: "https://www.python.org/downloads/windows/",
    pyHint: 'Download the latest "Windows installer (64-bit)".',
  },
  macos: {
    label: "macOS",
    icon: Apple,
    pyUrl: "https://www.python.org/downloads/macos/",
    pyHint: 'Download the "macOS 64-bit universal2 installer".',
  },
  linux: {
    label: "Linux",
    icon: Cpu,
    pyUrl: "https://www.python.org/downloads/source/",
    pyHint: "Most distros ship Python 3 — use your package manager (see below).",
  },
};

interface Step {
  label: string;
  cmd?: string;
  note?: string;
  multiline?: boolean;
}

interface Section {
  id: string;
  title: string;
  icon: typeof Cpu;
  intro?: string;
  steps: Step[];
  highlight?: boolean;
}

const REPO_URL = "https://github.com/muazbinshafi/airtouch-v8";
const REPO_CLONE = "git clone https://github.com/muazbinshafi/airtouch-v8.git";
const REPO_ZIP = "https://github.com/muazbinshafi/airtouch-v8/archive/refs/heads/main.zip";
const BRIDGE_ASSET_BASE = "https://breezecontrol.lovable.app/bridge-assets";
const REPO_DIR = "airtouch-v8-main";

// One-shot scripts that automate EVERYTHING from scratch:
// download repo zip → extract → install Python/Node → venv → deps → launch bridge + web app.
const ONE_SHOT: Record<OS, string> = {
  windows: `# === BreezeControl one-shot installer (Windows / PowerShell) ===
# Always installs into your Downloads folder — safe to re-run.
function Step($n,$msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$Downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
if (-not $Downloads) { $Downloads = Join-Path $env:USERPROFILE 'Downloads' }
Set-Location $Downloads
$LogDir = Join-Path $Downloads 'breezecontrol-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$BridgeLog = Join-Path $LogDir 'bridge.log'
$WebLog    = Join-Path $LogDir 'web.log'

Step 1 "Installing Python 3.11 + Node LTS (skipped if present)"
if (-not (Get-Command py   -ErrorAction SilentlyContinue)) { winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { winget install -e --id OpenJS.NodeJS.LTS    --accept-source-agreements --accept-package-agreements }
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Step 2 "Downloading project ZIP from GitHub"
if (Test-Path "breezecontrol.zip") { Remove-Item -Force "breezecontrol.zip" }
Invoke-WebRequest -Uri "${REPO_ZIP}" -OutFile "breezecontrol.zip"

Step 3 "Extracting to a temp folder, then atomically moving into place"
$TmpExtract = Join-Path $Downloads ("_bc_extract_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TmpExtract | Out-Null
Expand-Archive -Force "breezecontrol.zip" -DestinationPath $TmpExtract
$extracted = Get-ChildItem $TmpExtract -Directory | Select-Object -First 1
if (-not $extracted) { Write-Host "ERROR: extraction failed — no folder inside ZIP" -ForegroundColor Red; exit 1 }
$projectCandidate = Get-ChildItem $TmpExtract -Directory -Recurse | Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } | Sort-Object FullName | Select-Object -First 1
if (-not $projectCandidate) { Write-Host "ERROR: could not locate extracted BreezeControl project root" -ForegroundColor Red; exit 1 }
$FinalDir = Join-Path $Downloads "${REPO_DIR}"
if (Test-Path $FinalDir) { Remove-Item -Recurse -Force $FinalDir }
Move-Item $projectCandidate.FullName $FinalDir
Remove-Item -Recurse -Force $TmpExtract
Set-Location $FinalDir
$ProjectRoot = $PWD.Path
$BridgePath = Join-Path $ProjectRoot 'bridge'
if (-not (Test-Path $BridgePath)) {
  Step '3b' "Repo ZIP is missing bridge files — downloading hosted bridge fallback"
  New-Item -ItemType Directory -Force -Path $BridgePath | Out-Null
  Invoke-WebRequest -Uri "${BRIDGE_ASSET_BASE}/requirements.txt"    -OutFile (Join-Path $BridgePath 'requirements.txt')
  Invoke-WebRequest -Uri "${BRIDGE_ASSET_BASE}/README.md"            -OutFile (Join-Path $BridgePath 'README.md')
  Invoke-WebRequest -Uri "${BRIDGE_ASSET_BASE}/omnipoint_bridge.py" -OutFile (Join-Path $BridgePath 'omnipoint_bridge.py')
}
if (-not (Test-Path (Join-Path $BridgePath 'requirements.txt'))) { Write-Host "ERROR: requirements.txt missing at $BridgePath" -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $BridgePath 'omnipoint_bridge.py'))) { Write-Host "ERROR: omnipoint_bridge.py missing at $BridgePath" -ForegroundColor Red; exit 1 }
Write-Host "    project root: $ProjectRoot" -ForegroundColor DarkGray

Step 4 "Creating Python venv + installing bridge requirements (absolute paths)"
if (-not (Test-Path $BridgePath)) { Write-Host "ERROR: bridge folder not found at $BridgePath" -ForegroundColor Red; exit 1 }
$RequirementsFile = Join-Path $BridgePath 'requirements.txt'
if (-not (Test-Path $RequirementsFile)) { Write-Host "ERROR: requirements.txt not found at $RequirementsFile" -ForegroundColor Red; exit 1 }
Set-Location $BridgePath
py -m venv .venv
$VenvActivate = Join-Path $BridgePath '.venv\\Scripts\\Activate.ps1'
$VenvPython   = Join-Path $BridgePath '.venv\\Scripts\\python.exe'
if (-not (Test-Path $VenvPython)) { Write-Host "ERROR: venv python missing at $VenvPython" -ForegroundColor Red; exit 1 }
& $VenvActivate
& $VenvPython -m pip install --upgrade pip | Out-Null
& $VenvPython -m pip install -r $RequirementsFile

Step 5 "Launching bridge daemon in a NEW PowerShell window (venv pre-activated)"
$BridgeCmd = "Set-Location '$BridgePath'; & '$BridgePath\\.venv\\Scripts\\Activate.ps1'; Write-Host 'bridge cwd:' (Get-Location); python omnipoint_bridge.py *>&1 | Tee-Object -FilePath '$BridgeLog'"
Start-Process powershell -ArgumentList '-NoExit','-Command',$BridgeCmd

Step 6 "Installing web app dependencies"
Set-Location $ProjectRoot
npm install

Step 7 "Starting Vite dev server in background (log: $WebLog)"
$WebCmd = "Set-Location '$ProjectRoot'; npm run dev *>&1 | Tee-Object -FilePath '$WebLog'"
Start-Process powershell -ArgumentList '-NoExit','-Command',$WebCmd

Step 8 "Waiting for bridge (ws://127.0.0.1:8765) and web app (http://localhost:8080)"
$bridgeUp = $false; $webUp = $false; $webUrl = "http://localhost:8080"
for ($i=1; $i -le 60; $i++) {
  if (-not $bridgeUp) { try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8765); $c.Close(); $bridgeUp = $true; Write-Host "    ✓ bridge reachable on ws://127.0.0.1:8765" -ForegroundColor Green } catch {} }
  if (-not $webUp) { foreach ($p in 8080,5173,3000) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri ("http://localhost:" + $p) -TimeoutSec 1; if ($r.StatusCode -lt 500) { $webUp = $true; $webUrl = "http://localhost:" + $p; Write-Host ("    ✓ web app reachable on " + $webUrl) -ForegroundColor Green; break } } catch {} } }
  if ($bridgeUp -and $webUp) { break }
  Start-Sleep -Seconds 1
}
Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
if ($bridgeUp) { Write-Host "  BRIDGE : ws://127.0.0.1:8765   (log: $BridgeLog)" -ForegroundColor Green } else { Write-Host "  BRIDGE : NOT REACHABLE — see $BridgeLog" -ForegroundColor Red }
if ($webUp)    { Write-Host "  WEB    : $webUrl   (log: $WebLog)" -ForegroundColor Green } else { Write-Host "  WEB    : NOT REACHABLE — see $WebLog" -ForegroundColor Red }
Write-Host "============================================================" -ForegroundColor Yellow
if ($webUp) { Start-Process $webUrl }`,

  macos: `# === BreezeControl one-shot installer (macOS / Terminal) ===
# Always installs into ~/Downloads — safe to re-run.
set -e
step() { printf "\\n\\033[1;36m[%s]\\033[0m %s\\n" "$1" "$2"; }
ok()   { printf "    \\033[1;32m✓\\033[0m %s\\n" "$1"; }
err()  { printf "    \\033[1;31m✗\\033[0m %s\\n" "$1"; }

cd "$HOME/Downloads"
LOG_DIR="$HOME/Downloads/breezecontrol-logs"
mkdir -p "$LOG_DIR"
BRIDGE_LOG="$LOG_DIR/bridge.log"
WEB_LOG="$LOG_DIR/web.log"

step 1 "Installing Homebrew + Python + Node (skipped if present)"
if ! command -v brew >/dev/null 2>&1; then /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; fi
brew list python@3.11 >/dev/null 2>&1 || brew install python@3.11
brew list node        >/dev/null 2>&1 || brew install node

step 2 "Downloading project ZIP from GitHub"
rm -f breezecontrol.zip
curl -L "${REPO_ZIP}" -o breezecontrol.zip

step 3 "Extracting to a temp folder, then atomically moving into place"
TMP_EXTRACT="$(mktemp -d "$HOME/Downloads/_bc_extract_XXXXXX")"
unzip -oq breezecontrol.zip -d "$TMP_EXTRACT"
PROJECT_CANDIDATE="$(find "$TMP_EXTRACT" -type d \( -exec test -f '{}/package.json' ';' \) | head -n1)"
if [ -z "$PROJECT_CANDIDATE" ]; then err "could not locate extracted BreezeControl project root"; exit 1; fi
FINAL_DIR="$HOME/Downloads/${REPO_DIR}"
rm -rf "$FINAL_DIR"
mv "$PROJECT_CANDIDATE" "$FINAL_DIR"
rm -rf "$TMP_EXTRACT"
cd "$FINAL_DIR"
PROJECT_ROOT="$PWD"
BRIDGE_PATH="$PROJECT_ROOT/bridge"
if [ ! -d "$BRIDGE_PATH" ] || [ ! -f "$BRIDGE_PATH/requirements.txt" ] || [ ! -f "$BRIDGE_PATH/omnipoint_bridge.py" ]; then
  step 3b "Repo ZIP is missing bridge files — downloading hosted bridge fallback"
  mkdir -p "$BRIDGE_PATH"
  curl -fsSL "${BRIDGE_ASSET_BASE}/requirements.txt" -o "$BRIDGE_PATH/requirements.txt"
  curl -fsSL "${BRIDGE_ASSET_BASE}/README.md" -o "$BRIDGE_PATH/README.md"
  curl -fsSL "${BRIDGE_ASSET_BASE}/omnipoint_bridge.py" -o "$BRIDGE_PATH/omnipoint_bridge.py"
fi
[ -f "$BRIDGE_PATH/requirements.txt" ] || { err "requirements.txt missing after fallback"; exit 1; }
[ -f "$BRIDGE_PATH/omnipoint_bridge.py" ] || { err "omnipoint_bridge.py missing after fallback"; exit 1; }
ok "project root: $PROJECT_ROOT"

step 4 "Creating Python venv + installing bridge requirements"
cd "$BRIDGE_PATH"
BRIDGE_PATH="$PWD"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -r requirements.txt

step 5 "Launching bridge daemon in a NEW Terminal tab (venv pre-activated)"
osascript -e 'tell application "Terminal" to do script "cd \\"'"$BRIDGE_PATH"'\\" && source .venv/bin/activate && echo bridge cwd: $(pwd) && python3 omnipoint_bridge.py 2>&1 | tee \\"'"$BRIDGE_LOG"'\\""'

step 6 "Installing web app dependencies"
cd "$PROJECT_ROOT"
npm install

step 7 "Starting Vite dev server in background (log: $WEB_LOG)"
( npm run dev >"$WEB_LOG" 2>&1 & )

step 8 "Waiting for bridge (ws://127.0.0.1:8765) and web app (http://localhost:8080)"
BRIDGE_UP=0; WEB_UP=0; WEB_URL="http://localhost:8080"
for i in $(seq 1 60); do
  if [ $BRIDGE_UP -eq 0 ] && (echo > /dev/tcp/127.0.0.1/8765) >/dev/null 2>&1; then BRIDGE_UP=1; ok "bridge reachable on ws://127.0.0.1:8765"; fi
  if [ $WEB_UP -eq 0 ]; then for p in 8080 5173 3000; do if curl -sf "http://localhost:$p" -o /dev/null --max-time 1; then WEB_UP=1; WEB_URL="http://localhost:$p"; ok "web app reachable on $WEB_URL"; break; fi; done; fi
  [ $BRIDGE_UP -eq 1 ] && [ $WEB_UP -eq 1 ] && break
  sleep 1
done
echo ""
echo "============================================================"
[ $BRIDGE_UP -eq 1 ] && echo "  BRIDGE : ws://127.0.0.1:8765   (log: $BRIDGE_LOG)" || echo "  BRIDGE : NOT REACHABLE — see $BRIDGE_LOG"
[ $WEB_UP -eq 1 ]    && echo "  WEB    : $WEB_URL   (log: $WEB_LOG)"                || echo "  WEB    : NOT REACHABLE — see $WEB_LOG"
echo "============================================================"
[ $WEB_UP -eq 1 ] && open "$WEB_URL" || true`,

  linux: `# === BreezeControl one-shot installer (Linux — Debian/Ubuntu/Kali) ===
# Always installs into ~/Downloads — safe to re-run.
set -e
step() { printf "\\n\\033[1;36m[%s]\\033[0m %s\\n" "$1" "$2"; }
ok()   { printf "    \\033[1;32m✓\\033[0m %s\\n" "$1"; }
err()  { printf "    \\033[1;31m✗\\033[0m %s\\n" "$1"; }

mkdir -p "$HOME/Downloads" && cd "$HOME/Downloads"
LOG_DIR="$HOME/Downloads/breezecontrol-logs"
mkdir -p "$LOG_DIR"
BRIDGE_LOG="$LOG_DIR/bridge.log"
WEB_LOG="$LOG_DIR/web.log"

step 1 "Installing system dependencies via apt"
sudo apt update && sudo apt install -y python3 python3-venv python3-pip nodejs npm git curl unzip

step 2 "Downloading project ZIP from GitHub"
rm -f breezecontrol.zip
curl -L "${REPO_ZIP}" -o breezecontrol.zip

step 3 "Extracting to a temp folder, then atomically moving into place"
TMP_EXTRACT="$(mktemp -d "$HOME/Downloads/_bc_extract_XXXXXX")"
unzip -oq breezecontrol.zip -d "$TMP_EXTRACT"
PROJECT_CANDIDATE="$(find "$TMP_EXTRACT" -type d \( -exec test -f '{}/package.json' ';' \) | head -n1)"
if [ -z "$PROJECT_CANDIDATE" ]; then err "could not locate extracted BreezeControl project root"; exit 1; fi
FINAL_DIR="$HOME/Downloads/${REPO_DIR}"
rm -rf "$FINAL_DIR"
mv "$PROJECT_CANDIDATE" "$FINAL_DIR"
rm -rf "$TMP_EXTRACT"
cd "$FINAL_DIR"
PROJECT_ROOT="$PWD"
BRIDGE_PATH="$PROJECT_ROOT/bridge"
if [ ! -d "$BRIDGE_PATH" ] || [ ! -f "$BRIDGE_PATH/requirements.txt" ] || [ ! -f "$BRIDGE_PATH/omnipoint_bridge.py" ]; then
  step 3b "Repo ZIP is missing bridge files — downloading hosted bridge fallback"
  mkdir -p "$BRIDGE_PATH"
  curl -fsSL "${BRIDGE_ASSET_BASE}/requirements.txt" -o "$BRIDGE_PATH/requirements.txt"
  curl -fsSL "${BRIDGE_ASSET_BASE}/README.md" -o "$BRIDGE_PATH/README.md"
  curl -fsSL "${BRIDGE_ASSET_BASE}/omnipoint_bridge.py" -o "$BRIDGE_PATH/omnipoint_bridge.py"
fi
[ -f "$BRIDGE_PATH/requirements.txt" ] || { err "requirements.txt missing after fallback"; exit 1; }
[ -f "$BRIDGE_PATH/omnipoint_bridge.py" ] || { err "omnipoint_bridge.py missing after fallback"; exit 1; }
ok "project root: $PROJECT_ROOT"

step 4 "Creating Python venv + installing bridge requirements"
cd "$BRIDGE_PATH"
BRIDGE_PATH="$PWD"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -r requirements.txt

step 5 "Launching bridge daemon in background (log: $BRIDGE_LOG)"
( cd "$BRIDGE_PATH" && source .venv/bin/activate && python3 omnipoint_bridge.py >"$BRIDGE_LOG" 2>&1 & )

step 6 "Installing web app dependencies"
cd "$PROJECT_ROOT"
npm install

step 7 "Starting Vite dev server in background (log: $WEB_LOG)"
( npm run dev >"$WEB_LOG" 2>&1 & )

step 8 "Waiting for bridge (ws://127.0.0.1:8765) and web app (http://localhost:8080)"
BRIDGE_UP=0; WEB_UP=0; WEB_URL="http://localhost:8080"
for i in $(seq 1 60); do
  if [ $BRIDGE_UP -eq 0 ] && (echo > /dev/tcp/127.0.0.1/8765) >/dev/null 2>&1; then BRIDGE_UP=1; ok "bridge reachable on ws://127.0.0.1:8765"; fi
  if [ $WEB_UP -eq 0 ]; then for p in 8080 5173 3000; do if curl -sf "http://localhost:$p" -o /dev/null --max-time 1; then WEB_UP=1; WEB_URL="http://localhost:$p"; ok "web app reachable on $WEB_URL"; break; fi; done; fi
  [ $BRIDGE_UP -eq 1 ] && [ $WEB_UP -eq 1 ] && break
  sleep 1
done
echo ""
echo "============================================================"
[ $BRIDGE_UP -eq 1 ] && echo "  BRIDGE : ws://127.0.0.1:8765   (log: $BRIDGE_LOG)" || echo "  BRIDGE : NOT REACHABLE — see $BRIDGE_LOG"
[ $WEB_UP -eq 1 ]    && echo "  WEB    : $WEB_URL   (log: $WEB_LOG)"                || echo "  WEB    : NOT REACHABLE — see $WEB_LOG"
echo "============================================================"
if [ $WEB_UP -eq 1 ]; then xdg-open "$WEB_URL" >/dev/null 2>&1 || true; fi`,
};

const buildGuide = (os: OS): Section[] => {
  const isWin = os === "windows";
  const py = isWin ? "py" : "python3";
  const activate = isWin ? ".\\.venv\\Scripts\\Activate.ps1" : "source .venv/bin/activate";

  // STEP 0 — the magic one-liner.
  const oneShot: Section = {
    id: "auto",
    title: "0. One-shot auto install (recommended)",
    icon: Zap,
    highlight: true,
    intro:
      os === "windows"
        ? "Open PowerShell anywhere and paste the block below. It auto-jumps to your Downloads folder, installs Python + Node via winget, downloads & extracts the project ZIP from GitHub (cleaning any previous copy), sets up the venv, opens the bridge in a second window, and starts the web app. Safe to re-run."
        : os === "macos"
          ? "Open Terminal anywhere and paste the block below. It auto-jumps to ~/Downloads, installs Homebrew/Python/Node if missing, downloads & unzips the project (cleaning any previous copy), sets up the venv, opens the bridge in a new Terminal tab, and starts the web app. Safe to re-run."
          : "Open a terminal anywhere and paste the block below. It auto-jumps to ~/Downloads, installs all OS deps via apt, downloads & unzips the project (cleaning any previous copy), runs the bridge in the background, and starts the web app. Safe to re-run.",
    steps: [
      {
        label: "Paste this entire block — it does everything end-to-end:",
        cmd: ONE_SHOT[os],
        multiline: true,
        note:
          os === "windows"
            ? "If winget is missing, install it from the Microsoft Store (\"App Installer\"), then re-run."
            : os === "linux"
              ? "Fedora? Swap apt line for: sudo dnf install -y python3 python3-virtualenv nodejs npm git"
              : "First-run macOS will prompt for Accessibility + Input Monitoring — approve both.",
      },
      {
        label:
          "When you see the dev server URL (usually http://localhost:8080), open it in Chrome/Edge → ENTER DEMO → switch Control mode to Bridge.",
      },
    ],
  };

  const pythonInstall: Section = {
    id: "python",
    title: "1. Install Python 3.10+ (manual)",
    icon: Package,
    intro:
      os === "windows"
        ? 'Skip if the one-shot above worked. Otherwise: download the official installer and — important — tick "Add Python to PATH" on the first screen before clicking Install.'
        : os === "macos"
          ? "Skip if the one-shot above worked. Otherwise install via Homebrew (recommended) or python.org."
          : "Skip if the one-shot above worked. Otherwise use your distribution's package manager.",
    steps:
      os === "windows"
        ? [
            { label: "Download the Windows installer from python.org.", note: "Pick Python 3.11 or newer." },
            { label: 'Run the installer and tick "Add python.exe to PATH".' },
            { label: 'Click "Install Now" and wait for it to finish.' },
            { label: "Open a NEW PowerShell window and verify:", cmd: "py --version" },
            {
              label: 'If Windows says "Python was not found" and opens the Store, disable the alias:',
              note: "Settings → Apps → Advanced app settings → App execution aliases → turn OFF both \"python.exe\" and \"python3.exe\" entries.",
            },
          ]
        : os === "macos"
          ? [
              { label: "Option A — Homebrew (recommended):", cmd: "brew install python@3.11 node" },
              { label: "Option B — Download from python.org and run the .pkg installer." },
              { label: "Verify in Terminal:", cmd: "python3 --version && node --version" },
            ]
          : [
              { label: "Debian / Ubuntu / Kali:", cmd: "sudo apt update && sudo apt install -y python3 python3-venv python3-pip nodejs npm git" },
              { label: "Fedora:", cmd: "sudo dnf install -y python3 python3-virtualenv nodejs npm git" },
              { label: "Arch:", cmd: "sudo pacman -S python nodejs npm git" },
              { label: "Verify:", cmd: "python3 --version && node --version" },
            ],
  };

  const repoStep: Section = {
    id: "repo",
    title: "2. Get the BreezeControl source",
    icon: Github,
    intro:
      "You need the `bridge/` folder from the repo. Clone it with git, or download the ZIP from GitHub if you don't have git.",
    steps: [
      { label: "Clone with git (easiest):", cmd: REPO_CLONE },
      { label: "Then enter the project folder:", cmd: "cd airtouch-v8" },
      {
        label: "No git? Download the ZIP from GitHub instead — extract it, then `cd` into the extracted folder.",
      },
    ],
  };

  const bridgeStep: Section = {
    id: "bridge",
    title: "3. Set up the bridge daemon (manual)",
    icon: Cpu,
    intro:
      "The bridge is a tiny Python WebSocket server that runs on your machine and turns gestures into real OS mouse + keyboard events.",
    steps: [
      { label: "Move into the bridge folder:", cmd: "cd bridge" },
      { label: "Create an isolated Python environment:", cmd: `${py} -m venv .venv` },
      {
        label: "Activate it:",
        cmd: activate,
        note: isWin
          ? 'If PowerShell blocks the script, run first: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass'
          : undefined,
      },
      { label: "Upgrade pip, then install the dependencies:", cmd: "python -m pip install --upgrade pip\npip install -r requirements.txt", multiline: true },
      ...(os === "linux"
        ? [
            {
              label: "Linux only — allow your user to send synthetic input via /dev/uinput:",
              cmd: `echo 'KERNEL=="uinput", GROUP="input", MODE="0660"' | sudo tee /etc/udev/rules.d/99-uinput.rules\nsudo usermod -aG input "$USER"\nsudo modprobe uinput\nsudo udevadm control --reload-rules && sudo udevadm trigger`,
              multiline: true,
              note: "Log out and back in afterwards so the new group takes effect.",
            },
          ]
        : []),
      ...(os === "macos"
        ? [
            {
              label:
                "macOS only — the first time you run the bridge, you'll be prompted to grant Accessibility + Input Monitoring permissions to your terminal. Approve both, then re-run.",
            },
          ]
        : []),
      {
        label: "Start the bridge daemon (keep this terminal open):",
        cmd: isWin ? "python omnipoint_bridge.py" : `${py} omnipoint_bridge.py`,
      },
      {
        label:
          "You should see something like: `BreezeControl bridge v1.0.0 — listening on ws://127.0.0.1:8765`.",
      },
    ],
  };

  const webStep: Section = {
    id: "web",
    title: "4. Run the BreezeControl web app",
    icon: Globe,
    intro:
      "You can either use the hosted version at breezecontrol.lovable.app, or run the web app on your own machine using Node + npm.",
    steps: [
      {
        label: "Easiest: just open the hosted app in Chrome / Edge.",
        cmd: "https://breezecontrol.lovable.app",
      },
      {
        label:
          "Or run it locally — install Node.js 18+ from nodejs.org first (one-shot above does this for you), then in a NEW terminal:",
      },
      { label: "Go back to the project root:", cmd: "cd .." },
      { label: "Install web dependencies:", cmd: "npm install" },
      { label: "Start the dev server:", cmd: "npm run dev" },
      {
        label: "Open the URL it prints (usually):",
        cmd: "http://localhost:8080",
      },
      ...(isWin
        ? [
            {
              label: 'PowerShell tip — `&&` is not supported. Run commands on separate lines, or use ";" between them.',
            },
          ]
        : []),
    ],
  };

  const connectStep: Section = {
    id: "connect",
    title: "5. Connect the web app to the bridge",
    icon: PlayCircle,
    steps: [
      { label: "Open the BreezeControl web app and click ENTER DEMO." },
      { label: "Allow camera access when prompted." },
      { label: "In the top toolbar, switch Control mode to Bridge." },
      {
        label: "The bridge URL is already filled in:",
        cmd: "ws://localhost:8765",
      },
      {
        label:
          'Open the Telemetry panel and click Test bridge — you should see "PROBE OK" and a green status dot.',
      },
      {
        label:
          "That's it — point your hand at the camera and your real OS cursor will move. Use ✊ (fist) as an emergency stop.",
      },
    ],
  };

  return [oneShot, pythonInstall, repoStep, bridgeStep, webStep, connectStep];
};

const isOS = (s: string | undefined): s is OS =>
  s === "windows" || s === "macos" || s === "linux";

const BridgeGuideOS = () => {
  const { os: osParam } = useParams();
  const navigate = useNavigate();
  const os: OS = isOS(osParam) ? osParam : "windows";
  const meta = OS_META[os];
  const Icon = meta.icon;
  const sections = useMemo(() => buildGuide(os), [os]);

  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${meta.label} install guide — BreezeControl`;
    if (!isOS(osParam)) navigate("/bridge", { replace: true });
  }, [meta.label, osParam, navigate]);

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b hairline px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-primary grid place-items-center">
            <Hand className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-sm">BreezeControl</span>
        </Link>
        <span className="font-mono text-[10px] tracking-[0.3em] text-emerald-glow">
          {meta.label.toUpperCase()} GUIDE
        </span>
      </header>

      <section className="max-w-3xl mx-auto px-4 py-8 sm:py-14">
        <Link
          to="/bridge"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.25em] text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> ALL PLATFORMS
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 grid place-items-center border border-primary/40 bg-primary/10 rounded-xl">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Install on {meta.label}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Complete walkthrough: Python → bridge daemon → web app → first gesture.
            </p>
          </div>
        </div>

        <div className="border border-warning/40 bg-warning/5 p-4 mb-8 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/90 leading-relaxed">
            <strong>Why install anything?</strong> Browsers can't move your real
            OS cursor (security). The bridge is a tiny local program that does
            it for you — about 5 minutes of setup, then it just works.
          </div>
        </div>

        {/* OS quick-switcher */}
        <div className="grid grid-cols-3 gap-1 mb-8 border hairline rounded-xl overflow-hidden">
          {(Object.keys(OS_META) as OS[]).map((k) => {
            const M = OS_META[k];
            const TabIcon = M.icon;
            const active = k === os;
            return (
              <Link
                key={k}
                to={`/bridge/${k}`}
                className={`h-10 inline-flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.25em] transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {M.label.toUpperCase()}
              </Link>
            );
          })}
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {sections.map((sec) => {
            const SecIcon = sec.icon;
            return (
              <section
                key={sec.id}
                className={
                  sec.highlight
                    ? "border-2 border-primary/40 bg-primary/[0.04] rounded-2xl p-5 -mx-1"
                    : ""
                }
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className={`w-8 h-8 grid place-items-center border rounded-lg ${
                      sec.highlight
                        ? "border-primary/60 bg-primary/15"
                        : "border-primary/30 bg-primary/5"
                    }`}
                  >
                    <SecIcon className={`w-4 h-4 ${sec.highlight ? "text-primary" : "text-primary"}`} />
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight">{sec.title}</h2>
                  {sec.highlight && (
                    <span className="ml-auto font-mono text-[10px] tracking-[0.25em] text-primary bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-full">
                      EASY
                    </span>
                  )}
                </div>
                {sec.intro && (
                  <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                    {sec.intro}
                  </p>
                )}
                <ol className="space-y-2">
                  {sec.steps.map((step, i) => (
                    <li
                      key={i}
                      className="border hairline bg-card/40 p-3 rounded-xl flex items-start gap-3"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-6 shrink-0 mt-1">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground">{step.label}</div>
                        {step.cmd && (
                          <div
                            className={`mt-1.5 flex ${
                              step.multiline ? "items-start" : "items-center"
                            } gap-2 bg-background border border-border px-3 py-2 rounded-lg`}
                          >
                            {step.multiline ? (
                              <pre className="flex-1 font-mono text-[12px] text-foreground/90 whitespace-pre-wrap break-all overflow-x-auto leading-relaxed m-0">
{step.cmd}
                              </pre>
                            ) : (
                              <code className="flex-1 font-mono text-[12.5px] text-foreground/90 break-all">
                                {step.cmd}
                              </code>
                            )}
                            <button
                              onClick={() => copy(step.cmd!)}
                              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
                              aria-label="Copy command"
                            >
                              {copied === step.cmd ? (
                                <Check className="w-4 h-4 text-[hsl(var(--success))]" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        )}
                        {step.note && (
                          <p className="mt-1.5 text-xs text-muted-foreground italic">
                            {step.note}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>

        {/* Resources */}
        <div className="grid sm:grid-cols-2 gap-3 mt-10">
          <a
            href={meta.pyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border hairline rounded-xl p-4 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <Download className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">Get Python for {meta.label}</div>
              <div className="text-xs text-muted-foreground">{meta.pyHint}</div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="border hairline rounded-xl p-4 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <Github className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">BreezeControl source</div>
              <div className="text-xs text-muted-foreground">on GitHub</div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
        </div>

        <div className="mt-8 border border-border bg-card rounded-xl p-5">
          <h2 className="font-mono text-[11px] tracking-[0.3em] text-emerald-glow mb-2">
            ▸ STUCK?
          </h2>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Open the in-app <strong>Troubleshooter</strong> from the Telemetry
            panel — it runs the same checks (port reachability, handshake,
            daemon status, permissions) and tells you exactly what's wrong.
          </p>
          <Link
            to="/demo"
            className="mt-3 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-primary hover:underline"
          >
            OPEN THE DEMO <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </section>
    </main>
  );
};

export default BridgeGuideOS;
