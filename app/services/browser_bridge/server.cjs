"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const HOST = process.env.GROK_CLOAK_HOST || "127.0.0.1";
const PORT = parseInt(process.env.GROK_CLOAK_PORT || "9081", 10);
const NAV_TIMEOUT = parseInt(process.env.GROK_CLOAK_NAV_TIMEOUT_MS || "45000", 10);
const READY_TIMEOUT = parseInt(process.env.GROK_CLOAK_READY_TIMEOUT_MS || "30000", 10);
const REQUEST_TIMEOUT = parseInt(process.env.GROK_CLOAK_REQUEST_TIMEOUT_MS || "120000", 10);
const PAGE_IDLE_MS = parseInt(process.env.GROK_CLOAK_IDLE_PAGE_MS || "300000", 10);
const MAX_PAGES = parseInt(process.env.GROK_CLOAK_MAX_PAGES || "4", 10);
const HEADLESS = String(process.env.GROK_CLOAK_HEADLESS || "true").toLowerCase() !== "false";
const EXECUTABLE_PATH = (process.env.GROK_CLOAK_EXECUTABLE_PATH || "").trim();
const PROFILE_DIR = (process.env.GROK_CLOAK_PROFILE_DIR || "").trim();
const DIAG_DIR = (process.env.GROK_CLOAK_DIAG_DIR || "").trim();
const PROXY_URL = (process.env.GROK_CLOAK_PROXY_URL || "").trim();
const DEFAULT_USER_AGENT = (process.env.GROK_CLOAK_USER_AGENT || "").trim();
const CF_COOKIES_JSON = (process.env.GROK_CLOAK_CF_COOKIES_JSON || "").trim();
const CF_WAIT_TIMEOUT_MS = parseInt(process.env.GROK_CLOAK_CF_WAIT_TIMEOUT_MS || "90000", 10);
const MINIMAL_LOAD = String(process.env.GROK_CLOAK_MINIMAL_LOAD || "true").toLowerCase() !== "false";
const RETAIN_STATIC_CACHE = String(process.env.GROK_CLOAK_RETAIN_STATIC_CACHE || "true").toLowerCase() !== "false";
const CHAT_INPUT_TIMEOUT_MS = parseInt(
  process.env.GROK_CLOAK_CHAT_INPUT_TIMEOUT_MS || "15000",
  10
);

let browser = null;
const pages = new Map();
let lastError = null;
const sessionSnapshots = new Map();
const PROFILE_SLOT_KEY = "__profile__";
const HOME_URL = "https://grok.com/";
const PRIVATE_CHAT_URL = process.env.GROK_CLOAK_PRIVATE_CHAT_URL || HOME_URL;
const PROBE_MESSAGE = process.env.GROK_CLOAK_PROBE_MESSAGE || "你好";
const SESSION_COOKIES_JSON = (process.env.GROK_CLOAK_SESSION_COOKIES_JSON || "").trim();
const CACHED_PROBE_JSON = (process.env.GROK_CLOAK_CACHED_PROBE_JSON || "").trim();
const PROBE_CONSUME_UPSTREAM = String(process.env.GROK_CLOAK_PROBE_CONSUME_UPSTREAM || "false").toLowerCase() === "true";

function parseCookiesJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const name = String(item.name || "").trim();
        const value = String(item.value || "");
        if (!name) return null;
        const domain = String(item.domain || ".grok.com").trim() || ".grok.com";
        const path = String(item.path || "/").trim() || "/";
        const sameSiteRaw = String(item.sameSite || "").trim().toLowerCase();
        let sameSite = undefined;
        if (sameSiteRaw === "lax") sameSite = "Lax";
        else if (sameSiteRaw === "strict") sameSite = "Strict";
        else if (sameSiteRaw === "none" || sameSiteRaw === "no_restriction") sameSite = "None";
        const cookie = {
          name,
          value,
          domain,
          path,
          httpOnly: Boolean(item.httpOnly),
          secure: item.secure !== false,
        };
        if (sameSite) cookie.sameSite = sameSite;
        if (typeof item.expirationDate === "number" && Number.isFinite(item.expirationDate)) {
          cookie.expires = item.expirationDate;
        }
        return cookie;
      })
      .filter(Boolean);
  } catch (error) {
    log(`cookies json parse failed: ${error.message}`);
    return [];
  }
}

function parseInjectedCookies() {
  return parseCookiesJson(SESSION_COOKIES_JSON);
}

function serializeCookiesForConfig(cookies) {
  return (cookies || [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      if (!name) return null;
      const serialized = {
        name,
        value: String(item.value ?? ""),
        domain: String(item.domain || ".grok.com").trim() || ".grok.com",
        path: String(item.path || "/").trim() || "/",
        secure: item.secure !== false,
        httpOnly: Boolean(item.httpOnly),
      };
      const sameSite = String(item.sameSite || "").trim();
      if (sameSite) serialized.sameSite = sameSite;
      if (typeof item.expires === "number" && Number.isFinite(item.expires)) {
        serialized.expirationDate = item.expires;
      }
      return serialized;
    })
    .filter(Boolean);
}

function parseCfCookies() {
  return parseCookiesJson(CF_COOKIES_JSON);
}

function mergeCookies(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const cookie of list || []) {
      if (cookie && cookie.name) {
        map.set(cookie.name, cookie);
      }
    }
  }
  return [...map.values()];
}

function buildProxyOption() {
  if (!PROXY_URL) return undefined;
  return { server: PROXY_URL };
}

function parseCachedProbe() {
  if (!CACHED_PROBE_JSON) return {};
  try {
    const parsed = JSON.parse(CACHED_PROBE_JSON);
    if (!parsed || typeof parsed !== "object") return {};
    return {
      user_agent: String(parsed.user_agent || "").trim(),
      x_statsig_id: String(parsed.x_statsig_id || "").trim(),
      request_headers:
        parsed.request_headers && typeof parsed.request_headers === "object"
          ? parsed.request_headers
          : {},
    };
  } catch (error) {
    log(`cached probe json parse failed: ${error.message}`);
    return {};
  }
}

const CACHED_PROBE = parseCachedProbe();

function getEffectiveUserAgent() {
  return DEFAULT_USER_AGENT || CACHED_PROBE.user_agent || "";
}

function buildTemporaryProbePayload(basePayload = {}, pageInfo = {}) {
  const viewport = pageInfo.viewport || {};
  const screen = pageInfo.screen || {};
  return {
    temporary: true,
    message: PROBE_MESSAGE,
    fileAttachments: [],
    imageAttachments: [],
    disableSearch: false,
    enableImageGeneration: true,
    returnImageBytes: false,
    returnRawGrokInXaiRequest: false,
    enableImageStreaming: true,
    imageGenerationCount: 2,
    forceConcise: false,
    enableSideBySide: true,
    sendFinalMetadata: true,
    disableTextFollowUps: false,
    responseMetadata: {},
    disableMemory: false,
    forceSideBySide: false,
    isAsyncChat: false,
    disableSelfHarmShortCircuit: false,
    collectionIds: [],
    disabledConnectorIds: [],
    deviceEnvInfo: {
      darkModeEnabled: Boolean(pageInfo.darkModeEnabled),
      devicePixelRatio: pageInfo.devicePixelRatio || 1,
      screenWidth: screen.width || 1600,
      screenHeight: screen.height || 1000,
      viewportWidth: viewport.width || 1600,
      viewportHeight: viewport.height || 1000,
    },
    modeId: "auto",
    linkQuery: false,
    ...basePayload,
    temporary: true,
    message: PROBE_MESSAGE,
  };
}

class BridgeError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.status = status;
  }
}

function log(message) {
  console.log(`[cloakbridge] ${new Date().toISOString()} ${message}`);
}

function appChatRequestHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith("x-") ||
      lower.startsWith("sec-ch-") ||
      lower === "baggage" ||
      lower === "accept-language" ||
      lower === "priority"
    ) {
      result[lower] = value;
    }
  }
  return result;
}

function isConversationSubmitUrl(url) {
  return (
    url.includes("/rest/app-chat/conversations/new") ||
    /\/rest\/app-chat\/conversations\/[^/]+\/responses(?:\?|$)/.test(url)
  );
}

function isNewConversationSubmitUrl(url) {
  return url.includes("/rest/app-chat/conversations/new");
}

function isResponseSubmitUrl(url) {
  return /\/rest\/app-chat\/conversations\/[^/]+\/responses(?:\?|$)/.test(url);
}

function extractSsoFromCookies(cookies) {
  const ssoCookie = (cookies || []).find((item) => item.name === "sso-rw" || item.name === "sso");
  return ssoCookie ? String(ssoCookie.value || "").trim() : "";
}

function snapshotKeys(slot) {
  const keys = [slot.key || PROFILE_SLOT_KEY];
  if (slot.sso && !keys.includes(slot.sso)) {
    keys.push(slot.sso);
  }
  return keys;
}


