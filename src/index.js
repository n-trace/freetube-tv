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
  "myaccount.google.com",
]);

const ALLOWED_PERMISSIONS = new Set(["fullscreen", "mediaKeySystem"]);

const DEFAULT_URL = "https://www.youtube.com/tv#/?env_forceFullAnimation=true";

const isAllowedUrl = (urlString) => {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:") {
      return false;
    }
    return (
      ALLOWED_HOSTS.has(parsed.hostname) ||
      parsed.hostname.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
};

const openExternalSafely = (urlString) => {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol === "https:") {
      shell.openExternal(urlString);
    }
  } catch {
    // Ignore invalid URLs
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

let sessionConfigured = false;

const configureSession = () => {
  if (sessionConfigured) {
    return;
  }
  sessionConfigured = true;

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

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    },
  );

  if (typeof session.defaultSession.setPermissionCheckHandler === "function") {
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission) => ALLOWED_PERMISSIONS.has(permission),
    );
  }
};

const createWindow = (options = {}) => {
  configureSession();

  const isPackaged = Boolean(app.isPackaged);
  const candidateUrl = isPackaged
    ? DEFAULT_URL
    : options.url || process.env.FREETUBE_TARGET_URL || DEFAULT_URL;
  const targetUrl =
    isPackaged && !isAllowedUrl(candidateUrl) ? DEFAULT_URL : candidateUrl;

  const showWindow = isPackaged
    ? true
    : options.show !== undefined
      ? options.show
      : process.env.FREETUBE_HEADLESS !== "1";

  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1100,
    show: showWindow,
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });

  const handleNavigation = (event, navigationUrl) => {
    if (!isAllowedUrl(navigationUrl)) {
      event.preventDefault();
      openExternalSafely(navigationUrl);
    }
  };

  mainWindow.webContents.on("will-navigate", handleNavigation);
  mainWindow.webContents.on("will-redirect", handleNavigation);

  mainWindow.loadURL(targetUrl);

  return mainWindow;
};

app.userAgentFallback = SMART_TV_UA;

let powerSaveBlockerId = null;

if (app.isPackaged || process.env.FREETUBE_TEST_MODE !== "1") {
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
}

module.exports = {
  SMART_TV_UA,
  ALLOWED_HOSTS,
  ALLOWED_PERMISSIONS,
  DEFAULT_URL,
  isAllowedUrl,
  configureSession,
  createWindow,
};
