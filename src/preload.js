const { webFrame } = require("electron");

const BLOCKED_EVENTS = [
  "visibilitychange",
  "webkitvisibilitychange",
  "mozvisibilitychange",
  "msvisibilitychange",
  "blur",
  "pagehide",
  "freeze",
];

// 1. Register capture-phase listeners in preload BEFORE any page scripts exist.
// DOM event dispatch is shared across worlds, so registering first in preload
// guarantees stopImmediatePropagation() blocks main-world listeners too.
for (const eventName of BLOCKED_EVENTS) {
  window.addEventListener(
    eventName,
    (event) => {
      event.stopImmediatePropagation();
      event.stopPropagation();
    },
    true,
  );
  document.addEventListener(
    eventName,
    (event) => {
      event.stopImmediatePropagation();
      event.stopPropagation();
    },
    true,
  );
}

// 2. Override Page Visibility & Focus APIs in the main world
const mainWorldPatch = `
(() => {
  const blockedEvents = new Set(${JSON.stringify(BLOCKED_EVENTS)});

  Object.defineProperty(document, "hidden", {
    get: () => false,
    configurable: true,
  });
  Object.defineProperty(document, "webkitHidden", {
    get: () => false,
    configurable: true,
  });
  Object.defineProperty(document, "visibilityState", {
    get: () => "visible",
    configurable: true,
  });
  Object.defineProperty(document, "webkitVisibilityState", {
    get: () => "visible",
    configurable: true,
  });
  document.hasFocus = () => true;

  for (const eventName of blockedEvents) {
    window.addEventListener(
      eventName,
      (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
      },
      true,
    );
    document.addEventListener(
      eventName,
      (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
      },
      true,
    );
  }

  const origWindowAdd = window.addEventListener;
  window.addEventListener = function (type, listener, options) {
    if (blockedEvents.has(type)) {
      return;
    }
    return origWindowAdd.call(this, type, listener, options);
  };

  const origDocAdd = document.addEventListener;
  document.addEventListener = function (type, listener, options) {
    if (blockedEvents.has(type)) {
      return;
    }
    return origDocAdd.call(this, type, listener, options);
  };
})();
`;

try {
  webFrame.executeJavaScript(mainWorldPatch);
} catch {
  // Fallback if webFrame.executeJavaScript is not ready at initial preload tick
}