const STATSIG_DIGEST_MARKER = "obfiowerehiring";


async function injectStatsigCaptureHookNow(page) {
  try {
    await page.evaluate(() => {
      const MARKER = "obfiowerehiring";
      if (window.__grokStatsigCaptureHooked) return;
      window.__grokStatsigCaptureHooked = true;
      window.__grokStatsigCapture = window.__grokStatsigCapture || [];
      const subtle = globalThis.crypto && globalThis.crypto.subtle;
      if (!subtle || typeof subtle.digest !== "function") return;
      const originalDigest = subtle.digest.bind(subtle);
      subtle.digest = function (algorithm, data) {
        try {
          const bytes =
            data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(data.buffer || data);
          const text = new TextDecoder().decode(bytes);
          const idx = text.indexOf(MARKER);
          if (idx >= 0) {
            const meta =
              document.querySelector('meta[name="grok-site\u2015verification"]') ||
              document.querySelector('[name^="gr"]');
            const seed = meta
              ? String(meta.content || meta.getAttribute("content") || "")
              : "";
            window.__grokStatsigCapture.push({
              ts: Date.now(),
              seed,
              hex: text.slice(idx + MARKER.length),
            });
          }
        } catch (_) {}
        return originalDigest(algorithm, data);
      };
    });
    return true;
  } catch (error) {
    log(`statsig capture hook inject-now failed: ${error.message}`);
    return false;
  }
}
async function ensureStatsigCaptureHook(page) {
  try {
    await installStatsigCaptureHook(page);
    await injectStatsigCaptureHookNow(page);
    const hooked = await page
      .evaluate(() => Boolean(window.__grokStatsigCaptureHooked))
      .catch(() => false);
    if (!hooked) {
      log("statsig capture hook not active after install");
    }
  } catch (error) {
    log(`statsig capture hook ensure failed: ${error.message}`);
  }
}
async function installStatsigCaptureHook(page) {
  try {
    await page.addInitScript(() => {
      const MARKER = "obfiowerehiring";
      if (window.__grokStatsigCaptureHooked) return;
      window.__grokStatsigCaptureHooked = true;
      window.__grokStatsigCapture = [];
      const subtle = globalThis.crypto && globalThis.crypto.subtle;
      if (!subtle || typeof subtle.digest !== "function") return;
      const originalDigest = subtle.digest.bind(subtle);
      subtle.digest = function (algorithm, data) {
        try {
          const bytes =
            data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(data.buffer || data);
          const text = new TextDecoder().decode(bytes);
          const idx = text.indexOf(MARKER);
          if (idx >= 0) {
            const meta =
              document.querySelector('meta[name="grok-site\u2015verification"]') ||
              document.querySelector('[name^="gr"]');
            const seed = meta
              ? String(meta.content || meta.getAttribute("content") || "")
              : "";
            window.__grokStatsigCapture.push({
              ts: Date.now(),
              seed,
              hex: text.slice(idx + MARKER.length),
            });
          }
        } catch (_) {}
        return originalDigest(algorithm, data);
      };
    });
  } catch (error) {
    log(`statsig capture hook install failed: ${error.message}`);
  }
}


async function readStatsigPairFromDom(page) {
  try {
    return await page.evaluate(() => {
      const meta =
        document.querySelector('meta[name="grok-site\u2015verification"]') ||
        document.querySelector('[name^="gr"]');
      const seed = meta ? String(meta.content || meta.getAttribute("content") || "").trim() : "";
      if (!seed || seed.length < 8) {
        return { seed: "", hex: "" };
      }
      const pickIndex = seed.charCodeAt(5) % 4;
      const pathNodes = [
        ...document.querySelectorAll('path[d]'),
        ...document.querySelectorAll('svg path[d]'),
      ];
      const paths = pathNodes
        .map((node) => String(node.getAttribute("d") || "").trim())
        .filter((d) => d.startsWith("M"));
      if (!paths.length) {
        return { seed, hex: "" };
      }
      const d = paths[pickIndex % paths.length] || paths[0];
      const parts = d.slice(9).split("C");
      const nums = [];
      for (const part of parts) {
        const matches = part.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || [];
        for (const m of matches) {
          const n = Number(m);
          if (Number.isFinite(n)) nums.push(n);
        }
      }
      if (!nums.length) {
        return { seed, hex: "" };
      }
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const span = max - min || 1;
      const norm = nums.map((n) => (n - min) / span);
      const bytes = new Uint8Array(norm.length * 8);
      const view = new DataView(bytes.buffer);
      norm.forEach((val, i) => view.setFloat64(i * 8, val, true));
      let hex = "";
      for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      return { seed, hex };
    });
  } catch (_) {
    return { seed: "", hex: "" };
  }
}

async function resolveStatsigPair(page) {
  const captured = await readCapturedStatsigPair(page);
  if (isValidStatsigPair(captured)) return captured;
  const domPair = await readStatsigPairFromDom(page);
  if (isValidStatsigPair(domPair)) return domPair;
  return { seed: "", hex: "" };
}

async function readCapturedStatsigPair(page) {
  try {
    return await page.evaluate(() => {
      const list = window.__grokStatsigCapture || [];
      const last = list[list.length - 1];
      if (!last || !last.seed || !last.hex) {
        return { seed: "", hex: "" };
      }
      return { seed: String(last.seed), hex: String(last.hex) };
    });
  } catch (_) {
    return { seed: "", hex: "" };
  }
}

function isValidStatsigPair(pair){if(!pair||!pair.seed||!pair.hex)return false;const seed=String(pair.seed).trim();const hex=String(pair.hex).trim();if(seed.length<40||seed.length>96)return false;if(!/^[0-9a-fA-F]+$/.test(hex))return false;if(hex.length<60||hex.length>68)return false;return true;} function mergeStatsigPairIntoSnapshot(snapshot, pair) { if(!isValidStatsigPair(pair)) return snapshot;
  if (!pair || !pair.seed || !pair.hex) return snapshot;
  return {
    ...snapshot,
    statsig_seed: String(pair.seed),
    statsig_hex: String(pair.hex),
  };
}

async function captureProbeSnapshot(slot, request, payload) {
  const headers = appChatRequestHeaders(await request.allHeaders());
  const previous =
    sessionSnapshots.get(slot.sso || "") || sessionSnapshots.get(slot.key || PROFILE_SLOT_KEY) || {};
  const statsig = headers["x-statsig-id"] || previous.x_statsig_id || "";
  const snapshot = {
    ...previous,
    sso: slot.sso || "",
    request_headers: headers,
    x_statsig_id: statsig,
    captured_at: new Date().toISOString(),
  };
  let finalSnapshot = snapshot;
  const pair = await resolveStatsigPair(slot.page);
  finalSnapshot = mergeStatsigPairIntoSnapshot(snapshot, pair);
  for (const snapshotKey of snapshotKeys(slot)) {
    sessionSnapshots.set(snapshotKey, finalSnapshot);
  }
  log(
    `captured unconsumed probe headers url=https://grok.com/rest/app-chat/conversations/new temporary=${
      payload?.temporary === true ? "yes" : "no"
    } statsig=${statsig ? "yes" : "no"} pair=${pair.seed && pair.hex ? "yes" : "no"} keys=${Object.keys(headers).join(",")}`
  );
  return finalSnapshot;
}

function ensureProfileDir() {
  if (!PROFILE_DIR) return "";
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  return PROFILE_DIR;
}

function ensureDiagDir() {
  if (!DIAG_DIR) return "";
  fs.mkdirSync(DIAG_DIR, { recursive: true });
  return DIAG_DIR;
}

