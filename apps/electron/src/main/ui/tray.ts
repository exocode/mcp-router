import { app, Menu, Tray, nativeImage, type NativeImage } from "electron";
// Bundled as base64 data URLs at build time (see webpack.rules.ts) so the icons
// always ship regardless of packaging. macOS uses a monochrome, transparent
// template icon for the menu bar; other platforms use the full-color logo.
import trayTemplateDataUrl from "../../../public/images/icon/tray-icon.png?inline";
import trayColorDataUrl from "../../../public/images/icon/icon.png?inline";
import { MCPServerManager } from "@/main/modules/mcp-server-manager/mcp-server-manager";
import { mainWindow } from "../../main";

// Global tray instance
let tray: Tray | null = null;

function getTrayIcon(): NativeImage {
  // Linux typically needs 22x22 or 24x24 for better visibility
  const size =
    process.platform === "darwin" ? 20 : process.platform === "linux" ? 22 : 16;

  if (process.platform === "darwin") {
    // macOS menu bar: monochrome template image (alpha-only, adapts to
    // light/dark). Needs a transparent black icon — the full-color app icon has
    // an opaque background and would render as a solid blob.
    const image = nativeImage
      .createFromDataURL(trayTemplateDataUrl)
      .resize({ width: size, height: size, quality: "best" });
    image.setTemplateImage(true);
    return image;
  }

  // Windows / Linux: full-color logo for visibility on any tray background.
  return nativeImage
    .createFromDataURL(trayColorDataUrl)
    .resize({ width: size, height: size, quality: "best" });
}

/**
 * Creates the system tray icon and menu
 * @param serverManager The MCPServerManager instance to get server info
 */
export function createTray(serverManager: MCPServerManager): Tray | null {
  try {
    const icon = getTrayIcon();

    tray = new Tray(icon);
    tray.setToolTip("MCP Router");
  } catch (error) {
    console.error("Failed to create tray with icon, using default:", error);
    // As a last resort, use a system standard icon
    tray = new Tray(app.getPath("exe"));
    tray.setToolTip("MCP Router");
  }

  // Set tray context menu
  updateTrayContextMenu(serverManager);

  // Add click handlers for tray
  if (process.platform === "darwin") {
    // On macOS, single-click will show the context menu
    // and double-click opens the main window
    tray.on("double-click", () => {
      if (app.dock) {
        app.dock.show();
      }

      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        createOrShowMainWindow();
      }
    });

    // Single-click shows context menu on macOS
    tray.on("click", () => {
      tray?.popUpContextMenu();
    });
  } else if (process.platform === "linux") {
    // On Linux, left-click toggles window visibility
    // Right-click shows context menu (default behavior)
    tray.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createOrShowMainWindow();
      }
    });
  } else {
    // On Windows, right-click will show the context menu (default)
    // Left-click will also show the context menu instead of opening window
    tray.on("click", () => {
      tray?.popUpContextMenu();
    });
  }

  return tray;
}

/**
 * Updates the tray context menu based on current server status
 * @param serverManager The MCPServerManager instance to get server info
 */
export function updateTrayContextMenu(serverManager: MCPServerManager): void {
  if (!tray) return;

  // Get all servers and filter to running ones
  const allServers = serverManager.getServers();
  const runningServers = allServers.filter(
    (server) => server.status === "running",
  );

  const runningServerMenuItems = runningServers.map((server) => {
    return {
      label: server.name,
      enabled: false, // Just display the name, not clickable
    };
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "MCP Router",
      click: () => {
        // Show the app in the Dock on macOS when clicked from context menu
        if (process.platform === "darwin" && app.dock) {
          app.dock.show();
        }

        createOrShowMainWindow();
      },
    },
    { type: "separator" as const },
    ...(runningServerMenuItems.length > 0
      ? [
          { label: "Running Servers:", enabled: false },
          ...runningServerMenuItems,
          { type: "separator" as const },
        ]
      : []),
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Helper function to create or show the main window
 */
function createOrShowMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    // We need to rely on the caller to create a new window if one doesn't exist
    // as we don't have access to the createWindow function here
    console.log("No main window found to show");
  }
}
