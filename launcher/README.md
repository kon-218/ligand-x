# Ligand-X Launcher

A cross-platform GUI launcher for the Ligand-X molecular analysis platform. Built with [Wails](https://wails.io/) (Go + Web technologies).

## Features

- **One-click start/stop** - No terminal needed
- **Service monitoring** - Real-time status of all Docker containers
- **Multiple start modes** - Development, Production, Core-only, etc.
- **Live logs** - Stream logs from any service
- **Quick links** - Open app, API docs, or task monitor in browser
- **Docker cleanup** - Manage Docker resources

## Prerequisites

1. **Docker** - Must be installed and running
2. **Docker Compose** - v2.0+ (comes with Docker Desktop)

## Download & Install

Download the latest release for your platform from the [Releases page](https://github.com/YOUR_ORG/ligand-x/releases):

### Windows

1. Download `ligandx-launcher-windows-amd64-installer.exe`
2. Run the installer
3. Launch from Start Menu → "Ligand-X Launcher"

### macOS

1. Download the appropriate DMG:
   - **Apple Silicon (M1/M2/M3)**: `ligandx-launcher-darwin-arm64.dmg`
   - **Intel**: `ligandx-launcher-darwin-amd64.dmg`
2. Open the DMG file
3. Drag "Ligand-X Launcher" to your Applications folder
4. Launch from Applications

> **Note**: On first launch, macOS may show "unidentified developer" warning. Right-click the app → Open → Click "Open" in the dialog.

### Linux

1. Download `ligandx-launcher-linux-amd64.AppImage`
2. Make it executable:
   ```bash
   chmod +x ligandx-launcher-linux-amd64.AppImage
   ```
3. Double-click to run, or:
   ```bash
   ./ligandx-launcher-linux-amd64.AppImage
   ```

> **Tip**: Move the AppImage to `~/.local/bin/` and it will be available in your application menu.

## Usage

1. **Launch** - Double-click the app or run from Start Menu/Applications
2. **Select project** - If not auto-detected, click the folder path in the footer to browse
3. **Choose mode** - Select Development, Production, or a partial stack
4. **Start** - Click the Start button
5. **Open app** - Click "Open App" to launch Ligand-X in your browser

## Start Modes

| Mode | Description |
|------|-------------|
| Development | Full stack with hot reload (volume mounts) |
| Production | Full stack with baked-in code |
| Core Only | Gateway, Frontend, Structure, Database, Redis |
| Core + Docking | Core plus docking service and CPU workers |
| Core + MD | Core plus MD service and GPU workers |

## Building from Source

### Requirements

- Go 1.21+
- Wails CLI v2.8+

### Install Wails CLI

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Platform-Specific Setup

#### Linux (Ubuntu/Debian)

Install development libraries:

```bash
sudo apt-get update
sudo apt-get install -y libgtk-3-dev pkg-config
```

**For Ubuntu 24.04 (Noble) or newer:**
```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev
```

**For Ubuntu 22.04 (Jammy) or older:**
```bash
sudo apt-get install -y libwebkit2gtk-4.0-dev
```

#### macOS

Install Xcode Command Line Tools (one-time):
```bash
xcode-select --install
```

#### Windows

No additional setup needed.

### Build Commands

```bash
cd launcher

# Development (with hot reload)
wails dev

# Build for current platform
wails build

# Build with NSIS installer (Windows)
wails build -nsis

# Build for specific platforms
wails build -platform windows/amd64
wails build -platform linux/amd64
wails build -platform darwin/amd64
wails build -platform darwin/arm64  # Apple Silicon
```

### Cross-Platform Build (via CI)

The recommended way to build for all platforms is via GitHub Actions:

1. Push a tag: `git tag launcher-v1.0.0 && git push origin launcher-v1.0.0`
2. GitHub Actions builds for all platforms automatically
3. Binaries are attached to the GitHub Release

See `.github/workflows/launcher-release.yml` for the CI configuration.

## Architecture

```
launcher/
├── main.go                 # Wails app entry point
├── app.go                  # Go backend (Docker SDK integration)
├── wails.json              # Wails configuration
├── go.mod                  # Go module
├── build/
│   ├── appicon.png         # App icon (1024x1024)
│   ├── appicon.svg         # Source icon (vector)
│   ├── darwin/
│   │   └── appicon.png     # macOS icon
│   ├── windows/
│   │   └── icon.ico        # Windows icon
│   └── linux/
│       └── ligandx-launcher.desktop  # Linux desktop entry
└── frontend/
    ├── index.html          # UI structure
    ├── style.css           # Modern dark theme
    └── app.js              # Frontend logic (Wails bindings)
```

### Key Technologies

- **Go + Docker SDK** - Native Docker control without shelling out
- **Wails v2** - Uses OS native WebView (small binary, fast startup)
- **Pure HTML/CSS/JS** - No build step, no npm, no frameworks

## Troubleshooting

### Build Issues

#### "webkit2gtk-4.0 was not found" (Ubuntu 24.04)

Ubuntu 24.04 only provides webkit2gtk-4.1, but Wails v2.11 is hardcoded to look for 4.0. You need to create a symlink:

```bash
sudo ln -s /usr/lib/x86_64-linux-gnu/pkgconfig/webkit2gtk-4.1.pc \
           /usr/lib/x86_64-linux-gnu/pkgconfig/webkit2gtk-4.0.pc
```

Then try building again.

**Alternative:** Use the GitHub Actions CI/CD to build (it handles this automatically).

#### "gtk+-3.0 was not found" (Linux)
You need to install development libraries. See [Platform-Specific Setup](#platform-specific-setup) above.

**Ubuntu 24.04 (Noble):**
```bash
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev pkg-config
```

**Ubuntu 22.04 (Jammy) or older:**
```bash
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev pkg-config
```

#### "wails: command not found"
Wails CLI is installed to `$(go env GOPATH)/bin/wails`. You can either:
- Add to PATH: `export PATH="$PATH:$(go env GOPATH)/bin"`
- Or use the full path: `$(go env GOPATH)/bin/wails dev`

### Runtime Issues

#### "Docker not running"
- Ensure Docker Desktop is running (or Docker daemon on Linux)
- On Linux, ensure your user is in the `docker` group: `sudo usermod -aG docker $USER`

#### "docker-compose.yml not found"
- Click the folder icon in the footer to select the Ligand-X project directory
- The launcher expects `docker-compose.yml` in the selected folder

#### Services not starting
- Check the logs panel for error messages
- Ensure ports 3000, 8000, 5432, 6379, 5672 are available
- Try "Clean" to remove stale Docker resources

#### macOS "unidentified developer" warning
This happens because the app isn't code-signed with an Apple Developer certificate:
- Right-click the app → Open → Click "Open" in the dialog
- Or: System Preferences → Security & Privacy → Click "Open Anyway"

#### Linux AppImage won't run
Make sure FUSE is installed and the file is executable:
```bash
# Install FUSE (Ubuntu/Debian)
sudo apt-get install libfuse2

# Make executable
chmod +x ligandx-launcher-linux-amd64.AppImage

# Run
./ligandx-launcher-linux-amd64.AppImage
```

## Development

### Setting Up Your Development Environment

1. **Install Wails CLI:**
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```

2. **Install platform dependencies** (see Platform-Specific Setup above)

3. **Navigate to launcher directory:**
   ```bash
   cd launcher
   ```

### Running in development mode

```bash
cd launcher
wails dev
```

Or use the convenience script:
```bash
cd launcher
./scripts/build-dev.sh
```

This provides:
- Hot reload for frontend changes
- Go rebuilds on backend changes
- Browser DevTools (Ctrl+Shift+I)
- Dev server at `http://localhost:34115`

The first build may take a minute on Linux due to dependencies being compiled. Subsequent rebuilds are much faster.

**Note:** On Ubuntu 24.04, you may need to create a webkit symlink first (see Troubleshooting).

### Testing Docker integration

```bash
# Test Docker SDK connection
cd launcher
go run . -test-docker
```

### Regenerating Icons

If you update the app icon:

```bash
cd launcher

# From SVG source (requires ImageMagick)
convert -background none build/appicon.svg -resize 1024x1024 build/appicon.png
convert -background none build/appicon.svg -resize 1024x1024 build/darwin/appicon.png
convert -background none build/appicon.svg -resize 256x256 \
  -define icon:auto-resize=256,128,64,48,32,16 build/windows/icon.ico

# Or use Wails to generate from PNG
wails generate icons build/appicon.png
```

## License

Same as the main Ligand-X project.