async function captureDiagnostics(page, label) {
  try {
    const info = await page.evaluate(() => ({
      href: location.href,
      title: document.title || "",
      body: (document.body?.innerText || "").slice(0, 1200),
    }));
    log(
      `diagnostics label=${label} href=${info.href} title=${JSON.stringify(info.title)} body=${JSON.stringify(info.body)}`
    );
  } catch (error) {
    log(`diagnostics label=${label} eval_failed=${error.message}`);
  }

  const dir = ensureDiagDir();
  if (!dir) return;
  const file = path.join(dir, `${Date.now()}-${label}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
    log(`diagnostics screenshot=${file}`);
  } catch (error) {
    log(`diagnostics screenshot_failed=${error.message}`);
  }
}

async function ensureBrowser() {
  if (browser) {
    if (typeof browser.isConnected === "function") {
      if (browser.isConnected()) {
        return browser;
      }
      resetBrowserStateAfterClose("browser disconnected");
    } else {
      return browser;
    }
  }

  const launchOptions = {
    headless: HEADLESS,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-session-crashed-bubble",
      "--hide-crash-restore-bubble",
      "--disable-infobars",
    ],
  };
  if (RETAIN_STATIC_CACHE) {
    launchOptions.args.push("--disk-cache-size=536870912");
  }
  const proxy = buildProxyOption();
  if (proxy) {
    launchOptions.proxy = proxy;
  }
  const effectiveUserAgent = getEffectiveUserAgent();
  if (EXECUTABLE_PATH) {
    launchOptions.executablePath = EXECUTABLE_PATH;
  }
  if (effectiveUserAgent) {
    launchOptions.userAgent = effectiveUserAgent;
  }

  const userDataDir = ensureProfileDir();
  if (userDataDir) {
    browser = await chromium.launchPersistentContext(userDataDir, launchOptions);
    browser.on("close", () => {
      browser = null;
      pages.clear();
    });
    return browser;
  }

  const launched = await chromium.launch(launchOptions);
  launched.on("disconnected", () => {
    browser = null;
    pages.clear();
  });
  browser = launched;
  return browser;
}

async function createContextWithCookies(playwrightBrowser, sso) {
  const injectedCookies = mergeCookies(parseCfCookies(), parseInjectedCookies());
  const effectiveUserAgent = getEffectiveUserAgent();
  const authCookies = [];
  if (sso) {
    authCookies.push(
      { name: "sso", value: sso, domain: ".grok.com", path: "/" },
      { name: "sso-rw", value: sso, domain: ".grok.com", path: "/" }
    );
  }
  const cookiesToAdd = injectedCookies.length ? injectedCookies : authCookies;
  const isPersistentContext =
    typeof playwrightBrowser.newPage === "function" &&
    typeof playwrightBrowser.cookies === "function" &&
    typeof playwrightBrowser.newContext !== "function";

  if (isPersistentContext) {
    if (cookiesToAdd.length) {
      await playwrightBrowser.addCookies(cookiesToAdd);
    }
    const page = await playwrightBrowser.newPage();
    setupPageDialogs(page);
    await installStatsigCaptureHook(page);
    return { context: playwrightBrowser, page };
  }

  const contextProxy = buildProxyOption();
  const context = await playwrightBrowser.newContext({
    viewport: { width: 1600, height: 1000 },
    ...(effectiveUserAgent ? { userAgent: effectiveUserAgent } : {}),
    ...(contextProxy ? { proxy: contextProxy } : {}),
  });
  if (cookiesToAdd.length) {
    await context.addCookies(cookiesToAdd);
  }
  const page = await context.newPage();
  setupPageDialogs(page);
  await installStatsigCaptureHook(page);
  return { context, page };
}

function setupPageDialogs(page) {
  page.on("dialog", async (dialog) => {
    log(`auto-dismiss dialog type=${dialog.type()} message=${JSON.stringify(dialog.message())}`);
    await dialog.dismiss().catch(() => {});
  });
}

function pageHasComposerHint(page) {
  return page.evaluate(() => {
    const selectors = "textarea, [contenteditable], [role='textbox'], .ProseMirror";
    if (document.querySelector(selectors)) return true;
    const body = document.body?.innerText || "";
    return /你想知道什么|What do you want to know|Ask Grok|Message Grok/i.test(body);
  });
}

async function isCloudflareChallenge(page) {
  try {
    if (await pageHasComposerHint(page)) {
      return false;
    }
    return await page.evaluate(() => {
      const title = document.title || "";
      const body = document.body?.innerText || "";
      if (/just a moment|请稍候|稍候片刻/i.test(title)) return true;
      if (/checking your browser|verify you are human|确认您是真人/i.test(body)) return true;
      return Boolean(
        document.querySelector(
          "#challenge-form, #cf-challenge-running, .cf-turnstile, iframe[src*='challenges.cloudflare.com']"
        )
      );
    });
  } catch (_) {
    return false;
  }
}

function chatComposerLocator(page) {
  return page.locator('[data-cloak-composer="1"]').first();
}

async function findEditableComposer(page) {
  const marked = await page.evaluate(() => {
    document.querySelectorAll("[data-cloak-composer]").forEach((node) => {
      node.removeAttribute("data-cloak-composer");
    });
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      const style = window.getComputedStyle(node);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0;
    };
    const nodes = [
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll('[contenteditable="true"]'),
      ...document.querySelectorAll(".ProseMirror"),
      ...document.querySelectorAll('[role="textbox"][contenteditable="true"]'),
    ];
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      if (node.tagName === "TEXTAREA" || node.isContentEditable || node.classList.contains("ProseMirror")) {
        node.setAttribute("data-cloak-composer", "1");
        return {
          tag: node.tagName,
          editable: node.isContentEditable,
          className: node.className || "",
        };
      }
    }
    return null;
  });
  if (!marked) return null;
  return chatComposerLocator(page);
}

async function readComposerTextFromPage(page) {
  return page
    .evaluate(() => {
      const node =
        document.querySelector('[data-cloak-composer="1"]') ||
        document.querySelector('.ProseMirror[contenteditable="true"], .ProseMirror') ||
        document.querySelector("textarea");
      if (!node) return "";
      if (typeof node.value === "string") return node.value;
      return node.textContent || node.innerText || "";
    })
    .catch(() => "");
}

function probeMessageText(message) {
  const text = String(message || "").trim();
  return text || "hi";
}

function composerTextMatches(actual, expected) {
  const normalizedActual = String(actual || "").trim();
  const normalizedExpected = probeMessageText(expected);
  if (!normalizedActual) return false;
  return (
    normalizedActual === normalizedExpected ||
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual)
  );
}

async function clickComposerPlaceholder(page, label) {
  const placeholders = [
    page.getByPlaceholder(/你想知道|Ask|Message|询问/i).first(),
    page.getByText("你想知道什么", { exact: false }).first(),
    page.getByText("What do you want to know", { exact: false }).first(),
    page.locator('[aria-label*="Message"], [aria-label*="消息"], [aria-label*="输入"]').first(),
  ];
  for (const locator of placeholders) {
    try {
      if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
        await locator.click({ timeout: 2000 }).catch(() => {});
        log(`${label}: clicked composer placeholder`);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function logPageLoadProgress(page, label) {
  try {
    const info = await page.evaluate(() => ({
      href: location.href,
      title: document.title || "",
      editableCount: document.querySelectorAll(
        "textarea, [contenteditable], [role='textbox'], .ProseMirror"
      ).length,
      spinner: Boolean(
        document.querySelector('[class*="loading"], [class*="spinner"], [aria-busy="true"]')
      ),
    }));
    log(
      `${label}: waiting for chat composer href=${info.href} editable=${info.editableCount} spinner=${info.spinner ? "yes" : "no"} title=${JSON.stringify(info.title)}`
    );
  } catch (error) {
    log(`${label}: waiting for chat composer (page state unavailable: ${error.message})`);
  }
}

async function tryActivateChatSurface(page, label) {
  if (await clickComposerPlaceholder(page, label)) {
    return true;
  }
  const clickCandidates = [
    page.locator('button:has-text("开始")').first(),
    page.locator('button:has-text("Start")').first(),
    page.locator('button:has-text("Ask")').first(),
    page.locator('[data-testid*="composer"]').first(),
    page.locator(".ProseMirror").first(),
  ];
  for (const locator of clickCandidates) {
    try {
      if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
        await locator.click({ timeout: 2000 }).catch(() => {});
        log(`${label}: activated chat surface via click`);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function waitForChatComposer(page, timeout = CHAT_INPUT_TIMEOUT_MS, label = "page") {
  const deadline = Date.now() + timeout;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    await clickComposerPlaceholder(page, label).catch(() => {});
    const input = await findEditableComposer(page);
    if (
      input &&
      (await input.isVisible({ timeout: 800 }).catch(() => false)) &&
      (await input
        .evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        })
        .catch(() => false))
    ) {
      log(`${label}: chat composer ready`);
      return input;
    }
    const now = Date.now();
    if (now - lastProgressAt >= 5000) {
      await logPageLoadProgress(page, label);
      await dismissCookieBanner(page).catch(() => {});
      await tryActivateChatSurface(page, label);
      lastProgressAt = now;
    }
    await page.waitForTimeout(500);
  }
  await logPageLoadProgress(page, label);
  log(`${label}: chat composer wait failed after ${timeout}ms`);
  return null;
}

async function waitForCloudflare(page, label = "page") {
  const deadline = Date.now() + CF_WAIT_TIMEOUT_MS;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    const blocked = await isCloudflareChallenge(page);
    if (!blocked) {
      log(`${label}: cloudflare challenge cleared`);
      return true;
    }
    const now = Date.now();
    if (now - lastProgressAt >= 10000) {
      log(`${label}: waiting for cloudflare challenge to clear...`);
      lastProgressAt = now;
    }
    await page.waitForTimeout(1000);
  }
  log(`${label}: cloudflare wait timed out after ${CF_WAIT_TIMEOUT_MS}ms`);
  return false;
}

const MINIMAL_BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font"]);
const MINIMAL_BLOCKED_URL_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /segment\.io/i,
  /sentry\.io/i,
  /amplitude\.com/i,
  /hotjar\.com/i,
  /doubleclick\.net/i,
  /facebook\.net\/tr/i,
  /connect\.facebook\.net/i,
  /fullstory\.com/i,
  /clarity\.ms/i,
  /mixpanel\.com/i,
  /intercom\.io/i,
  /launchdarkly\.com/i,
  /cdn\.cookielaw\.org/i,
  /onetrust\.com/i,
];

async function setupMinimalLoadBlocking(page) {
  if (!MINIMAL_LOAD) return;
  const blockStaticResources = !RETAIN_STATIC_CACHE;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const url = request.url();
    if (blockStaticResources && MINIMAL_BLOCKED_RESOURCE_TYPES.has(resourceType)) {
      await route.abort();
      return;
    }
    for (const pattern of MINIMAL_BLOCKED_URL_PATTERNS) {
      if (pattern.test(url)) {
        await route.abort();
        return;
      }
    }
    await route.continue();
  });
  if (blockStaticResources) {
    log("minimal load blocking enabled: static resources + tracking");
  } else {
    log("minimal load blocking enabled: tracking only, static cache retained");
  }
}

async function waitForPageInteractive(page, label) {
  await dismissCookieBanner(page).catch(() => {});

  let input = await waitForChatComposer(page, MINIMAL_LOAD ? 8000 : 12000, label);
  if (input) {
    log(`${label}: page interactive via chat composer`);
    return { cfReady: true, input };
  }

  if (await isCloudflareChallenge(page)) {
    const cfReady = await waitForCloudflare(page, label).catch(() => false);
    if (!cfReady && (await isCloudflareChallenge(page))) {
      return { cfReady: false, input: null };
    }
  } else {
    log(`${label}: no cloudflare challenge detected, continue waiting for composer`);
  }

  input = await waitForChatComposer(
    page,
    MINIMAL_LOAD ? CHAT_INPUT_TIMEOUT_MS : READY_TIMEOUT,
    `${label}-composer`
  );
  if (input) {
    return { cfReady: true, input };
  }

  if (!MINIMAL_LOAD) {
    await page.waitForLoadState("networkidle", { timeout: READY_TIMEOUT }).catch(() => {});
    input = await waitForChatComposer(page, READY_TIMEOUT, `${label}-after-idle`);
  }
  return { cfReady: Boolean(input), input };
}

async function applyProbeCookies(context, cookies) {
  if (!Array.isArray(cookies) || !cookies.length) return false;
  const normalized = cookies.filter((item) => item && item.name);
  if (!normalized.length) return false;
  await context.addCookies(normalized);
  log(`applied probe cookies count=${normalized.length}`);
  return true;
}

async function prepareSlot(slot) {
  const { page } = slot;
  await ensureStatsigCaptureHook(page);
  log("prepare-slot: navigating to Grok home");
  await page.goto(HOME_URL, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  log("prepare-slot: domcontentloaded");
  await waitForPageInteractive(page, "prepare-slot");

  const cookies = await slot.context.cookies("https://grok.com");
  const cookieSso = extractSsoFromCookies(cookies);
  if (cookieSso) {
    slot.sso = cookieSso;
  }
  const hasSession = cookies.some(
    (item) => item.name === "x-userid" || item.name === "sso" || item.name === "sso-rw"
  );
  let hasUsableChat = false;
  if (!hasSession) {
    hasUsableChat = Boolean(await findEditableComposer(page));
  }
  if (!hasSession && !hasUsableChat) {
    await captureDiagnostics(page, "prepare-slot-no-session");
    throw new BridgeError("sso_unavailable", "SSO cookie did not establish a Grok session", 401);
  }

  slot.ready = true;
  slot.lastUsed = Date.now();
  await refreshSessionSnapshot(slot).catch(() => {});
}

async function hasInaccessiblePrivateLink(page) {
  try {
    return await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return (
        location.href.includes("/c#") &&
        /你需要访问权限|私人对话链接|请求访问权限|Request access|private conversation link/i.test(text)
      );
    });
  } catch (_) {
    return false;
  }
}


function isPersistedConversationUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return /^\/c\//.test(parsed.pathname) && !String(parsed.hash || "").includes("private");
  } catch (_) {
    return false;
  }
}

async function isPrivateChatSurface(page) {
  try {
    const href = page.url();
    if (String(href).includes("#private")) {
      return true;
    }
    return await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return /不会出现在你的历史记录|不会用于模型训练|won't appear in your history|not be used for model training/i.test(text);
    });
  } catch (_) {
    return false;
  }
}

async function clickNewChatAction(page, label) {
  const newChatCandidates = [
    page.locator('a[href="/"]').first(),
    page.locator('a[href="/?new=1"]').first(),
    page.getByRole("link", { name: /新建聊天|New chat/i }).first(),
    page.locator('button:has-text("新建聊天")').first(),
    page.locator('button:has-text("开始新聊天")').first(),
    page.locator('button:has-text("New chat")').first(),
  ];
  for (const locator of newChatCandidates) {
    try {
      if (await locator.isVisible({ timeout: 750 }).catch(() => false)) {
        await locator.click({ timeout: 2500 }).catch(() => {});
        if (!MINIMAL_LOAD) {
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        }
        log(`${label}: clicked new-chat action`);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function navigateToPrivateProbeSurface(page, label) {
  const privateUrl = "https://grok.com/c#private";
  if (isPersistedConversationUrl(page.url())) {
    log(`${label}: leaving persisted conversation url=${page.url()}`);
  }
  if (!(await isPrivateChatSurface(page)) || isPersistedConversationUrl(page.url())) {
    await page.goto(privateUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await dismissCookieBanner(page).catch(() => {});
    log(`${label}: navigated to private chat surface`);
  }
  const privateLinkCandidates = [
    page.getByRole("link", { name: /私密模式|Private/i }).first(),
    page.locator('a[href="/c#private"]').first(),
    page.locator('a[href*="#private"]').first(),
  ];
  for (const locator of privateLinkCandidates) {
    try {
      if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
        await locator.click({ timeout: 3000 }).catch(() => {});
        log(`${label}: clicked private-mode link`);
        break;
      }
    } catch (_) {}
  }
  if (!(await isPrivateChatSurface(page))) {
    await page.goto(privateUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await dismissCookieBanner(page).catch(() => {});
  }
  const input = await waitForChatComposer(
    page,
    MINIMAL_LOAD ? CHAT_INPUT_TIMEOUT_MS : READY_TIMEOUT,
    `${label}-private`
  );
  if (!input) {
    await captureDiagnostics(page, `${label}-private-no-input`);
    throw new BridgeError("input_unavailable", `Private chat input not available for ${label}`, 502);
  }
  const finalUrl = page.url();
  if (!String(finalUrl).includes("#private")) {
    log(`${label}: private hash missing after navigation url=${finalUrl}, forcing #private`);
    await page.goto(privateUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await dismissCookieBanner(page).catch(() => {});
    input = await waitForChatComposer(
      page,
      MINIMAL_LOAD ? CHAT_INPUT_TIMEOUT_MS : READY_TIMEOUT,
      `${label}-private-retry`
    );
    if (!input) {
      await captureDiagnostics(page, `${label}-private-no-input-retry`);
      throw new BridgeError("input_unavailable", `Private chat input not available for ${label}`, 502);
    }
  }
  log(`${label}: private chat surface ready url=${page.url()}`);
  return input;
}

async function navigateToUsableChat(page, label) {
  const target = PRIVATE_CHAT_URL && PRIVATE_CHAT_URL !== "https://grok.com/c#private"
    ? PRIVATE_CHAT_URL
    : HOME_URL;
  await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  let { cfReady, input } = await waitForPageInteractive(page, label);
  if (!cfReady && (await isCloudflareChallenge(page))) {
    await captureDiagnostics(page, `${label}-cloudflare-blocked`);
    throw new BridgeError(
      "cloudflare_blocked",
      "Cloudflare challenge not cleared before chat probe",
      403
    );
  }
  await dismissCookieBanner(page);

  if (await hasInaccessiblePrivateLink(page)) {
    log(`${label}: private link inaccessible, returning to Grok home`);
    await page.goto(HOME_URL, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    ({ cfReady, input } = await waitForPageInteractive(page, `${label}-home`));
    await dismissCookieBanner(page);
  }

  const newChatCandidates = [
    page.locator('a[href="/"], a[href="/?new=1"]').first(),
    page.locator('button:has-text("新建聊天")').first(),
    page.locator('button:has-text("开始新聊天")').first(),
    page.locator('button:has-text("New chat")').first(),
  ];
  for (const locator of newChatCandidates) {
    try {
      if (await locator.isVisible({ timeout: 750 }).catch(() => false)) {
        await locator.click({ timeout: 2500 }).catch(() => {});
        const afterClickTimeout = MINIMAL_LOAD ? 3000 : 5000;
        if (MINIMAL_LOAD) {
          input = await waitForChatComposer(page, afterClickTimeout, `${label}-new-chat`);
        } else {
          await page.waitForLoadState("networkidle", { timeout: afterClickTimeout }).catch(() => {});
        }
        break;
      }
    } catch (_) {}
  }

  if (!input) {
    input = await waitForChatComposer(
      page,
      MINIMAL_LOAD ? CHAT_INPUT_TIMEOUT_MS : READY_TIMEOUT,
      label
    );
  }
  if (!input) {
    await captureDiagnostics(page, `${label}-no-input`);
    throw new BridgeError("input_unavailable", `Chat input not available for ${label}`, 502);
  }
  return input;
}


async function prepareUsableChat(page, label, options = {}) {
  if (options.forcePrivate === true) {
    return navigateToPrivateProbeSurface(page, label);
  }
  const skipInitialGoto = options.skipInitialGoto === true;
  if (skipInitialGoto) {
    if (isPersistedConversationUrl(page.url())) {
      log(`${label}: prepared page is persisted conversation, switching to private surface`);
      return navigateToPrivateProbeSurface(page, label);
    }
    await dismissCookieBanner(page).catch(() => {});
    const quickInput = await findEditableComposer(page);
    if (quickInput && (await quickInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      log(`${label}: reusing prepared Grok home page, skip second goto`);
      try {
        await quickInput.waitFor({
          state: "visible",
          timeout: MINIMAL_LOAD ? CHAT_INPUT_TIMEOUT_MS : READY_TIMEOUT,
        });
        return quickInput;
      } catch (error) {
        log(`${label}: prepared page input wait failed, fallback to full navigation`);
      }
    } else {
      log(`${label}: prepared page has no visible chat input, fallback to full navigation`);
    }
  }
  return navigateToUsableChat(page, label);
}


function composerSendButtonLocator(page) {
  return page
    .locator(
      'button[type="submit"]:not([disabled]), button[aria-label*="Send"]:not([disabled]), button[aria-label*="send"]:not([disabled]), button[aria-label*="发送"]:not([disabled]), button[aria-label*="提交"]:not([disabled]), button[data-testid*="send"]:not([disabled])'
    )
    .last();
}

async function waitForComposerSendReady(page, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page
      .evaluate(() => {
        const node =
          document.querySelector('[data-cloak-composer="1"]') ||
          document.querySelector('.ProseMirror[contenteditable="true"], .ProseMirror') ||
          document.querySelector("textarea");
        const text =
          node && typeof node.value === "string"
            ? node.value
            : node
              ? node.textContent || node.innerText || ""
              : "";
        if (!String(text || "").trim()) return false;
        const buttons = [
          ...document.querySelectorAll(
            'button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"], button[aria-label*="发送"], button[data-testid*="send"]'
          ),
        ];
        return buttons.some((button) => {
          if (button.disabled) return false;
          const rect = button.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        });
      })
      .catch(() => false);
    if (ready) {
      log(`${label}: composer send action ready`);
      return true;
    }
    await page.waitForTimeout(200);
  }
  log(`${label}: composer send action not ready after ${timeoutMs}ms`);
  return false;
}

async function clearComposerText(editable) {
  await editable.click({ timeout: 5000, force: true }).catch(() => {});
  await editable
    .press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    .catch(() => {});
  await editable.press("Backspace").catch(() => {});
}

async function typeComposerText(page, editable, text) {
  const composerKind = await editable
    .evaluate((node) => ({
      tag: node?.tagName || "",
      editable: Boolean(node?.isContentEditable),
      proseMirror: Boolean(node?.classList?.contains("ProseMirror")),
    }))
    .catch(() => ({ tag: "", editable: false, proseMirror: false }));

  if (composerKind.tag === "TEXTAREA" && !composerKind.editable) {
    await editable.fill(text).catch(async () => {
      await clearComposerText(editable);
      await editable.pressSequentially(text, { delay: 12 });
    });
    return;
  }

  await clearComposerText(editable);
  await editable.pressSequentially(text, { delay: 12 }).catch(async () => {
    await page.keyboard.insertText(text).catch(async () => {
      await page.keyboard.type(text, { delay: 10 });
    });
  });
}

async function readComposerText(input) {
  try {
    return await input.evaluate((node) => {
      if (!node) return "";
      if (typeof node.value === "string") {
        return node.value;
      }
      return node.textContent || node.innerText || "";
    });
  } catch (_) {
    return "";
  }
}

async function setComposerText(page, input, message) {
  const text = probeMessageText(message);
  await clickComposerPlaceholder(page, "setComposerText").catch(() => {});
  let editable = (await findEditableComposer(page)) || input;
  await editable.scrollIntoViewIfNeeded().catch(() => {});
  await typeComposerText(page, editable, text);
  await page.waitForTimeout(150);
  await waitForComposerSendReady(page, "setComposerText", 4000).catch(() => false);
}

async function fillComposerWithProbe(page, input, message, label) {
  const expected = probeMessageText(message);
  await setComposerText(page, input, expected);

  let actual = String(await readComposerTextFromPage(page)).trim();
  if (composerTextMatches(actual, expected)) {
    log(`${label}: probe message filled and verified on first attempt`);
    return true;
  }

  log(
    `${label}: probe message verify failed on first attempt expected_len=${expected.length} actual=${JSON.stringify(actual)}`
  );

  await clickComposerPlaceholder(page, `${label}-refocus`).catch(() => {});
  const editable = (await findEditableComposer(page)) || input;
  await setComposerText(page, editable, expected);
  actual = String(await readComposerTextFromPage(page)).trim();
  if (composerTextMatches(actual, expected)) {
    log(`${label}: probe message filled and verified on second attempt`);
    return true;
  }

  log(
    `${label}: probe message verify failed on second attempt expected_len=${expected.length} actual=${JSON.stringify(actual)}`
  );
  return false;
}


async function clearComposerAfterProbe(page, label) {
  const editable = await findEditableComposer(page);
  if (!editable) {
    await page
      .evaluate(() => {
        const node =
          document.querySelector('[data-cloak-composer="1"]') ||
          document.querySelector('.ProseMirror[contenteditable="true"], .ProseMirror') ||
          document.querySelector("textarea");
        if (!node) return;
        if (typeof node.value === "string") {
          node.value = "";
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
        node.textContent = "";
        node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      })
      .catch(() => {});
    log(`${label}: cleared composer via dom fallback`);
    return;
  }
  await clearComposerText(editable);
  const remaining = String(await readComposerTextFromPage(page)).trim();
  if (remaining) {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
  }
  log(`${label}: cleared composer after probe`);
}

async function submitProbeFromReadyPage(page, input, label) {
  const editable = (await findEditableComposer(page)) || input;
  await editable.click({ timeout: 3000, force: true }).catch(() => {});
  await waitForComposerSendReady(page, label, 6000).catch(() => false);
  const sendBtn = composerSendButtonLocator(page);

  const requestPromise = page.waitForRequest(
    (request) => isConversationSubmitUrl(request.url()) && request.method() === "POST",
    { timeout: 12000 }
  );
  const responsePromise = page.waitForResponse(
    (resp) => isConversationSubmitUrl(resp.url()) && resp.request().method() === "POST",
    { timeout: 12000 }
  ).catch(() => null);
  const clearedPromise = page
    .waitForFunction(() => {
      const node =
        document.querySelector('[data-cloak-composer="1"]') ||
        document.querySelector('.ProseMirror[contenteditable="true"], .ProseMirror') ||
        document.querySelector("textarea");
      if (!node) return false;
      const value = typeof node.value === "string" ? node.value : node.textContent || node.innerText || "";
      return !String(value || "").trim();
    }, { timeout: 8000 })
    .catch(() => null);

  const sendStrategies = [
    async () => {
      if (!(await sendBtn.isVisible().catch(() => false))) return false;
      await sendBtn.click({ timeout: 5000 });
      return true;
    },
    async () => {
      await editable.press("Enter");
      return true;
    },
    async () => {
      await page.keyboard.press("Enter");
      return true;
    },
  ];

  for (const strategy of sendStrategies) {
    try {
      await strategy();
      const requestMatched = await requestPromise.then(() => true).catch(() => false);
      const responseMatched = (await responsePromise) !== null;
      if (requestMatched || responseMatched) {
        log(`${label}: probe submit triggered request=${requestMatched ? "yes" : "no"} response=${responseMatched ? "yes" : "no"}`);
        await page.waitForTimeout(1200).catch(() => {});
        return true;
      }
      const composerCleared = (await clearedPromise) !== null;
      if (composerCleared) {
        log(`${label}: probe submit cleared composer without captured request`);
      }
    } catch (_) {}
  }

  log(`${label}: probe submit did not trigger request or clear composer`);
  return false;
}

async function refreshSessionSnapshot(slot) {
  const { page, context } = slot;
  const cookies = await context.cookies("https://grok.com");
  const cookieSso = extractSsoFromCookies(cookies);
  if (cookieSso) {
    slot.sso = cookieSso;
  }
  const cookieHeader = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const ua = await page.evaluate(() => navigator.userAgent || "");
  const previous =
    sessionSnapshots.get(slot.sso || "") || sessionSnapshots.get(slot.key || PROFILE_SLOT_KEY) || {};
  const statsig = await page.evaluate(() => {
    const keys = [
      "x-statsig-id",
      "statsigId",
      "statsig_id",
      "STATSIG_LOCAL_STORAGE_INTERNAL_STORE_V4",
    ];
    for (const key of keys) {
      try {
        const value = window.localStorage.getItem(key);
        if (value) return value;
      } catch (_) {}
    }
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (key.toLowerCase().includes("statsig")) {
          const value = window.localStorage.getItem(key);
          if (value) return value;
        }
      }
    } catch (_) {}
    return "";
  });
  const snapshot = {
    ...previous,
    sso: slot.sso || "",
    cookie_header: cookieHeader,
    cookies: serializeCookiesForConfig(cookies),
    user_agent: ua,
    x_statsig_id: previous.x_statsig_id || statsig,
    captured_at: new Date().toISOString(),
  };
  let finalSnapshot = snapshot;
  const pair = await resolveStatsigPair(page);
  finalSnapshot = mergeStatsigPairIntoSnapshot(snapshot, pair);
  for (const key of snapshotKeys(slot)) {
    sessionSnapshots.set(key, finalSnapshot);
  }
}

function hasCapturedAppChatHeaders(sso) {
  const snapshot = sessionSnapshots.get(sso) || {};
  return Boolean(
    snapshot.x_statsig_id &&
      snapshot.request_headers &&
      Object.keys(snapshot.request_headers).length > 0
  );
}

async function dismissCookieBanner(page) {
  const candidates = [
    page.locator('button:has-text("全部拒绝")').first(),
    page.locator('button:has-text("Reject All")').first(),
    page.locator('button:has-text("Reject all")').first(),
    page.locator('button:has-text("仅接受必要")').first(),
  ];
  for (const locator of candidates) {
    try {
      if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
        await locator.click({ timeout: 3000 });
        log("cookie banner dismissed");
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function enableTemporaryMode(page, desiredTemporary) {
  if (!desiredTemporary) return false;

  const candidates = [
    page.getByRole("link", { name: /私密模式|Private/i }).first(),
    page.locator('a[href="/c#private"]').first(),
    page.locator('a[href*="#private"]').first(),
    page.locator('button[aria-label*="Temporary"]').first(),
    page.locator('button:has-text("Temporary")').first(),
    page.locator('button:has-text("临时")').first(),
    page.locator('[role="switch"][aria-label*="Temporary"]').first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
        const pressed = await locator.getAttribute("aria-pressed").catch(() => null);
        const checked = await locator.getAttribute("aria-checked").catch(() => null);
        if (pressed === "true" || checked === "true") {
          log("temporary mode already enabled");
          return true;
        }
        await locator.click({ timeout: 3000 });
        log("temporary mode toggled on");
        return true;
      }
    } catch (_) {}
  }

  log("temporary mode toggle not found");
  return false;
}


async function isSlotPageAlive(slot) {
  if (!slot?.page) return false;
  try {
    if (typeof slot.page.isClosed === "function" && slot.page.isClosed()) {
      return false;
    }
    await slot.page.evaluate(() => true, { timeout: 3000 });
    return true;
  } catch (error) {
    return false;
  }
}

function resetBrowserStateAfterClose(reason) {
  log(`browser state reset: ${reason}`);
  browser = null;
  pages.clear();
}

async function destroySlot(key) {
  const slot = pages.get(key);
  if (!slot) return;
  pages.delete(key);
  try {
    if (slot.context && slot.context !== browser) {
      await slot.context.close();
    } else if (slot.page) {
      await slot.page.close();
    }
  } catch (_) {}
}

async function getSlot(sso) {
  const key = sso || PROFILE_SLOT_KEY;
  let slot = pages.get(key);
  if (slot && slot.ready && !slot.busy) {
    if (await isSlotPageAlive(slot)) {
      slot.lastUsed = Date.now();
      return slot;
    }
    log(`slot ${key} is stale after manual browser close, recreating`);
    slot.ready = false;
    await destroySlot(key);
    slot = null;
  }
  if (slot) {
    await destroySlot(key);
  }

  if (pages.size >= MAX_PAGES) {
    const oldest = [...pages.entries()]
      .filter(([, value]) => !value.busy)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (oldest) {
      await destroySlot(oldest[0]);
    }
  }

  const b = await ensureBrowser();
  const { context, page } = await createContextWithCookies(b, sso);
  slot = {
    key,
    sso,
    context,
    page,
    ready: false,
    busy: false,
    lastUsed: Date.now(),
  };
  await setupMinimalLoadBlocking(page);
  const rewriteProbeRoute = async (route) => {
    const request = route.request();
    if (!slot.probeActive || request.method() !== "POST") {
      await route.continue();
      return;
    }
    let basePayload = {};
    try {
      basePayload = request.postDataJSON();
    } catch (_) {}
    const payload = buildTemporaryProbePayload(basePayload, slot.probePageInfo || {});
    const targetUrl = "https://grok.com/rest/app-chat/conversations/new";
    log(
      `rewriting probe conversation payload temporary=yes target=/new source=${
        isResponseSubmitUrl(request.url()) ? "/responses" : "/new"
      }`
    );
    await captureProbeSnapshot(slot, request, payload);
    if (!PROBE_CONSUME_UPSTREAM) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body:
          '{"result":{"conversation":{"conversationId":"probe","temporary":true}}}\n' +
          '{"result":{"response":{"modelResponse":{"responseId":"probe","message":"","sender":"ASSISTANT","partial":false}}}}\n',
      });
      return;
    }
    await route.continue({
      url: targetUrl,
      headers: {
        ...request.headers(),
        "content-type": "application/json",
      },
      postData: JSON.stringify(payload),
    });
  };
  await page.route("**/rest/app-chat/conversations/new*", rewriteProbeRoute);
  await page.route("**/rest/app-chat/conversations/*/responses*", rewriteProbeRoute);
  page.on("request", async (request) => {
    try {
      if (!isConversationSubmitUrl(request.url()) || request.method() !== "POST") {
        return;
      }
      const headers = appChatRequestHeaders(await request.allHeaders());
      let temporary = null;
      try {
        const body = request.postDataJSON();
        temporary = Boolean(body && body.temporary);
      } catch (_) {}
      if (
        slot.probeActive &&
        !isNewConversationSubmitUrl(request.url()) &&
        !isConversationSubmitUrl(request.url())
      ) {
        return;
      }
      if (slot.probeActive && isNewConversationSubmitUrl(request.url()) && temporary !== true) {
        log(
          `probe: capturing non-temporary UI submit url=${request.url()} temporary=${
            temporary === null ? "-" : temporary ? "yes" : "no"
          }`
        );
      }
      const previous =
        sessionSnapshots.get(slot.sso || "") || sessionSnapshots.get(slot.key || PROFILE_SLOT_KEY) || {};
      const statsig = headers["x-statsig-id"] || previous.x_statsig_id || "";
      const snapshot = {
        ...previous,
        sso: slot.sso || "",
        request_headers: headers,
        x_statsig_id: statsig,
        captured_at: new Date().toISOString(),
      };
      let finalSnapshot = snapshot;
      const pair = await resolveStatsigPair(slot.page);
      finalSnapshot = mergeStatsigPairIntoSnapshot(snapshot, pair);
      for (const snapshotKey of snapshotKeys(slot)) {
        sessionSnapshots.set(snapshotKey, finalSnapshot);
      }
      log(
        `captured app-chat headers url=${request.url()} temporary=${
          temporary === null ? "-" : temporary ? "yes" : "no"
        } statsig=${statsig ? "yes" : "no"} pair=${pair.seed && pair.hex ? "yes" : "no"} keys=${Object.keys(headers).join(",")}`
      );
    } catch (error) {
      log(`capture request headers failed: ${error.message}`);
    }
  });
  pages.set(key, slot);
  await prepareSlot(slot);
  return slot;
}

