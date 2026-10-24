const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Helper to load src/index.js with a mocked `electron` module when running
 * in plain Node.js (outside of the Electron binary).
 */
function loadAppWithMocks() {
  const appendedSwitches = [];
  const windowInstances = [];
  const externalUrls = [];
  let beforeSendHeadersListener = null;
  let permissionRequestHandler = null;
  let powerSaveStarted = false;

  class MockBrowserWindow {
    constructor(options) {
      this.options = options;
      this.loadedUrl = null;
      this.windowOpenHandler = null;
      this.events = {};
      this.executedScripts = [];
      this.webContents = {
        setWindowOpenHandler: (fn) => {
          this.windowOpenHandler = fn;
        },
        on: (event, fn) => {
          this.events[event] = this.events[event] || [];
          this.events[event].push(fn);
        },
        loadURL: (url) => {
          this.loadedUrl = url;
        },
        executeJavaScript: (script) => {
          this.executedScripts.push(script);
          return Promise.resolve();
        },
      };
      windowInstances.push(this);
    }

    loadURL(url) {
      this.loadedUrl = url;
    }
  }

  MockBrowserWindow.getAllWindows = () => windowInstances;

  const mockElectron = {
    app: {
      quit: () => {},
      commandLine: {
        appendSwitch: (name, value) => {
          appendedSwitches.push({ name, value });
        },
      },
      whenReady: () => new Promise(() => {}),
      on: () => {},
      userAgentFallback: "",
    },
    BrowserWindow: MockBrowserWindow,
    powerSaveBlocker: {
      start: () => {
        powerSaveStarted = true;
        return 1;
      },
      isStarted: () => powerSaveStarted,
      stop: () => {
        powerSaveStarted = false;
      },
    },
    session: {
      defaultSession: {
        webRequest: {
          onBeforeSendHeaders: (filter, listener) => {
            beforeSendHeadersListener = { filter, listener };
          },
        },
        setPermissionRequestHandler: (handler) => {
          permissionRequestHandler = handler;
        },
      },
    },
    shell: {
      openExternal: (url) => {
        externalUrls.push(url);
      },
    },
  };

  const indexPath = require.resolve("../src/index.js");
  delete require.cache[indexPath];

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "electron") {
      return mockElectron;
    }
    if (request === "electron-squirrel-startup") {
      return false;
    }
    return origLoad.call(this, request, parent, isMain);
  };

  process.env.FREETUBE_TEST_MODE = "1";
  try {
    const appModule = require("../src/index.js");
    return {
      appModule,
      mockElectron,
      appendedSwitches,
      windowInstances,
      externalUrls,
      getBeforeSendHeaders: () => beforeSendHeadersListener,
      getPermissionHandler: () => permissionRequestHandler,
    };
  } finally {
    Module._load = origLoad;
  }
}

