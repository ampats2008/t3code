# t3code Element Inspector Chrome Extension

A Chrome extension that lets you inspect UI elements on any web page and send context back to t3code's chat composer via WebSocket.

## Features

- **Element Inspection**: Hover over any element to highlight it and see detailed info
- **Component Detection**: Automatically detects React components and shows their source file
- **WebSocket Integration**: Sends inspected element references directly to t3code
- **Shadow DOM Isolation**: Inspector UI is isolated from the host page's styles
- **Keyboard Shortcut**: Toggle inspector with `Ctrl+Shift+X`

## Build

```bash
npm install
npm run build
```

For development with watch mode:

```bash
npm run dev
```

## Installation

1. Build the extension: `npm run build`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `extensions/chrome-element-inspector` directory

## Usage

1. Click the extension icon or press `Ctrl+Shift+X` to activate the inspector
2. Hover over any element to see a tooltip with details
3. Click an element to send it to t3code
4. Press `Esc` to exit inspector mode

## Configuration

The WebSocket connection defaults to `ws://127.0.0.1:27182`. Edit `src/background.ts` to change the URL.

## API

The extension uses the shared element inspector core (`packages/shared/src/elementInspectorCore.ts`) for all extraction logic:

- `extractTooltipData(el)` - Extract element info
- `formatText(data)` - Format element data as a "chip"
- `detectFramework(el)` - Detect if element is from React