async function submitThroughUi(slot, payload, conversationId) {
  const { page } = slot;
  const targetPattern = conversationId
    ? `/rest/app-chat/conversations/${conversationId}/responses`
    : "/rest/app-chat/conversations/new";
  const message = String(payload.message || "");

  const input = await navigateToUsableChat(page, "submit");
  await enableTemporaryMode(page, payload.temporary === true);
  await typeComposerText(page, input, String(message || ""));
  await waitForComposerSendReady(page, "submit", 6000).catch(() => false);

  const sendStartedAt = Date.now();
  const responsePromise = page.waitForResponse(
    (resp) => {
      if (!resp.url().includes(targetPattern) || resp.request().method() !== "POST") {
        return false;
      }
      return resp.request().timing().startTime * 1000 >= sendStartedAt - 2000;
    },
    { timeout: REQUEST_TIMEOUT }
  );

  const sendBtn = composerSendButtonLocator(page);

  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click({ timeout: 5000 }).catch(async () => {
      await input.press("Enter");
    });
  } else {
    await input.press("Enter");
  }

  const response = await responsePromise;
  const status = response.status();
  const body = await response.text();
  log(
    `upstream status=${status} conversation=${conversationId || "-"} url=${response.url()} body=${JSON.stringify(
      String(body || "").slice(0, 400)
    )}`
  );
  return { status, body };
}


