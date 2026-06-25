import { ipcMain, app, autoUpdater } from "electron";
import * as net from "net";
import { commandExists } from "@/main/utils/env-utils";
import { API_BASE_URL, mainWindow } from "@/main";

let isUpdateAvailable = false;
let isAutoUpdateInProgress = false;

// Set up autoUpdater event listeners
autoUpdater.on("update-downloaded", () => {
  isUpdateAvailable = true;
  // Notify renderer process about available update
  if (mainWindow) {
    mainWindow.webContents.send("update:downloaded", true);
  }
});

export function setupSystemHandlers(): void {
  // System info and commands
  ipcMain.handle("system:getPlatform", () => {
    return process.platform;
  });

  // App version (from package.json / Electron app)
  ipcMain.handle("system:getAppVersion", () => {
    return app.getVersion();
  });

  // Check if a command exists in user shell environment
  ipcMain.handle("system:commandExists", async (_, command: string) => {
    const result = await commandExists(command);
    return result;
  });

  // Feedback submission
  ipcMain.handle("system:submitFeedback", async (_, feedback: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedback }),
      });
      return response.ok;
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      return false;
    }
  });

  // Update management
  ipcMain.handle("system:checkForUpdates", () => {
    return {
      updateAvailable: isUpdateAvailable,
    };
  });

  ipcMain.handle("system:installUpdate", () => {
    if (isUpdateAvailable) {
      isAutoUpdateInProgress = true;
      autoUpdater.quitAndInstall();
      app.quit();
      return true;
    }
    return false;
  });

  // Application restart
  ipcMain.handle("system:restartApp", () => {
    app.quit();
    return true;
  });

  // Check whether a TCP port is free to bind (used by the Settings port picker)
  ipcMain.handle(
    "system:checkPortAvailable",
    (_, port: number): Promise<boolean> => {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return Promise.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        const tester = net.createServer();
        tester.once("error", () => resolve(false));
        tester.once("listening", () => {
          tester.close(() => resolve(true));
        });
        tester.listen(port);
      });
    },
  );
}

export function getIsAutoUpdateInProgress(): boolean {
  return isAutoUpdateInProgress;
}