describe("FreeTubeTV Unit & Configuration Tests", () => {
  it("validates allowed URLs with isAllowedUrl()", () => {
    const { appModule } = loadAppWithMocks();
    const { isAllowedUrl } = appModule;

    // Allowed YouTube & Google Auth URLs
    assert.equal(isAllowedUrl("https://www.youtube.com/tv"), true);
    assert.equal(
      isAllowedUrl("https://www.youtube.com/tv#/?env_forceFullAnimation=true"),
      true,
    );
    assert.equal(isAllowedUrl("https://youtube.com/watch?v=123"), true);
    assert.equal(isAllowedUrl("https://music.youtube.com/"), true);
    assert.equal(isAllowedUrl("https://accounts.google.com/ServiceLogin"), true);
    assert.equal(isAllowedUrl("https://myaccount.google.com/"), true);

    // Rejected non-HTTPS or external/spoofed domains
    assert.equal(isAllowedUrl("http://www.youtube.com/tv"), false);
    assert.equal(isAllowedUrl("https://evil-youtube.com/"), false);
    assert.equal(isAllowedUrl("https://youtube.com.evil.com/"), false);
    assert.equal(isAllowedUrl("https://example.com/"), false);
    assert.equal(isAllowedUrl("javascript:alert(1)"), false);
    assert.equal(isAllowedUrl("file:///etc/passwd"), false);
    assert.equal(isAllowedUrl("not-a-valid-url"), false);
  });

  it("configures Chromium flags for background playback and sets PS4 Leanback User-Agent", () => {
    const { appModule, mockElectron, appendedSwitches } = loadAppWithMocks();

    assert.match(appModule.SMART_TV_UA, /PS4; Leanback Shell/);
    assert.equal(mockElectron.app.userAgentFallback, appModule.SMART_TV_UA);

    const switchNames = appendedSwitches.map((s) => s.name);
    assert.ok(switchNames.includes("disable-backgrounding-occluded-windows"));
    assert.ok(switchNames.includes("disable-renderer-backgrounding"));
    assert.ok(switchNames.includes("disable-background-timer-throttling"));
    assert.ok(switchNames.includes("disable-background-media-suspend"));

    const disableFeatures = appendedSwitches.find(
      (s) => s.name === "disable-features",
    );
    assert.ok(disableFeatures);
    assert.match(disableFeatures.value, /CalculateNativeWinOcclusion/);
    assert.match(disableFeatures.value, /BackgroundVideoOptimizations/);
  });

  it("creates BrowserWindow with hardened webPreferences, header spoofing, and navigation guards", () => {
    const {
      appModule,
      windowInstances,
      externalUrls,
      getBeforeSendHeaders,
      getPermissionHandler,
    } = loadAppWithMocks();

    const win = appModule.createWindow({ show: false });
    assert.equal(windowInstances.length, 1);
    assert.equal(win.loadedUrl, appModule.DEFAULT_URL);

    // Verify security & backgrounding webPreferences
    const prefs = win.options.webPreferences;
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.sandbox, true);
    assert.equal(prefs.webSecurity, true);
    assert.equal(prefs.allowRunningInsecureContent, false);
    assert.equal(prefs.backgroundThrottling, false);

    // Verify User-Agent spoofing on YouTube requests
    const headerHook = getBeforeSendHeaders();
    assert.ok(headerHook);
    assert.deepEqual(headerHook.filter.urls, ["*://*.youtube.com/*"]);
    let modifiedHeaders = null;
    headerHook.listener({ requestHeaders: {} }, (res) => {
      modifiedHeaders = res.requestHeaders;
    });
    assert.equal(modifiedHeaders["User-Agent"], appModule.SMART_TV_UA);

    // Verify permission handler only allows fullscreen and mediaKeySystem
    const permHandler = getPermissionHandler();
    assert.ok(permHandler);
    const checkPerm = (perm) => {
      let allowed = null;
      permHandler(null, perm, (res) => {
        allowed = res;
      });
      return allowed;
    };
    assert.equal(checkPerm("fullscreen"), true);
    assert.equal(checkPerm("mediaKeySystem"), true);
    assert.equal(checkPerm("geolocation"), false);
    assert.equal(checkPerm("notifications"), false);

    // Verify windowOpenHandler denies popups and forwards https links externally
    const popupRes = win.windowOpenHandler({ url: "https://example.com/help" });
    assert.deepEqual(popupRes, { action: "deny" });
    assert.ok(externalUrls.includes("https://example.com/help"));

    // Verify will-navigate blocks non-allowed URLs and allows YouTube/Google
    const willNavigate = win.events["will-navigate"][0];
    let prevented = false;
    willNavigate(
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      "https://accounts.google.com/signin",
    );
    assert.equal(prevented, false);

    willNavigate(
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      "https://external-site.org/page",
    );
    assert.equal(prevented, true);
    assert.ok(externalUrls.includes("https://external-site.org/page"));
  });

  it("patches visibility, focus, and blocked lifecycle events in preload.js", () => {
    const preloadSource = fs.readFileSync(
      path.join(__dirname, "../src/preload.js"),
      "utf8",
    );

    const windowListeners = {};
    const documentListeners = {};

    const sandbox = {
      window: {
        addEventListener: (type, fn) => {
          windowListeners[type] = windowListeners[type] || [];
          windowListeners[type].push(fn);
        },
      },
      document: {
        hidden: true,
        webkitHidden: true,
        visibilityState: "hidden",
        webkitVisibilityState: "hidden",
        hasFocus: () => false,
        addEventListener: (type, fn) => {
          documentListeners[type] = documentListeners[type] || [];
          documentListeners[type].push(fn);
        },
      },
      require: (mod) => {
        if (mod === "electron") {
          return {
            webFrame: {
              executeJavaScript: (code) => {
                vm.runInContext(code, context);
              },
            },
          };
        }
        throw new Error(`Unexpected module: ${mod}`);
      },
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(preloadSource, context);

    assert.equal(sandbox.document.hidden, false);
    assert.equal(sandbox.document.webkitHidden, false);
    assert.equal(sandbox.document.visibilityState, "visible");
    assert.equal(sandbox.document.webkitVisibilityState, "visible");
    assert.equal(sandbox.document.hasFocus(), true);

    // Subsequent attempts by page scripts to register visibilitychange or blur listeners are ignored
    let pageListenerCalled = false;
    sandbox.window.addEventListener("visibilitychange", () => {
      pageListenerCalled = true;
    });
    sandbox.document.addEventListener("blur", () => {
      pageListenerCalled = true;
    });

    // Click listeners should still be allowed
    let clickCalled = false;
    sandbox.window.addEventListener("click", () => {
      clickCalled = true;
    });
    assert.equal(windowListeners["click"].length, 1);
    windowListeners["click"][0]();
    assert.equal(clickCalled, true);
    assert.equal(pageListenerCalled, false);
  });

  it("validates forge.config.js and dependency integrity", () => {
    const forgeConfig = require("../forge.config.js");
    assert.equal(forgeConfig.packagerConfig.asar, true);
    assert.ok(Array.isArray(forgeConfig.makers));
    assert.ok(
      forgeConfig.makers.some((m) => m.name === "@electron-forge/maker-dmg"),
    );
    assert.ok(Array.isArray(forgeConfig.plugins));
    assert.equal(forgeConfig.plugins.length, 2);
  });
});