async function triggerPassiveStatsigCapture(page, slot, label = "probe") {
  const hookPair = await resolveStatsigPair(page);
  if (isValidStatsigPair(hookPair)) {
    const key = slot.key || slot.sso || PROFILE_SLOT_KEY;
    const previous = sessionSnapshots.get(key) || {};
    const snapshot = mergeStatsigPairIntoSnapshot({ ...previous, sso: slot.sso || "" }, hookPair);
    for (const snapshotKey of snapshotKeys(slot)) {
      sessionSnapshots.set(snapshotKey, snapshot);
    }
    log(`${label}: hook pair prefetch pair=yes seed_len=${hookPair.seed.length} hex_len=${hookPair.hex.length}`);
    return;
  }

  const key = slot.key || slot.sso || PROFILE_SLOT_KEY;
  slot.probeActive = true;
  try {
    const payload = buildTemporaryProbePayload({}, slot.probePageInfo || {});
    const responsePromise = page
      .waitForResponse(
        (resp) =>
          resp.request().method() === "POST" &&
          isConversationSubmitUrl(resp.url()) &&
          resp.request().postDataJSON?.()?.temporary === true,
        { timeout: 12000 }
      )
      .catch(() => null);
    const result = await page.evaluate(async ({ body }) => {
      try {
        const resp = await fetch("https://grok.com/rest/app-chat/conversations/new", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "*/*",
          },
          body: JSON.stringify(body),
        });
        return { ok: resp.ok, status: resp.status };
      } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) };
      }
    }, { body: payload });
    const response = await responsePromise;
    if (response) {
      try {
        const headers = appChatRequestHeaders(await response.request().allHeaders());
        const statsig = headers["x-statsig-id"] || "";
        const previous = sessionSnapshots.get(key) || {};
        let snapshot = {
          ...previous,
          sso: slot.sso || "",
          request_headers: headers,
          x_statsig_id: statsig,
          captured_at: new Date().toISOString(),
        };
        const pair = await resolveStatsigPair(page);
        snapshot = mergeStatsigPairIntoSnapshot(snapshot, pair);
        for (const snapshotKey of snapshotKeys(slot)) {
          sessionSnapshots.set(snapshotKey, snapshot);
        }
        log(
          `${label}: passive statsig captured from waitForResponse status=${response.status()} statsig=${statsig ? "yes" : "no"} pair=${pair.seed && pair.hex ? "yes" : "no"} keys=${Object.keys(headers).join(",")}`
        );
      } catch (error) {
        log(`${label}: passive statsig response capture failed: ${error.message}`);
      }
    } else {
      log(
        `${label}: passive statsig fetch new status=${result.status || result.error || "unknown"} response_wait=no`
      );
    }
  } catch (error) {
    log(`${label}: passive statsig fetch failed: ${error.message}`);
  } finally {
    slot.probeActive = false;
  }
  await waitForCapturedHeaders(key, 3000);
}

