const assert = require("node:assert/strict");
const http = require("node:http");

process.env.FREETUBE_TEST_MODE = "1";
process.env.FREETUBE_HEADLESS = "1";

const { app, powerSaveBlocker } = require("electron");
const { SMART_TV_UA, createWindow } = require("../src/index.js");

async function runIntegrationTests() {
  let lastRequestHeaders = null;

  const server = http.createServer((req, res) => {
    lastRequestHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html>
      <html>
        <head><title>FreeTube Test Page</title></head>
        <body>
          <h1 id="status">Ready</h1>
          <script>
            window.__eventsFired = [];
            for (const evt of ["visibilitychange", "webkitvisibilitychange", "blur", "pagehide", "freeze"]) {
              window.addEventListener(evt, () => window.__eventsFired.push("win:" + evt));
              document.addEventListener(evt, () => window.__eventsFired.push("doc:" + evt));
            }
          </script>
        </body>
      </html>`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const testUrl = `http://127.0.0.1:${port}/`;

  try {
    await app.whenReady();

    // 1. Verify powerSaveBlocker starts cleanly
    const blockerId = powerSaveBlocker.start("prevent-app-suspension");
    assert.equal(
      powerSaveBlocker.isStarted(blockerId),
      true,
      "powerSaveBlocker should be active",
    );

    // 2. Create BrowserWindow pointed at local test server
    const win = createWindow({ url: testUrl, show: false });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for did-finish-load")),
        15000,
      );
      win.webContents.once("did-finish-load", () => {
        clearTimeout(timeout);
        resolve();
      });
      win.webContents.once(
        "did-fail-load",
        (_event, code, desc) => {
          clearTimeout(timeout);
          reject(new Error(`Page failed to load: ${code} ${desc}`));
        },
      );
    });

    // 3. Verify User-Agent fallback is active on HTTP requests and navigator.userAgent
    assert.ok(lastRequestHeaders, "Test server should have received request");
    assert.equal(
      lastRequestHeaders["user-agent"],
      SMART_TV_UA,
      "HTTP User-Agent header should match SMART_TV_UA",
    );

    // 4. Verify Preload & Keep-Alive DOM overrides inside the real Chromium renderer
    const rendererState = await win.webContents.executeJavaScript(`
      (() => {
        for (const evt of ["visibilitychange", "webkitvisibilitychange", "blur", "pagehide", "freeze"]) {
          window.dispatchEvent(new Event(evt));
          document.dispatchEvent(new Event(evt));
        }
        return {
          userAgent: navigator.userAgent,
          hidden: document.hidden,
          webkitHidden: document.webkitHidden,
          visibilityState: document.visibilityState,
          webkitVisibilityState: document.webkitVisibilityState,
          hasFocus: document.hasFocus(),
          eventsFired: window.__eventsFired,
        };
      })()
    `);

    assert.equal(rendererState.userAgent, SMART_TV_UA);
    assert.equal(rendererState.hidden, false);
    assert.equal(rendererState.webkitHidden, false);
    assert.equal(rendererState.visibilityState, "visible");
    assert.equal(rendererState.webkitVisibilityState, "visible");
    assert.equal(rendererState.hasFocus, true);
    assert.deepEqual(
      rendererState.eventsFired,
      [],
      "Blocked visibility/blur events must not reach page listeners",
    );

    // Cleanup
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
    win.destroy();
    console.log("✔ Electron runtime integration tests passed!");
  } finally {
    server.close();
  }
}

runIntegrationTests()
  .then(() => {
    app.quit();
    process.exit(0);
  })
  .catch((err) => {
    console.error("✖ Electron integration test failed:", err);
    app.quit();
    process.exit(1);
  });
