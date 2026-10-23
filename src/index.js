const path = require("path");
const {
  app,
  BrowserWindow,
  powerSaveBlocker,
  session,
  shell,
} = require("electron");

const SMART_TV_UA =
  "Mozilla/5.0 (PS4; Leanback Shell) Gecko/20100101 Firefox/65.0 LeanbackShell/01.00.01.75 Sony PS4/ (PS4, , no, CH)";

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "accounts.google.com",
]);

const isAllowedUrl = (urlString) => {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:") {
      return false;
    }
    return (
      ALLOWED_HOSTS.has(parsed.hostname) ||
      parsed.hostname.endsWith(".youtube.com") ||
      parsed.hostname.endsWith(".google.com")
    );
  } catch {
    return false;
  }
};

if (require("electron-squirrel-startup")) {
  app.quit();
}

// Prevent Chromium from treating the window as hidden/occluded when the
// macOS screensaver or lock screen covers it, and prevent media/timer suspension.
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-background-media-suspend");
app.commandLine.appendSwitch(
  "disable-features",
  "CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,BackgroundVideoOptimizations,MediaSessionService",
);

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1100,
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      // Ignore invalid URLs
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isAllowedUrl(navigationUrl)) {
      event.preventDefault();
      try {
        const parsed = new URL(navigationUrl);
        if (parsed.protocol === "https:") {
          shell.openExternal(navigationUrl);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  mainWindow.loadURL(
    "https://www.youtube.com/tv#/?env_forceFullAnimation=true",
  );

  const filter = {
    urls: ["*://*.youtube.com/*"],
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(
    filter,
    (details, callback) => {
      details.requestHeaders["User-Agent"] = SMART_TV_UA;
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  const allowedPermissions = new Set(["fullscreen", "mediaKeySystem"]);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(allowedPermissions.has(permission));
    },
  );

  // mainWindow.webContents.openDevTools();
  const keepAliveScript = `
    Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
    Object.defineProperty(document, "webkitHidden", { get: () => false, configurable: true });
    Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true });
    Object.defineProperty(document, "webkitVisibilityState", { get: () => "visible", configurable: true });
    document.hasFocus = () => true;

    for (let event_name of ["visibilitychange", "webkitvisibilitychange", "blur", "pagehide", "freeze"]) {
      window.addEventListener(event_name, function(event) {
        event.stopImmediatePropagation();
      }, true);
      document.addEventListener(event_name, function(event) {
        event.stopImmediatePropagation();
      }, true);
    }
  `;

  mainWindow.webContents.executeJavaScript(keepAliveScript, true).catch(() => {});

  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents
      .executeJavaScript(keepAliveScript, true)
      .then(() => {
        console.log("Enjoy FreeTube TV");
      })
      .catch(() => {});
  });
};

app.userAgentFallback = SMART_TV_UA;

let powerSaveBlockerId = null;

app.whenReady().then(() => {
  powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  if (
    powerSaveBlockerId !== null &&
    powerSaveBlocker.isStarted(powerSaveBlockerId)
  ) {
    powerSaveBlocker.stop(powerSaveBlockerId);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