async function waitForCapturedHeaders(sso, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasCapturedAppChatHeaders(sso)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return hasCapturedAppChatHeaders(sso);
}


async function waitForSlotProbeReady(slot, label) {
  const deadline = Date.now() + Math.min(REQUEST_TIMEOUT, 90000);
  while (slot.busy && Date.now() < deadline) {
    log(`${label}: waiting for bridge page to become idle`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (slot.busy) {
    throw new BridgeError("page_busy", "Bridge page busy", 429);
  }
}

async function probeAppChatHeaders(slot, force = false, credentials = {}) {
  if (!force && hasCapturedAppChatHeaders(slot.key || slot.sso)) {
    return sessionSnapshots.get(slot.key || slot.sso) || sessionSnapshots.get(slot.sso) || {};
  }
  if (force) {
    for (const key of snapshotKeys(slot)) {
      const previous = sessionSnapshots.get(key) || {};
      sessionSnapshots.set(key, {
        ...previous,
        request_headers: {},
        x_statsig_id: "",
        statsig_seed: "",
        statsig_hex: "",
        captured_at: new Date().toISOString(),
      });
    }
    try {
      await page.evaluate(() => {
        window.__grokStatsigCapture = [];
      });
      log("probe: cleared in-page statsig capture buffer for force refresh");
    } catch (_) {}
  }

  const { page, context } = slot;
  const freshCookies = Array.isArray(credentials.cookies) ? credentials.cookies : [];
  const injectedFreshCookies = await applyProbeCookies(context, freshCookies);
  let skipInitialGoto = slot.ready && !injectedFreshCookies;
  if (injectedFreshCookies) {
    if (slot.ready) {
      log("probe: cookies injected on prepared page, skip reload");
      skipInitialGoto = true;
    } else {
      log("probe: reloading page after cookie inject");
      await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await dismissCookieBanner(page).catch(() => {});
      await waitForPageInteractive(page, "probe-after-cookies");
      skipInitialGoto = true;
    }
  }
  let input = await prepareUsableChat(page, "probe", { forcePrivate: true });
  await ensureStatsigCaptureHook(page);
  let attemptedReuse = false;
  if (force) {
    if (isPersistedConversationUrl(page.url()) || !(await isPrivateChatSurface(page))) {
      log(`probe: force reset to private surface url=${page.url()}`);
      input = await navigateToPrivateProbeSurface(page, "probe-force-reset");
    }
  }

  let probeAttempts = 0;
  while (true) {
    probeAttempts += 1;
    const earlyPair = await resolveStatsigPair(page);
    if (!force && isValidStatsigPair(earlyPair)) {
      const snapKey = slot.key || slot.sso || PROFILE_SLOT_KEY;
      const merged = mergeStatsigPairIntoSnapshot(sessionSnapshots.get(snapKey) || { sso: slot.sso || "" }, earlyPair);
      for (const snapshotKey of snapshotKeys(slot)) { sessionSnapshots.set(snapshotKey, merged); }
      log(`probe: valid statsig pair already available pair=yes attempt=${probeAttempts}`);
      break;
    }
    if (probeAttempts > 2) { log(`probe: exceeded retry budget attempts=${probeAttempts}`); break; }
    await enableTemporaryMode(page, true);
    if (!(await isPrivateChatSurface(page)) || isPersistedConversationUrl(page.url())) {
      log(`probe: ensuring private surface url=${page.url()}`);
      input = await navigateToPrivateProbeSurface(page, "probe-ensure-private");
    } else {
      input = (await findEditableComposer(page)) || input;
      if (!input) {
        log("probe: no composer on private surface, re-navigating");
        input = await navigateToPrivateProbeSurface(page, "probe-ensure-private");
      } else {
        log(`probe: using private chat composer on url=${page.url()}`);
      }
    }
    slot.probePageInfo = await page
      .evaluate(() => ({
        darkModeEnabled: window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false,
        devicePixelRatio: window.devicePixelRatio || 1,
        screen: {
          width: window.screen?.width || 0,
          height: window.screen?.height || 0,
        },
        viewport: {
          width: window.innerWidth || 0,
          height: window.innerHeight || 0,
        },
      }))
      .catch(() => ({}));
    slot.probeActive = true;

    try {
      input = (await findEditableComposer(page)) || input;
      const filled = await fillComposerWithProbe(page, input, PROBE_MESSAGE, "probe");
      if (!filled) {
        log("probe: composer fill unverified, attempting submit anyway");
      }

      const submitted = await submitProbeFromReadyPage(page, input, "probe");
      if (!submitted) {
        await triggerPassiveStatsigCapture(page, slot, "probe");
        const snapKey = slot.key || slot.sso || PROFILE_SLOT_KEY;
        const snapAfterPassive = sessionSnapshots.get(snapKey) || {};
        const passivePair = {
          seed: String(snapAfterPassive.statsig_seed || ""),
          hex: String(snapAfterPassive.statsig_hex || ""),
        };
        if (isValidStatsigPair(passivePair)) {
          log(
            `probe: hook pair captured after submit failure pair=yes seed_len=${passivePair.seed.length} hex_len=${passivePair.hex.length}`
          );
          await refreshSessionSnapshot(slot).catch(() => {});
          if (!PROBE_CONSUME_UPSTREAM) {
            await clearComposerAfterProbe(page, "probe").catch(() => {});
          }
          break;
        }
        if (await waitForCapturedHeaders(snapKey, 4000)) {
          log("probe: headers captured via passive fetch after submit failure");
          await refreshSessionSnapshot(slot).catch(() => {});
          if (!PROBE_CONSUME_UPSTREAM) {
            await clearComposerAfterProbe(page, "probe").catch(() => {});
          }
          break;
        }
        if (attemptedReuse) {
          log("probe: prepared page submit not triggered, fallback to full navigation");
          input = await navigateToPrivateProbeSurface(page, "probe-fallback");
          attemptedReuse = false;
          continue;
        }
        attemptedReuse = true;
        log("probe: submit failed on reused page, retry after private surface reset");
        input = await navigateToPrivateProbeSurface(page, "probe-retry");
        continue;
      }

      await waitForCapturedHeaders(slot.key || slot.sso || PROFILE_SLOT_KEY, 8000);
      await refreshSessionSnapshot(slot).catch(() => {});
      await ensureStatsigCaptureHook(page);
      await page.waitForTimeout(1500).catch(() => {});
      const pairAfterSubmit = await resolveStatsigPair(page);
      if (isValidStatsigPair(pairAfterSubmit)) {
        const snapKey = slot.key || slot.sso || PROFILE_SLOT_KEY;
        const merged = mergeStatsigPairIntoSnapshot(sessionSnapshots.get(snapKey) || {}, pairAfterSubmit);
        for (const snapshotKey of snapshotKeys(slot)) {
          sessionSnapshots.set(snapshotKey, merged);
        }
        log(
          `probe: statsig pair captured after submit pair=yes seed_len=${pairAfterSubmit.seed.length} hex_len=${pairAfterSubmit.hex.length}`
        );
      }
      if (!PROBE_CONSUME_UPSTREAM) {
        await clearComposerAfterProbe(page, "probe").catch(() => {});
      }
      break;
    } finally {
      slot.probeActive = false;
      slot.probePageInfo = null;
    }
  }

  await ensureStatsigCaptureHook(page);
  await triggerPassiveStatsigCapture(page, slot, "probe-final").catch(() => {});
  await refreshSessionSnapshot(slot).catch(() => {});
  const snapKey = slot.key || slot.sso || PROFILE_SLOT_KEY;
  const snapshot =
    sessionSnapshots.get(snapKey) ||
    sessionSnapshots.get(slot.sso || "") ||
    {};
  const pair = {
    seed: String(snapshot.statsig_seed || ""),
    hex: String(snapshot.statsig_hex || ""),
  };
  if (isValidStatsigPair(pair)) {
    log(
      `probe completed with valid statsig pair seed_len=${pair.seed.length} hex_len=${pair.hex.length} headers=${hasCapturedAppChatHeaders(snapKey) ? "yes" : "no"}`
    );
    return snapshot;
  }
  const xid = String(snapshot.x_statsig_id || "").trim();
  if (xid.length >= 40) {
    log(
      `probe completed with captured x-statsig-id len=${xid.length} pair=no headers=${hasCapturedAppChatHeaders(snapKey) ? "yes" : "no"}`
    );
    return snapshot;
  }
  if (!hasCapturedAppChatHeaders(snapKey) && !hasCapturedAppChatHeaders(slot.sso)) {
    log("probe completed but app-chat headers were not captured");
    throw new BridgeError(
      "probe_submit_unavailable",
      "Probe submit action did not trigger request",
      500
    );
  }
  log(
    `probe captured app-chat headers statsig=${snapshot.x_statsig_id ? "yes" : "no"} keys=${Object.keys(
      snapshot.request_headers || {}
    ).join(",")}`
  );
  return snapshot;
}

async function sendMessage(sso, payload, conversationId) {
  const slot = await getSlot(sso);
  if (slot.busy) {
    throw new BridgeError("page_busy", "Bridge page busy", 429);
  }
  if (!payload || typeof payload.message !== "string") {
    throw new BridgeError("invalid_request", "Payload.message is required for UI bridge", 400);
  }

  slot.busy = true;
  slot.lastUsed = Date.now();
  try {
    const result = await Promise.race([
      submitThroughUi(slot, payload, conversationId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new BridgeError("request_timeout", "Bridge request timeout", 504)), REQUEST_TIMEOUT)
      ),
    ]);
    await refreshSessionSnapshot(slot).catch(() => {});
    return result;
  } finally {
    slot.busy = false;
    slot.lastUsed = Date.now();
  }
}

setInterval(async () => {
  const now = Date.now();
  for (const [key, slot] of pages.entries()) {
    if (!slot.busy && now - slot.lastUsed > PAGE_IDLE_MS) {
      await destroySlot(key);
    }
  }
}, 60000);

function respond(res, status, payload, contentType = "application/json") {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return respond(res, 200, {
      status: lastError ? "degraded" : "ok",
      pages: pages.size,
      last_error: lastError,
    });
  }

  if (req.method === "GET" && req.url.startsWith("/api/session")) {
    const parsed = new URL(req.url, `http://${HOST}:${PORT}`);
    const sso = (parsed.searchParams.get("sso") || "").trim();
    const key = sso || PROFILE_SLOT_KEY;
    let slot = pages.get(key);
    if (!slot) {
      try {
        slot = await getSlot(sso);
      } catch (error) {
        const bridgeError =
          error instanceof BridgeError
            ? error
            : new BridgeError("bridge_failed", error.message || "Bridge failed", 502);
        return respond(res, bridgeError.status, {
          code: bridgeError.code,
          error: bridgeError.message,
        });
      }
    }
    await refreshSessionSnapshot(slot).catch(() => {});
    return respond(res, 200, sessionSnapshots.get(slot.sso || "") || sessionSnapshots.get(key) || {});
  }

  if (req.method === "POST" && req.url === "/api/probe") {
    try {
      const body = await readJson(req);
      const sso = typeof body.sso === "string" ? body.sso.trim() : "";
      const force = body.force === true;
      const credentials = {
        cookies: Array.isArray(body.cookies) ? body.cookies : [],
      };
      const slot = await getSlot(sso);
      await waitForSlotProbeReady(slot, "probe-api");
      slot.busy = true;
      slot.lastUsed = Date.now();
      try {
        const snapshot = await probeAppChatHeaders(slot, force, credentials);
        lastError = null;
        return respond(res, 200, snapshot || {});
      } finally {
        slot.busy = false;
        slot.lastUsed = Date.now();
      }
    } catch (error) {
      const bridgeError =
        error instanceof BridgeError
          ? error
          : new BridgeError("bridge_failed", error.message || "Bridge failed", 502);
      lastError = { code: bridgeError.code, message: bridgeError.message };
      log(`probe failed: ${bridgeError.code} ${bridgeError.message}`);
      return respond(res, bridgeError.status, {
        code: bridgeError.code,
        error: bridgeError.message,
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const body = await readJson(req);
      const sso = typeof body.sso === "string" ? body.sso.trim() : "";
      const payload = body.payload;
      const conversationId =
        typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";

      if (!sso) {
        throw new BridgeError("invalid_request", "Missing sso", 400);
      }
      if (!payload || typeof payload !== "object") {
        throw new BridgeError("invalid_request", "Missing payload", 400);
      }

      const result = await sendMessage(sso, payload, conversationId);
      if (result.status >= 400) {
        lastError = { code: "upstream_error", status: result.status };
        log(`upstream_error status=${result.status} body=${JSON.stringify(String(result.body || "").slice(0, 400))}`);
        return respond(res, result.status, {
          code: "upstream_error",
          error: `Upstream returned ${result.status}`,
          body: result.body,
        });
      }

      lastError = null;
      return respond(res, 200, result.body, "text/plain; charset=utf-8");
    } catch (error) {
      const bridgeError =
        error instanceof BridgeError
          ? error
          : new BridgeError("bridge_failed", error.message || "Bridge failed", 502);
      lastError = { code: bridgeError.code, message: bridgeError.message };
      log(`request failed: ${bridgeError.code} ${bridgeError.message}`);
      return respond(res, bridgeError.status, {
        code: bridgeError.code,
        error: bridgeError.message,
      });
    }
  }

  return respond(res, 404, { code: "not_found", error: "Not found" });
});

server.listen(PORT, HOST, () => {
  log(
    `listening on ${HOST}:${PORT} minimal_load=${MINIMAL_LOAD ? "yes" : "no"} retain_static_cache=${RETAIN_STATIC_CACHE ? "yes" : "no"} chat_input_timeout_ms=${CHAT_INPUT_TIMEOUT_MS}`
  );
});
