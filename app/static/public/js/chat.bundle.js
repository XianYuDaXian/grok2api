(() => {
  // app/static/public/src/chat/media_items.js
  function normalizeSourceText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function normalizeHttpUrl(value) {
    const raw = String(value || "").trim();
    if (!/^https?:\/\//i.test(raw)) return "";
    try {
      return new URL(raw).toString();
    } catch (error) {
      return "";
    }
  }
  function getSourceHostname(value) {
    try {
      const parsed = new URL(String(value || ""));
      return parsed.hostname.replace(/^www\./i, "");
    } catch (error) {
      return "";
    }
  }
  function normalizeMediaUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (raw.startsWith("data:")) return raw;
    if (/^(?:https?:)?\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw, window.location.origin);
        const host = String(parsed.hostname || "").toLowerCase();
        const path = String(parsed.pathname || "").trim();
        const marker = "/v1/files/image/";
        if (path.includes(marker)) {
          return path.slice(path.indexOf(marker));
        }
        if (host === "localhost" || host === "127.0.0.1") {
          return path || "";
        }
        if (host === "assets.grok.com" && path) {
          return `/v1/files/image${path.startsWith("/") ? path : `/${path}`}`;
        }
        return raw;
      } catch (error) {
        return raw;
      }
    }
    const basePath = raw.startsWith("/") ? raw : `/${raw}`;
    return basePath.startsWith("/v1/files/image/") ? basePath : `/v1/files/image${basePath}`;
  }
  function parseRenderingCards(rendering) {
    const rawModelResponse = rendering && rendering.rawModelResponse && typeof rendering.rawModelResponse === "object" ? rendering.rawModelResponse : null;
    const rawCards = Array.isArray(rawModelResponse && rawModelResponse.cardAttachmentsJson) ? rawModelResponse.cardAttachmentsJson : [];
    const cardMap = /* @__PURE__ */ new Map();
    rawCards.forEach((raw) => {
      if (typeof raw !== "string" || !raw.trim()) return;
      try {
        const card = JSON.parse(raw);
        if (!card || typeof card !== "object" || !card.id) return;
        cardMap.set(String(card.id), card);
      } catch (error) {
      }
    });
    return cardMap;
  }
  function buildCardItem(card, fallbackKey = "") {
    const image = card && card.image && typeof card.image === "object" ? card.image : null;
    const chunk = card && card.image_chunk && typeof card.image_chunk === "object" ? card.image_chunk : null;
    const rawSrc = String(image && (image.original || image.link || image.thumbnail) || chunk && chunk.imageUrl || "").trim();
    const src = normalizeMediaUrl(rawSrc);
    if (!src) return null;
    const sourceHref = normalizeHttpUrl(image && (image.link || image.original) || "");
    const fallbackSrc = String(image && image.thumbnail || "").trim();
    const caption = normalizeSourceText(image && image.title || chunk && chunk.imageTitle || "");
    return {
      key: card && card.id ? `card:${card.id}` : fallbackKey || `url:${src}`,
      cardId: card && card.id ? String(card.id) : "",
      src,
      alt: caption || "image",
      caption,
      sourceHref,
      sourceLabel: sourceHref ? getSourceHostname(sourceHref) : "",
      fallbackSrc
    };
  }
  function buildMediaItems(rendering) {
    if (!rendering || typeof rendering !== "object") return [];
    const items = [];
    const seen = /* @__PURE__ */ new Set();
    const pushItem = (item) => {
      if (!item || !item.key || seen.has(item.key)) return;
      seen.add(item.key);
      items.push(item);
    };
    const cardMap = parseRenderingCards(rendering);
    cardMap.forEach((card) => {
      const cType = String(card && card.type || "");
      const cardType = String(card && card.cardType || "");
      if (cType === "render_searched_image" || cType === "render_edited_image" || cType === "render_generated_image" || cardType === "generated_image_card") {
        pushItem(buildCardItem(card));
      }
    });
    const extraImages = Array.isArray(rendering.extraImages) ? rendering.extraImages : [];
    extraImages.forEach((url) => {
      const src = normalizeMediaUrl(url);
      if (!src) return;
      pushItem({
        key: `url:${src}`,
        cardId: "",
        src,
        alt: "image",
        caption: "",
        sourceHref: "",
        sourceLabel: "",
        fallbackSrc: ""
      });
    });
    return items;
  }

  // node_modules/@chenglou/pretext/dist/bidi.js
  var baseTypes = [
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "S",
    "B",
    "S",
    "WS",
    "B",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "B",
    "B",
    "B",
    "S",
    "WS",
    "ON",
    "ON",
    "ET",
    "ET",
    "ET",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "CS",
    "ON",
    "CS",
    "ON",
    "EN",
    "EN",
    "EN",
    "EN",
    "EN",
    "EN",
    "EN",
    "EN",
    "EN",
    "EN",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "ON",
    "ON",
    "ON",
    "ON",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "B",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "BN",
    "CS",
    "ON",
    "ET",
    "ET",
    "ET",
    "ET",
    "ON",
    "ON",
    "ON",
    "ON",
    "L",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "ET",
    "ET",
    "EN",
    "EN",
    "ON",
    "L",
    "ON",
    "ON",
    "ON",
    "EN",
    "L",
    "ON",
    "ON",
    "ON",
    "ON",
    "ON",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "ON",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "ON",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L",
    "L"
  ];
  var arabicTypes = [
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "CS",
    "AL",
    "ON",
    "ON",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AN",
    "AN",
    "AN",
    "AN",
    "AN",
    "AN",
    "AN",
    "AN",
    "AN",
    "AN",
    "ET",
    "AN",
    "AN",
    "AL",
    "AL",
    "AL",
    "NSM",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "ON",
    "NSM",
    "NSM",
    "NSM",
    "NSM",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL",
    "AL"
  ];
  function classifyChar(charCode) {
    if (charCode <= 255)
      return baseTypes[charCode];
    if (1424 <= charCode && charCode <= 1524)
      return "R";
    if (1536 <= charCode && charCode <= 1791)
      return arabicTypes[charCode & 255];
    if (1792 <= charCode && charCode <= 2220)
      return "AL";
    return "L";
  }
  function computeBidiLevels(str) {
    const len = str.length;
    if (len === 0)
      return null;
    const types = new Array(len);
    let numBidi = 0;
    for (let i = 0; i < len; i++) {
      const t = classifyChar(str.charCodeAt(i));
      if (t === "R" || t === "AL" || t === "AN")
        numBidi++;
      types[i] = t;
    }
    if (numBidi === 0)
      return null;
    const startLevel = len / numBidi < 0.3 ? 0 : 1;
    const levels = new Int8Array(len);
    for (let i = 0; i < len; i++)
      levels[i] = startLevel;
    const e = startLevel & 1 ? "R" : "L";
    const sor = e;
    let lastType = sor;
    for (let i = 0; i < len; i++) {
      if (types[i] === "NSM")
        types[i] = lastType;
      else
        lastType = types[i];
    }
    lastType = sor;
    for (let i = 0; i < len; i++) {
      const t = types[i];
      if (t === "EN")
        types[i] = lastType === "AL" ? "AN" : "EN";
      else if (t === "R" || t === "L" || t === "AL")
        lastType = t;
    }
    for (let i = 0; i < len; i++) {
      if (types[i] === "AL")
        types[i] = "R";
    }
    for (let i = 1; i < len - 1; i++) {
      if (types[i] === "ES" && types[i - 1] === "EN" && types[i + 1] === "EN") {
        types[i] = "EN";
      }
      if (types[i] === "CS" && (types[i - 1] === "EN" || types[i - 1] === "AN") && types[i + 1] === types[i - 1]) {
        types[i] = types[i - 1];
      }
    }
    for (let i = 0; i < len; i++) {
      if (types[i] !== "EN")
        continue;
      let j;
      for (j = i - 1; j >= 0 && types[j] === "ET"; j--)
        types[j] = "EN";
      for (j = i + 1; j < len && types[j] === "ET"; j++)
        types[j] = "EN";
    }
    for (let i = 0; i < len; i++) {
      const t = types[i];
      if (t === "WS" || t === "ES" || t === "ET" || t === "CS")
        types[i] = "ON";
    }
    lastType = sor;
    for (let i = 0; i < len; i++) {
      const t = types[i];
      if (t === "EN")
        types[i] = lastType === "L" ? "L" : "EN";
      else if (t === "R" || t === "L")
        lastType = t;
    }
    for (let i = 0; i < len; i++) {
      if (types[i] !== "ON")
        continue;
      let end = i + 1;
      while (end < len && types[end] === "ON")
        end++;
      const before = i > 0 ? types[i - 1] : sor;
      const after = end < len ? types[end] : sor;
      const bDir = before !== "L" ? "R" : "L";
      const aDir = after !== "L" ? "R" : "L";
      if (bDir === aDir) {
        for (let j = i; j < end; j++)
          types[j] = bDir;
      }
      i = end - 1;
    }
    for (let i = 0; i < len; i++) {
      if (types[i] === "ON")
        types[i] = e;
    }
    for (let i = 0; i < len; i++) {
      const t = types[i];
      if ((levels[i] & 1) === 0) {
        if (t === "R")
          levels[i]++;
        else if (t === "AN" || t === "EN")
          levels[i] += 2;
      } else if (t === "L" || t === "AN" || t === "EN") {
        levels[i]++;
      }
    }
    return levels;
  }
  function computeSegmentLevels(normalized, segStarts) {
    const bidiLevels = computeBidiLevels(normalized);
    if (bidiLevels === null)
      return null;
    const segLevels = new Int8Array(segStarts.length);
    for (let i = 0; i < segStarts.length; i++) {
      segLevels[i] = bidiLevels[segStarts[i]];
    }
    return segLevels;
  }

  // node_modules/@chenglou/pretext/dist/analysis.js
  var collapsibleWhitespaceRunRe = /[ \t\n\r\f]+/g;
  var needsWhitespaceNormalizationRe = /[\t\n\r\f]| {2,}|^ | $/;
  function getWhiteSpaceProfile(whiteSpace) {
    const mode = whiteSpace ?? "normal";
    return mode === "pre-wrap" ? { mode, preserveOrdinarySpaces: true, preserveHardBreaks: true } : { mode, preserveOrdinarySpaces: false, preserveHardBreaks: false };
  }
  function normalizeWhitespaceNormal(text) {
    if (!needsWhitespaceNormalizationRe.test(text))
      return text;
    let normalized = text.replace(collapsibleWhitespaceRunRe, " ");
    if (normalized.charCodeAt(0) === 32) {
      normalized = normalized.slice(1);
    }
    if (normalized.length > 0 && normalized.charCodeAt(normalized.length - 1) === 32) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
  function normalizeWhitespacePreWrap(text) {
    if (!/[\r\f]/.test(text))
      return text.replace(/\r\n/g, "\n");
    return text.replace(/\r\n/g, "\n").replace(/[\r\f]/g, "\n");
  }
  var sharedWordSegmenter = null;
  var segmenterLocale;
  function getSharedWordSegmenter() {
    if (sharedWordSegmenter === null) {
      sharedWordSegmenter = new Intl.Segmenter(segmenterLocale, { granularity: "word" });
    }
    return sharedWordSegmenter;
  }
  var arabicScriptRe = /\p{Script=Arabic}/u;
  var combiningMarkRe = /\p{M}/u;
  var decimalDigitRe = /\p{Nd}/u;
  function containsArabicScript(text) {
    return arabicScriptRe.test(text);
  }
  function isCJK(s) {
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c >= 19968 && c <= 40959 || c >= 13312 && c <= 19903 || c >= 131072 && c <= 173791 || c >= 173824 && c <= 177983 || c >= 177984 && c <= 178207 || c >= 178208 && c <= 183983 || c >= 183984 && c <= 191471 || c >= 196608 && c <= 201551 || c >= 63744 && c <= 64255 || c >= 194560 && c <= 195103 || c >= 12288 && c <= 12351 || c >= 12352 && c <= 12447 || c >= 12448 && c <= 12543 || c >= 44032 && c <= 55215 || c >= 65280 && c <= 65519) {
        return true;
      }
    }
    return false;
  }
  var kinsokuStart = /* @__PURE__ */ new Set([
    "\uFF0C",
    "\uFF0E",
    "\uFF01",
    "\uFF1A",
    "\uFF1B",
    "\uFF1F",
    "\u3001",
    "\u3002",
    "\u30FB",
    "\uFF09",
    "\u3015",
    "\u3009",
    "\u300B",
    "\u300D",
    "\u300F",
    "\u3011",
    "\u3017",
    "\u3019",
    "\u301B",
    "\u30FC",
    "\u3005",
    "\u303B",
    "\u309D",
    "\u309E",
    "\u30FD",
    "\u30FE"
  ]);
  var kinsokuEnd = /* @__PURE__ */ new Set([
    '"',
    "(",
    "[",
    "{",
    "\u201C",
    "\u2018",
    "\xAB",
    "\u2039",
    "\uFF08",
    "\u3014",
    "\u3008",
    "\u300A",
    "\u300C",
    "\u300E",
    "\u3010",
    "\u3016",
    "\u3018",
    "\u301A"
  ]);
  var forwardStickyGlue = /* @__PURE__ */ new Set([
    "'",
    "\u2019"
  ]);
  var leftStickyPunctuation = /* @__PURE__ */ new Set([
    ".",
    ",",
    "!",
    "?",
    ":",
    ";",
    "\u060C",
    "\u061B",
    "\u061F",
    "\u0964",
    "\u0965",
    "\u104A",
    "\u104B",
    "\u104C",
    "\u104D",
    "\u104F",
    ")",
    "]",
    "}",
    "%",
    '"',
    "\u201D",
    "\u2019",
    "\xBB",
    "\u203A",
    "\u2026"
  ]);
  var arabicNoSpaceTrailingPunctuation = /* @__PURE__ */ new Set([
    ":",
    ".",
    "\u060C",
    "\u061B"
  ]);
  var myanmarMedialGlue = /* @__PURE__ */ new Set([
    "\u104F"
  ]);
  var closingQuoteChars = /* @__PURE__ */ new Set([
    "\u201D",
    "\u2019",
    "\xBB",
    "\u203A",
    "\u300D",
    "\u300F",
    "\u3011",
    "\u300B",
    "\u3009",
    "\u3015",
    "\uFF09"
  ]);
  function isLeftStickyPunctuationSegment(segment) {
    if (isEscapedQuoteClusterSegment(segment))
      return true;
    let sawPunctuation = false;
    for (const ch of segment) {
      if (leftStickyPunctuation.has(ch)) {
        sawPunctuation = true;
        continue;
      }
      if (sawPunctuation && combiningMarkRe.test(ch))
        continue;
      return false;
    }
    return sawPunctuation;
  }
  function isCJKLineStartProhibitedSegment(segment) {
    for (const ch of segment) {
      if (!kinsokuStart.has(ch) && !leftStickyPunctuation.has(ch))
        return false;
    }
    return segment.length > 0;
  }
  function isForwardStickyClusterSegment(segment) {
    if (isEscapedQuoteClusterSegment(segment))
      return true;
    for (const ch of segment) {
      if (!kinsokuEnd.has(ch) && !forwardStickyGlue.has(ch) && !combiningMarkRe.test(ch))
        return false;
    }
    return segment.length > 0;
  }
  function isEscapedQuoteClusterSegment(segment) {
    let sawQuote = false;
    for (const ch of segment) {
      if (ch === "\\" || combiningMarkRe.test(ch))
        continue;
      if (kinsokuEnd.has(ch) || leftStickyPunctuation.has(ch) || forwardStickyGlue.has(ch)) {
        sawQuote = true;
        continue;
      }
      return false;
    }
    return sawQuote;
  }
  function splitTrailingForwardStickyCluster(text) {
    const chars = Array.from(text);
    let splitIndex = chars.length;
    while (splitIndex > 0) {
      const ch = chars[splitIndex - 1];
      if (combiningMarkRe.test(ch)) {
        splitIndex--;
        continue;
      }
      if (kinsokuEnd.has(ch) || forwardStickyGlue.has(ch)) {
        splitIndex--;
        continue;
      }
      break;
    }
    if (splitIndex <= 0 || splitIndex === chars.length)
      return null;
    return {
      head: chars.slice(0, splitIndex).join(""),
      tail: chars.slice(splitIndex).join("")
    };
  }
  function isRepeatedSingleCharRun(segment, ch) {
    if (segment.length === 0)
      return false;
    for (const part of segment) {
      if (part !== ch)
        return false;
    }
    return true;
  }
  function endsWithArabicNoSpacePunctuation(segment) {
    if (!containsArabicScript(segment) || segment.length === 0)
      return false;
    return arabicNoSpaceTrailingPunctuation.has(segment[segment.length - 1]);
  }
  function endsWithMyanmarMedialGlue(segment) {
    if (segment.length === 0)
      return false;
    return myanmarMedialGlue.has(segment[segment.length - 1]);
  }
  function splitLeadingSpaceAndMarks(segment) {
    if (segment.length < 2 || segment[0] !== " ")
      return null;
    const marks = segment.slice(1);
    if (/^\p{M}+$/u.test(marks)) {
      return { space: " ", marks };
    }
    return null;
  }
  function endsWithClosingQuote(text) {
    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i];
      if (closingQuoteChars.has(ch))
        return true;
      if (!leftStickyPunctuation.has(ch))
        return false;
    }
    return false;
  }
  function classifySegmentBreakChar(ch, whiteSpaceProfile) {
    if (whiteSpaceProfile.preserveOrdinarySpaces || whiteSpaceProfile.preserveHardBreaks) {
      if (ch === " ")
        return "preserved-space";
      if (ch === "	")
        return "tab";
      if (whiteSpaceProfile.preserveHardBreaks && ch === "\n")
        return "hard-break";
    }
    if (ch === " ")
      return "space";
    if (ch === "\xA0" || ch === "\u202F" || ch === "\u2060" || ch === "\uFEFF") {
      return "glue";
    }
    if (ch === "\u200B")
      return "zero-width-break";
    if (ch === "\xAD")
      return "soft-hyphen";
    return "text";
  }
  function splitSegmentByBreakKind(segment, isWordLike, start, whiteSpaceProfile) {
    const pieces = [];
    let currentKind = null;
    let currentText = "";
    let currentStart = start;
    let currentWordLike = false;
    let offset = 0;
    for (const ch of segment) {
      const kind = classifySegmentBreakChar(ch, whiteSpaceProfile);
      const wordLike = kind === "text" && isWordLike;
      if (currentKind !== null && kind === currentKind && wordLike === currentWordLike) {
        currentText += ch;
        offset += ch.length;
        continue;
      }
      if (currentKind !== null) {
        pieces.push({
          text: currentText,
          isWordLike: currentWordLike,
          kind: currentKind,
          start: currentStart
        });
      }
      currentKind = kind;
      currentText = ch;
      currentStart = start + offset;
      currentWordLike = wordLike;
      offset += ch.length;
    }
    if (currentKind !== null) {
      pieces.push({
        text: currentText,
        isWordLike: currentWordLike,
        kind: currentKind,
        start: currentStart
      });
    }
    return pieces;
  }
  function isTextRunBoundary(kind) {
    return kind === "space" || kind === "preserved-space" || kind === "zero-width-break" || kind === "hard-break";
  }
  var urlSchemeSegmentRe = /^[A-Za-z][A-Za-z0-9+.-]*:$/;
  function isUrlLikeRunStart(segmentation, index) {
    const text = segmentation.texts[index];
    if (text.startsWith("www."))
      return true;
    return urlSchemeSegmentRe.test(text) && index + 1 < segmentation.len && segmentation.kinds[index + 1] === "text" && segmentation.texts[index + 1] === "//";
  }
  function isUrlQueryBoundarySegment(text) {
    return text.includes("?") && (text.includes("://") || text.startsWith("www."));
  }
  function mergeUrlLikeRuns(segmentation) {
    const texts = segmentation.texts.slice();
    const isWordLike = segmentation.isWordLike.slice();
    const kinds = segmentation.kinds.slice();
    const starts = segmentation.starts.slice();
    for (let i = 0; i < segmentation.len; i++) {
      if (kinds[i] !== "text" || !isUrlLikeRunStart(segmentation, i))
        continue;
      let j = i + 1;
      while (j < segmentation.len && !isTextRunBoundary(kinds[j])) {
        texts[i] += texts[j];
        isWordLike[i] = true;
        const endsQueryPrefix = texts[j].includes("?");
        kinds[j] = "text";
        texts[j] = "";
        j++;
        if (endsQueryPrefix)
          break;
      }
    }
    let compactLen = 0;
    for (let read = 0; read < texts.length; read++) {
      const text = texts[read];
      if (text.length === 0)
        continue;
      if (compactLen !== read) {
        texts[compactLen] = text;
        isWordLike[compactLen] = isWordLike[read];
        kinds[compactLen] = kinds[read];
        starts[compactLen] = starts[read];
      }
      compactLen++;
    }
    texts.length = compactLen;
    isWordLike.length = compactLen;
    kinds.length = compactLen;
    starts.length = compactLen;
    return {
      len: compactLen,
      texts,
      isWordLike,
      kinds,
      starts
    };
  }
  function mergeUrlQueryRuns(segmentation) {
    const texts = [];
    const isWordLike = [];
    const kinds = [];
    const starts = [];
    for (let i = 0; i < segmentation.len; i++) {
      const text = segmentation.texts[i];
      texts.push(text);
      isWordLike.push(segmentation.isWordLike[i]);
      kinds.push(segmentation.kinds[i]);
      starts.push(segmentation.starts[i]);
      if (!isUrlQueryBoundarySegment(text))
        continue;
      const nextIndex = i + 1;
      if (nextIndex >= segmentation.len || isTextRunBoundary(segmentation.kinds[nextIndex])) {
        continue;
      }
      let queryText = "";
      const queryStart = segmentation.starts[nextIndex];
      let j = nextIndex;
      while (j < segmentation.len && !isTextRunBoundary(segmentation.kinds[j])) {
        queryText += segmentation.texts[j];
        j++;
      }
      if (queryText.length > 0) {
        texts.push(queryText);
        isWordLike.push(true);
        kinds.push("text");
        starts.push(queryStart);
        i = j - 1;
      }
    }
    return {
      len: texts.length,
      texts,
      isWordLike,
      kinds,
      starts
    };
  }
  var numericJoinerChars = /* @__PURE__ */ new Set([
    ":",
    "-",
    "/",
    "\xD7",
    ",",
    ".",
    "+",
    "\u2013",
    "\u2014"
  ]);
  var asciiPunctuationChainSegmentRe = /^[A-Za-z0-9_]+[,:;]*$/;
  var asciiPunctuationChainTrailingJoinersRe = /[,:;]+$/;
  function segmentContainsDecimalDigit(text) {
    for (const ch of text) {
      if (decimalDigitRe.test(ch))
        return true;
    }
    return false;
  }
  function isNumericRunSegment(text) {
    if (text.length === 0)
      return false;
    for (const ch of text) {
      if (decimalDigitRe.test(ch) || numericJoinerChars.has(ch))
        continue;
      return false;
    }
    return true;
  }
  function mergeNumericRuns(segmentation) {
    const texts = [];
    const isWordLike = [];
    const kinds = [];
    const starts = [];
    for (let i = 0; i < segmentation.len; i++) {
      const text = segmentation.texts[i];
      const kind = segmentation.kinds[i];
      if (kind === "text" && isNumericRunSegment(text) && segmentContainsDecimalDigit(text)) {
        let mergedText = text;
        let j = i + 1;
        while (j < segmentation.len && segmentation.kinds[j] === "text" && isNumericRunSegment(segmentation.texts[j])) {
          mergedText += segmentation.texts[j];
          j++;
        }
        texts.push(mergedText);
        isWordLike.push(true);
        kinds.push("text");
        starts.push(segmentation.starts[i]);
        i = j - 1;
        continue;
      }
      texts.push(text);
      isWordLike.push(segmentation.isWordLike[i]);
      kinds.push(kind);
      starts.push(segmentation.starts[i]);
    }
    return {
      len: texts.length,
      texts,
      isWordLike,
      kinds,
      starts
    };
  }
  function mergeAsciiPunctuationChains(segmentation) {
    const texts = [];
    const isWordLike = [];
    const kinds = [];
    const starts = [];
    for (let i = 0; i < segmentation.len; i++) {
      const text = segmentation.texts[i];
      const kind = segmentation.kinds[i];
      const wordLike = segmentation.isWordLike[i];
      if (kind === "text" && wordLike && asciiPunctuationChainSegmentRe.test(text)) {
        let mergedText = text;
        let j = i + 1;
        while (asciiPunctuationChainTrailingJoinersRe.test(mergedText) && j < segmentation.len && segmentation.kinds[j] === "text" && segmentation.isWordLike[j] && asciiPunctuationChainSegmentRe.test(segmentation.texts[j])) {
          mergedText += segmentation.texts[j];
          j++;
        }
        texts.push(mergedText);
        isWordLike.push(true);
        kinds.push("text");
        starts.push(segmentation.starts[i]);
        i = j - 1;
        continue;
      }
      texts.push(text);
      isWordLike.push(wordLike);
      kinds.push(kind);
      starts.push(segmentation.starts[i]);
    }
    return {
      len: texts.length,
      texts,
      isWordLike,
      kinds,
      starts
    };
  }
  function splitHyphenatedNumericRuns(segmentation) {
    const texts = [];
    const isWordLike = [];
    const kinds = [];
    const starts = [];
    for (let i = 0; i < segmentation.len; i++) {
      const text = segmentation.texts[i];
      if (segmentation.kinds[i] === "text" && text.includes("-")) {
        const parts = text.split("-");
        let shouldSplit = parts.length > 1;
        for (let j = 0; j < parts.length; j++) {
          const part = parts[j];
          if (!shouldSplit)
            break;
          if (part.length === 0 || !segmentContainsDecimalDigit(part) || !isNumericRunSegment(part)) {
            shouldSplit = false;
          }
        }
        if (shouldSplit) {
          let offset = 0;
          for (let j = 0; j < parts.length; j++) {
            const part = parts[j];
            const splitText = j < parts.length - 1 ? `${part}-` : part;
            texts.push(splitText);
            isWordLike.push(true);
            kinds.push("text");
            starts.push(segmentation.starts[i] + offset);
            offset += splitText.length;
          }
          continue;
        }
      }
      texts.push(text);
      isWordLike.push(segmentation.isWordLike[i]);
      kinds.push(segmentation.kinds[i]);
      starts.push(segmentation.starts[i]);
    }
    return {
      len: texts.length,
      texts,
      isWordLike,
      kinds,
      starts
    };
  }
  function mergeGlueConnectedTextRuns(segmentation) {
    const texts = [];
    const isWordLike = [];
    const kinds = [];
    const starts = [];
    let read = 0;
    while (read < segmentation.len) {
      let text = segmentation.texts[read];
      let wordLike = segmentation.isWordLike[read];
      let kind = segmentation.kinds[read];
      let start = segmentation.starts[read];
      if (kind === "glue") {
        let glueText = text;
        const glueStart = start;
        read++;
        while (read < segmentation.len && segmentation.kinds[read] === "glue") {
          glueText += segmentation.texts[read];
          read++;
        }
        if (read < segmentation.len && segmentation.kinds[read] === "text") {
          text = glueText + segmentation.texts[read];
          wordLike = segmentation.isWordLike[read];
          kind = "text";
          start = glueStart;
          read++;
        } else {
          texts.push(glueText);
          isWordLike.push(false);
          kinds.push("glue");
          starts.push(glueStart);
          continue;
        }
      } else {
        read++;
      }
      if (kind === "text") {
        while (read < segmentation.len && segmentation.kinds[read] === "glue") {
          let glueText = "";
          while (read < segmentation.len && segmentation.kinds[read] === "glue") {
            glueText += segmentation.texts[read];
            read++;
          }
          if (read < segmentation.len && segmentation.kinds[read] === "text") {
            text += glueText + segmentation.texts[read];
            wordLike = wordLike || segmentation.isWordLike[read];
            read++;
            continue;
          }
          text += glueText;
        }
      }
      texts.push(text);
      isWordLike.push(wordLike);
      kinds.push(kind);
      starts.push(start);
    }
    return {
      len: texts.length,
      texts,
      isWordLike,
      kinds,
      starts
    };
  }
  function carryTrailingForwardStickyAcrossCJKBoundary(segmentation) {
    const texts = segmentation.texts.slice();
    const isWordLike = segmentation.isWordLike.slice();
    const kinds = segmentation.kinds.slice();
    const starts = segmentation.starts.slice();
    for (let i = 0; i < texts.length - 1; i++) {
      if (kinds[i] !== "text" || kinds[i + 1] !== "text")
        continue;
      if (!isCJK(texts[i]) || !isCJK(texts[i + 1]))
        continue;
      const split = splitTrailingForwardStickyCluster(texts[i]);
      if (split === null)
        continue;
      texts[i] = split.head;
      texts[i + 1] = split.tail + texts[i + 1];
      starts[i + 1] = starts[i] + split.head.length;
    }
    return {
      len: texts.length,
      texts,
      isWordLike,
      kinds,
      starts
    };
  }
  function buildMergedSegmentation(normalized, profile, whiteSpaceProfile) {
    const wordSegmenter = getSharedWordSegmenter();
    let mergedLen = 0;
    const mergedTexts = [];
    const mergedWordLike = [];
    const mergedKinds = [];
    const mergedStarts = [];
    for (const s of wordSegmenter.segment(normalized)) {
      for (const piece of splitSegmentByBreakKind(s.segment, s.isWordLike ?? false, s.index, whiteSpaceProfile)) {
        const isText = piece.kind === "text";
        if (profile.carryCJKAfterClosingQuote && isText && mergedLen > 0 && mergedKinds[mergedLen - 1] === "text" && isCJK(piece.text) && isCJK(mergedTexts[mergedLen - 1]) && endsWithClosingQuote(mergedTexts[mergedLen - 1])) {
          mergedTexts[mergedLen - 1] += piece.text;
          mergedWordLike[mergedLen - 1] = mergedWordLike[mergedLen - 1] || piece.isWordLike;
        } else if (isText && mergedLen > 0 && mergedKinds[mergedLen - 1] === "text" && isCJKLineStartProhibitedSegment(piece.text) && isCJK(mergedTexts[mergedLen - 1])) {
          mergedTexts[mergedLen - 1] += piece.text;
          mergedWordLike[mergedLen - 1] = mergedWordLike[mergedLen - 1] || piece.isWordLike;
        } else if (isText && mergedLen > 0 && mergedKinds[mergedLen - 1] === "text" && endsWithMyanmarMedialGlue(mergedTexts[mergedLen - 1])) {
          mergedTexts[mergedLen - 1] += piece.text;
          mergedWordLike[mergedLen - 1] = mergedWordLike[mergedLen - 1] || piece.isWordLike;
        } else if (isText && mergedLen > 0 && mergedKinds[mergedLen - 1] === "text" && piece.isWordLike && containsArabicScript(piece.text) && endsWithArabicNoSpacePunctuation(mergedTexts[mergedLen - 1])) {
          mergedTexts[mergedLen - 1] += piece.text;
          mergedWordLike[mergedLen - 1] = true;
        } else if (isText && !piece.isWordLike && mergedLen > 0 && mergedKinds[mergedLen - 1] === "text" && piece.text.length === 1 && piece.text !== "-" && piece.text !== "\u2014" && isRepeatedSingleCharRun(mergedTexts[mergedLen - 1], piece.text)) {
          mergedTexts[mergedLen - 1] += piece.text;
        } else if (isText && !piece.isWordLike && mergedLen > 0 && mergedKinds[mergedLen - 1] === "text" && (isLeftStickyPunctuationSegment(piece.text) || piece.text === "-" && mergedWordLike[mergedLen - 1])) {
          mergedTexts[mergedLen - 1] += piece.text;
        } else {
          mergedTexts[mergedLen] = piece.text;
          mergedWordLike[mergedLen] = piece.isWordLike;
          mergedKinds[mergedLen] = piece.kind;
          mergedStarts[mergedLen] = piece.start;
          mergedLen++;
        }
      }
    }
    for (let i = 1; i < mergedLen; i++) {
      if (mergedKinds[i] === "text" && !mergedWordLike[i] && isEscapedQuoteClusterSegment(mergedTexts[i]) && mergedKinds[i - 1] === "text") {
        mergedTexts[i - 1] += mergedTexts[i];
        mergedWordLike[i - 1] = mergedWordLike[i - 1] || mergedWordLike[i];
        mergedTexts[i] = "";
      }
    }
    for (let i = mergedLen - 2; i >= 0; i--) {
      if (mergedKinds[i] === "text" && !mergedWordLike[i] && isForwardStickyClusterSegment(mergedTexts[i])) {
        let j = i + 1;
        while (j < mergedLen && mergedTexts[j] === "")
          j++;
        if (j < mergedLen && mergedKinds[j] === "text") {
          mergedTexts[j] = mergedTexts[i] + mergedTexts[j];
          mergedStarts[j] = mergedStarts[i];
          mergedTexts[i] = "";
        }
      }
    }
    let compactLen = 0;
    for (let read = 0; read < mergedLen; read++) {
      const text = mergedTexts[read];
      if (text.length === 0)
        continue;
      if (compactLen !== read) {
        mergedTexts[compactLen] = text;
        mergedWordLike[compactLen] = mergedWordLike[read];
        mergedKinds[compactLen] = mergedKinds[read];
        mergedStarts[compactLen] = mergedStarts[read];
      }
      compactLen++;
    }
    mergedTexts.length = compactLen;
    mergedWordLike.length = compactLen;
    mergedKinds.length = compactLen;
    mergedStarts.length = compactLen;
    const compacted = mergeGlueConnectedTextRuns({
      len: compactLen,
      texts: mergedTexts,
      isWordLike: mergedWordLike,
      kinds: mergedKinds,
      starts: mergedStarts
    });
    const withMergedUrls = carryTrailingForwardStickyAcrossCJKBoundary(mergeAsciiPunctuationChains(splitHyphenatedNumericRuns(mergeNumericRuns(mergeUrlQueryRuns(mergeUrlLikeRuns(compacted))))));
    for (let i = 0; i < withMergedUrls.len - 1; i++) {
      const split = splitLeadingSpaceAndMarks(withMergedUrls.texts[i]);
      if (split === null)
        continue;
      if (withMergedUrls.kinds[i] !== "space" && withMergedUrls.kinds[i] !== "preserved-space" || withMergedUrls.kinds[i + 1] !== "text" || !containsArabicScript(withMergedUrls.texts[i + 1])) {
        continue;
      }
      withMergedUrls.texts[i] = split.space;
      withMergedUrls.isWordLike[i] = false;
      withMergedUrls.kinds[i] = withMergedUrls.kinds[i] === "preserved-space" ? "preserved-space" : "space";
      withMergedUrls.texts[i + 1] = split.marks + withMergedUrls.texts[i + 1];
      withMergedUrls.starts[i + 1] = withMergedUrls.starts[i] + split.space.length;
    }
    return withMergedUrls;
  }
  function compileAnalysisChunks(segmentation, whiteSpaceProfile) {
    if (segmentation.len === 0)
      return [];
    if (!whiteSpaceProfile.preserveHardBreaks) {
      return [{
        startSegmentIndex: 0,
        endSegmentIndex: segmentation.len,
        consumedEndSegmentIndex: segmentation.len
      }];
    }
    const chunks = [];
    let startSegmentIndex = 0;
    for (let i = 0; i < segmentation.len; i++) {
      if (segmentation.kinds[i] !== "hard-break")
        continue;
      chunks.push({
        startSegmentIndex,
        endSegmentIndex: i,
        consumedEndSegmentIndex: i + 1
      });
      startSegmentIndex = i + 1;
    }
    if (startSegmentIndex < segmentation.len) {
      chunks.push({
        startSegmentIndex,
        endSegmentIndex: segmentation.len,
        consumedEndSegmentIndex: segmentation.len
      });
    }
    return chunks;
  }
  function analyzeText(text, profile, whiteSpace = "normal") {
    const whiteSpaceProfile = getWhiteSpaceProfile(whiteSpace);
    const normalized = whiteSpaceProfile.mode === "pre-wrap" ? normalizeWhitespacePreWrap(text) : normalizeWhitespaceNormal(text);
    if (normalized.length === 0) {
      return {
        normalized,
        chunks: [],
        len: 0,
        texts: [],
        isWordLike: [],
        kinds: [],
        starts: []
      };
    }
    const segmentation = buildMergedSegmentation(normalized, profile, whiteSpaceProfile);
    return {
      normalized,
      chunks: compileAnalysisChunks(segmentation, whiteSpaceProfile),
      ...segmentation
    };
  }

  // node_modules/@chenglou/pretext/dist/measurement.js
  var measureContext = null;
  var segmentMetricCaches = /* @__PURE__ */ new Map();
  var cachedEngineProfile = null;
  var emojiPresentationRe = /\p{Emoji_Presentation}/u;
  var maybeEmojiRe = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
  var sharedGraphemeSegmenter = null;
  var emojiCorrectionCache = /* @__PURE__ */ new Map();
  function getMeasureContext() {
    if (measureContext !== null)
      return measureContext;
    if (typeof OffscreenCanvas !== "undefined") {
      measureContext = new OffscreenCanvas(1, 1).getContext("2d");
      return measureContext;
    }
    if (typeof document !== "undefined") {
      measureContext = document.createElement("canvas").getContext("2d");
      return measureContext;
    }
    throw new Error("Text measurement requires OffscreenCanvas or a DOM canvas context.");
  }
  function getSegmentMetricCache(font) {
    let cache = segmentMetricCaches.get(font);
    if (!cache) {
      cache = /* @__PURE__ */ new Map();
      segmentMetricCaches.set(font, cache);
    }
    return cache;
  }
  function getSegmentMetrics(seg, cache) {
    let metrics = cache.get(seg);
    if (metrics === void 0) {
      const ctx = getMeasureContext();
      metrics = {
        width: ctx.measureText(seg).width,
        containsCJK: isCJK(seg)
      };
      cache.set(seg, metrics);
    }
    return metrics;
  }
  function getEngineProfile() {
    if (cachedEngineProfile !== null)
      return cachedEngineProfile;
    if (typeof navigator === "undefined") {
      cachedEngineProfile = {
        lineFitEpsilon: 5e-3,
        carryCJKAfterClosingQuote: false,
        preferPrefixWidthsForBreakableRuns: false,
        preferEarlySoftHyphenBreak: false
      };
      return cachedEngineProfile;
    }
    const ua = navigator.userAgent;
    const vendor = navigator.vendor;
    const isSafari = vendor === "Apple Computer, Inc." && ua.includes("Safari/") && !ua.includes("Chrome/") && !ua.includes("Chromium/") && !ua.includes("CriOS/") && !ua.includes("FxiOS/") && !ua.includes("EdgiOS/");
    const isChromium = ua.includes("Chrome/") || ua.includes("Chromium/") || ua.includes("CriOS/") || ua.includes("Edg/");
    cachedEngineProfile = {
      lineFitEpsilon: isSafari ? 1 / 64 : 5e-3,
      carryCJKAfterClosingQuote: isChromium,
      preferPrefixWidthsForBreakableRuns: isSafari,
      preferEarlySoftHyphenBreak: isSafari
    };
    return cachedEngineProfile;
  }
  function parseFontSize(font) {
    const m = font.match(/(\d+(?:\.\d+)?)\s*px/);
    return m ? parseFloat(m[1]) : 16;
  }
  function getSharedGraphemeSegmenter() {
    if (sharedGraphemeSegmenter === null) {
      sharedGraphemeSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
    }
    return sharedGraphemeSegmenter;
  }
  function isEmojiGrapheme(g) {
    return emojiPresentationRe.test(g) || g.includes("\uFE0F");
  }
  function textMayContainEmoji(text) {
    return maybeEmojiRe.test(text);
  }
  function getEmojiCorrection(font, fontSize) {
    let correction = emojiCorrectionCache.get(font);
    if (correction !== void 0)
      return correction;
    const ctx = getMeasureContext();
    ctx.font = font;
    const canvasW = ctx.measureText("\u{1F600}").width;
    correction = 0;
    if (canvasW > fontSize + 0.5 && typeof document !== "undefined" && document.body !== null) {
      const span = document.createElement("span");
      span.style.font = font;
      span.style.display = "inline-block";
      span.style.visibility = "hidden";
      span.style.position = "absolute";
      span.textContent = "\u{1F600}";
      document.body.appendChild(span);
      const domW = span.getBoundingClientRect().width;
      document.body.removeChild(span);
      if (canvasW - domW > 0.5) {
        correction = canvasW - domW;
      }
    }
    emojiCorrectionCache.set(font, correction);
    return correction;
  }
  function countEmojiGraphemes(text) {
    let count = 0;
    const graphemeSegmenter = getSharedGraphemeSegmenter();
    for (const g of graphemeSegmenter.segment(text)) {
      if (isEmojiGrapheme(g.segment))
        count++;
    }
    return count;
  }
  function getEmojiCount(seg, metrics) {
    if (metrics.emojiCount === void 0) {
      metrics.emojiCount = countEmojiGraphemes(seg);
    }
    return metrics.emojiCount;
  }
  function getCorrectedSegmentWidth(seg, metrics, emojiCorrection) {
    if (emojiCorrection === 0)
      return metrics.width;
    return metrics.width - getEmojiCount(seg, metrics) * emojiCorrection;
  }
  function getSegmentGraphemeWidths(seg, metrics, cache, emojiCorrection) {
    if (metrics.graphemeWidths !== void 0)
      return metrics.graphemeWidths;
    const widths = [];
    const graphemeSegmenter = getSharedGraphemeSegmenter();
    for (const gs of graphemeSegmenter.segment(seg)) {
      const graphemeMetrics = getSegmentMetrics(gs.segment, cache);
      widths.push(getCorrectedSegmentWidth(gs.segment, graphemeMetrics, emojiCorrection));
    }
    metrics.graphemeWidths = widths.length > 1 ? widths : null;
    return metrics.graphemeWidths;
  }
  function getSegmentGraphemePrefixWidths(seg, metrics, cache, emojiCorrection) {
    if (metrics.graphemePrefixWidths !== void 0)
      return metrics.graphemePrefixWidths;
    const prefixWidths = [];
    const graphemeSegmenter = getSharedGraphemeSegmenter();
    let prefix = "";
    for (const gs of graphemeSegmenter.segment(seg)) {
      prefix += gs.segment;
      const prefixMetrics = getSegmentMetrics(prefix, cache);
      prefixWidths.push(getCorrectedSegmentWidth(prefix, prefixMetrics, emojiCorrection));
    }
    metrics.graphemePrefixWidths = prefixWidths.length > 1 ? prefixWidths : null;
    return metrics.graphemePrefixWidths;
  }
  function getFontMeasurementState(font, needsEmojiCorrection) {
    const ctx = getMeasureContext();
    ctx.font = font;
    const cache = getSegmentMetricCache(font);
    const fontSize = parseFontSize(font);
    const emojiCorrection = needsEmojiCorrection ? getEmojiCorrection(font, fontSize) : 0;
    return { cache, fontSize, emojiCorrection };
  }

  // node_modules/@chenglou/pretext/dist/line-break.js
  function canBreakAfter(kind) {
    return kind === "space" || kind === "preserved-space" || kind === "tab" || kind === "zero-width-break" || kind === "soft-hyphen";
  }
  function isSimpleCollapsibleSpace(kind) {
    return kind === "space";
  }
  function getTabAdvance(lineWidth, tabStopAdvance) {
    if (tabStopAdvance <= 0)
      return 0;
    const remainder = lineWidth % tabStopAdvance;
    if (Math.abs(remainder) <= 1e-6)
      return tabStopAdvance;
    return tabStopAdvance - remainder;
  }
  function getBreakableAdvance(graphemeWidths, graphemePrefixWidths, graphemeIndex, preferPrefixWidths) {
    if (!preferPrefixWidths || graphemePrefixWidths === null) {
      return graphemeWidths[graphemeIndex];
    }
    return graphemePrefixWidths[graphemeIndex] - (graphemeIndex > 0 ? graphemePrefixWidths[graphemeIndex - 1] : 0);
  }
  function fitSoftHyphenBreak(graphemeWidths, initialWidth, maxWidth, lineFitEpsilon, discretionaryHyphenWidth, cumulativeWidths) {
    let fitCount = 0;
    let fittedWidth = initialWidth;
    while (fitCount < graphemeWidths.length) {
      const nextWidth = cumulativeWidths ? initialWidth + graphemeWidths[fitCount] : fittedWidth + graphemeWidths[fitCount];
      const nextLineWidth = fitCount + 1 < graphemeWidths.length ? nextWidth + discretionaryHyphenWidth : nextWidth;
      if (nextLineWidth > maxWidth + lineFitEpsilon)
        break;
      fittedWidth = nextWidth;
      fitCount++;
    }
    return { fitCount, fittedWidth };
  }
  function countPreparedLines(prepared, maxWidth) {
    if (prepared.simpleLineWalkFastPath) {
      return countPreparedLinesSimple(prepared, maxWidth);
    }
    return walkPreparedLines(prepared, maxWidth);
  }
  function countPreparedLinesSimple(prepared, maxWidth) {
    const { widths, kinds, breakableWidths, breakablePrefixWidths } = prepared;
    if (widths.length === 0)
      return 0;
    const engineProfile = getEngineProfile();
    const lineFitEpsilon = engineProfile.lineFitEpsilon;
    let lineCount = 0;
    let lineW = 0;
    let hasContent = false;
    function placeOnFreshLine(segmentIndex) {
      const w = widths[segmentIndex];
      if (w > maxWidth && breakableWidths[segmentIndex] !== null) {
        const gWidths = breakableWidths[segmentIndex];
        const gPrefixWidths = breakablePrefixWidths[segmentIndex] ?? null;
        lineW = 0;
        for (let g = 0; g < gWidths.length; g++) {
          const gw = getBreakableAdvance(gWidths, gPrefixWidths, g, engineProfile.preferPrefixWidthsForBreakableRuns);
          if (lineW > 0 && lineW + gw > maxWidth + lineFitEpsilon) {
            lineCount++;
            lineW = gw;
          } else {
            if (lineW === 0)
              lineCount++;
            lineW += gw;
          }
        }
      } else {
        lineW = w;
        lineCount++;
      }
      hasContent = true;
    }
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i];
      const kind = kinds[i];
      if (!hasContent) {
        placeOnFreshLine(i);
        continue;
      }
      const newW = lineW + w;
      if (newW > maxWidth + lineFitEpsilon) {
        if (isSimpleCollapsibleSpace(kind))
          continue;
        lineW = 0;
        hasContent = false;
        placeOnFreshLine(i);
        continue;
      }
      lineW = newW;
    }
    if (!hasContent)
      return lineCount + 1;
    return lineCount;
  }
  function walkPreparedLinesSimple(prepared, maxWidth, onLine) {
    const { widths, kinds, breakableWidths, breakablePrefixWidths } = prepared;
    if (widths.length === 0)
      return 0;
    const engineProfile = getEngineProfile();
    const lineFitEpsilon = engineProfile.lineFitEpsilon;
    let lineCount = 0;
    let lineW = 0;
    let hasContent = false;
    let lineStartSegmentIndex = 0;
    let lineStartGraphemeIndex = 0;
    let lineEndSegmentIndex = 0;
    let lineEndGraphemeIndex = 0;
    let pendingBreakSegmentIndex = -1;
    let pendingBreakPaintWidth = 0;
    function clearPendingBreak() {
      pendingBreakSegmentIndex = -1;
      pendingBreakPaintWidth = 0;
    }
    function emitCurrentLine(endSegmentIndex = lineEndSegmentIndex, endGraphemeIndex = lineEndGraphemeIndex, width = lineW) {
      lineCount++;
      onLine?.({
        startSegmentIndex: lineStartSegmentIndex,
        startGraphemeIndex: lineStartGraphemeIndex,
        endSegmentIndex,
        endGraphemeIndex,
        width
      });
      lineW = 0;
      hasContent = false;
      clearPendingBreak();
    }
    function startLineAtSegment(segmentIndex, width) {
      hasContent = true;
      lineStartSegmentIndex = segmentIndex;
      lineStartGraphemeIndex = 0;
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
      lineW = width;
    }
    function startLineAtGrapheme(segmentIndex, graphemeIndex, width) {
      hasContent = true;
      lineStartSegmentIndex = segmentIndex;
      lineStartGraphemeIndex = graphemeIndex;
      lineEndSegmentIndex = segmentIndex;
      lineEndGraphemeIndex = graphemeIndex + 1;
      lineW = width;
    }
    function appendWholeSegment(segmentIndex, width) {
      if (!hasContent) {
        startLineAtSegment(segmentIndex, width);
        return;
      }
      lineW += width;
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
    }
    function updatePendingBreak(segmentIndex, segmentWidth) {
      if (!canBreakAfter(kinds[segmentIndex]))
        return;
      pendingBreakSegmentIndex = segmentIndex + 1;
      pendingBreakPaintWidth = lineW - segmentWidth;
    }
    function appendBreakableSegment(segmentIndex) {
      appendBreakableSegmentFrom(segmentIndex, 0);
    }
    function appendBreakableSegmentFrom(segmentIndex, startGraphemeIndex) {
      const gWidths = breakableWidths[segmentIndex];
      const gPrefixWidths = breakablePrefixWidths[segmentIndex] ?? null;
      for (let g = startGraphemeIndex; g < gWidths.length; g++) {
        const gw = getBreakableAdvance(gWidths, gPrefixWidths, g, engineProfile.preferPrefixWidthsForBreakableRuns);
        if (!hasContent) {
          startLineAtGrapheme(segmentIndex, g, gw);
          continue;
        }
        if (lineW + gw > maxWidth + lineFitEpsilon) {
          emitCurrentLine();
          startLineAtGrapheme(segmentIndex, g, gw);
        } else {
          lineW += gw;
          lineEndSegmentIndex = segmentIndex;
          lineEndGraphemeIndex = g + 1;
        }
      }
      if (hasContent && lineEndSegmentIndex === segmentIndex && lineEndGraphemeIndex === gWidths.length) {
        lineEndSegmentIndex = segmentIndex + 1;
        lineEndGraphemeIndex = 0;
      }
    }
    let i = 0;
    while (i < widths.length) {
      const w = widths[i];
      const kind = kinds[i];
      if (!hasContent) {
        if (w > maxWidth && breakableWidths[i] !== null) {
          appendBreakableSegment(i);
        } else {
          startLineAtSegment(i, w);
        }
        updatePendingBreak(i, w);
        i++;
        continue;
      }
      const newW = lineW + w;
      if (newW > maxWidth + lineFitEpsilon) {
        if (canBreakAfter(kind)) {
          appendWholeSegment(i, w);
          emitCurrentLine(i + 1, 0, lineW - w);
          i++;
          continue;
        }
        if (pendingBreakSegmentIndex >= 0) {
          emitCurrentLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
          continue;
        }
        if (w > maxWidth && breakableWidths[i] !== null) {
          emitCurrentLine();
          appendBreakableSegment(i);
          i++;
          continue;
        }
        emitCurrentLine();
        continue;
      }
      appendWholeSegment(i, w);
      updatePendingBreak(i, w);
      i++;
    }
    if (hasContent)
      emitCurrentLine();
    return lineCount;
  }
  function walkPreparedLines(prepared, maxWidth, onLine) {
    if (prepared.simpleLineWalkFastPath) {
      return walkPreparedLinesSimple(prepared, maxWidth, onLine);
    }
    const { widths, lineEndFitAdvances, lineEndPaintAdvances, kinds, breakableWidths, breakablePrefixWidths, discretionaryHyphenWidth, tabStopAdvance, chunks } = prepared;
    if (widths.length === 0 || chunks.length === 0)
      return 0;
    const engineProfile = getEngineProfile();
    const lineFitEpsilon = engineProfile.lineFitEpsilon;
    let lineCount = 0;
    let lineW = 0;
    let hasContent = false;
    let lineStartSegmentIndex = 0;
    let lineStartGraphemeIndex = 0;
    let lineEndSegmentIndex = 0;
    let lineEndGraphemeIndex = 0;
    let pendingBreakSegmentIndex = -1;
    let pendingBreakFitWidth = 0;
    let pendingBreakPaintWidth = 0;
    let pendingBreakKind = null;
    function clearPendingBreak() {
      pendingBreakSegmentIndex = -1;
      pendingBreakFitWidth = 0;
      pendingBreakPaintWidth = 0;
      pendingBreakKind = null;
    }
    function emitCurrentLine(endSegmentIndex = lineEndSegmentIndex, endGraphemeIndex = lineEndGraphemeIndex, width = lineW) {
      lineCount++;
      onLine?.({
        startSegmentIndex: lineStartSegmentIndex,
        startGraphemeIndex: lineStartGraphemeIndex,
        endSegmentIndex,
        endGraphemeIndex,
        width
      });
      lineW = 0;
      hasContent = false;
      clearPendingBreak();
    }
    function startLineAtSegment(segmentIndex, width) {
      hasContent = true;
      lineStartSegmentIndex = segmentIndex;
      lineStartGraphemeIndex = 0;
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
      lineW = width;
    }
    function startLineAtGrapheme(segmentIndex, graphemeIndex, width) {
      hasContent = true;
      lineStartSegmentIndex = segmentIndex;
      lineStartGraphemeIndex = graphemeIndex;
      lineEndSegmentIndex = segmentIndex;
      lineEndGraphemeIndex = graphemeIndex + 1;
      lineW = width;
    }
    function appendWholeSegment(segmentIndex, width) {
      if (!hasContent) {
        startLineAtSegment(segmentIndex, width);
        return;
      }
      lineW += width;
      lineEndSegmentIndex = segmentIndex + 1;
      lineEndGraphemeIndex = 0;
    }
    function updatePendingBreakForWholeSegment(segmentIndex, segmentWidth) {
      if (!canBreakAfter(kinds[segmentIndex]))
        return;
      const fitAdvance = kinds[segmentIndex] === "tab" ? 0 : lineEndFitAdvances[segmentIndex];
      const paintAdvance = kinds[segmentIndex] === "tab" ? segmentWidth : lineEndPaintAdvances[segmentIndex];
      pendingBreakSegmentIndex = segmentIndex + 1;
      pendingBreakFitWidth = lineW - segmentWidth + fitAdvance;
      pendingBreakPaintWidth = lineW - segmentWidth + paintAdvance;
      pendingBreakKind = kinds[segmentIndex];
    }
    function appendBreakableSegment(segmentIndex) {
      appendBreakableSegmentFrom(segmentIndex, 0);
    }
    function appendBreakableSegmentFrom(segmentIndex, startGraphemeIndex) {
      const gWidths = breakableWidths[segmentIndex];
      const gPrefixWidths = breakablePrefixWidths[segmentIndex] ?? null;
      for (let g = startGraphemeIndex; g < gWidths.length; g++) {
        const gw = getBreakableAdvance(gWidths, gPrefixWidths, g, engineProfile.preferPrefixWidthsForBreakableRuns);
        if (!hasContent) {
          startLineAtGrapheme(segmentIndex, g, gw);
          continue;
        }
        if (lineW + gw > maxWidth + lineFitEpsilon) {
          emitCurrentLine();
          startLineAtGrapheme(segmentIndex, g, gw);
        } else {
          lineW += gw;
          lineEndSegmentIndex = segmentIndex;
          lineEndGraphemeIndex = g + 1;
        }
      }
      if (hasContent && lineEndSegmentIndex === segmentIndex && lineEndGraphemeIndex === gWidths.length) {
        lineEndSegmentIndex = segmentIndex + 1;
        lineEndGraphemeIndex = 0;
      }
    }
    function continueSoftHyphenBreakableSegment(segmentIndex) {
      if (pendingBreakKind !== "soft-hyphen")
        return false;
      const gWidths = breakableWidths[segmentIndex];
      if (gWidths === null)
        return false;
      const fitWidths = engineProfile.preferPrefixWidthsForBreakableRuns ? breakablePrefixWidths[segmentIndex] ?? gWidths : gWidths;
      const usesPrefixWidths = fitWidths !== gWidths;
      const { fitCount, fittedWidth } = fitSoftHyphenBreak(fitWidths, lineW, maxWidth, lineFitEpsilon, discretionaryHyphenWidth, usesPrefixWidths);
      if (fitCount === 0)
        return false;
      lineW = fittedWidth;
      lineEndSegmentIndex = segmentIndex;
      lineEndGraphemeIndex = fitCount;
      clearPendingBreak();
      if (fitCount === gWidths.length) {
        lineEndSegmentIndex = segmentIndex + 1;
        lineEndGraphemeIndex = 0;
        return true;
      }
      emitCurrentLine(segmentIndex, fitCount, fittedWidth + discretionaryHyphenWidth);
      appendBreakableSegmentFrom(segmentIndex, fitCount);
      return true;
    }
    function emitEmptyChunk(chunk) {
      lineCount++;
      onLine?.({
        startSegmentIndex: chunk.startSegmentIndex,
        startGraphemeIndex: 0,
        endSegmentIndex: chunk.consumedEndSegmentIndex,
        endGraphemeIndex: 0,
        width: 0
      });
      clearPendingBreak();
    }
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      if (chunk.startSegmentIndex === chunk.endSegmentIndex) {
        emitEmptyChunk(chunk);
        continue;
      }
      hasContent = false;
      lineW = 0;
      lineStartSegmentIndex = chunk.startSegmentIndex;
      lineStartGraphemeIndex = 0;
      lineEndSegmentIndex = chunk.startSegmentIndex;
      lineEndGraphemeIndex = 0;
      clearPendingBreak();
      let i = chunk.startSegmentIndex;
      while (i < chunk.endSegmentIndex) {
        const kind = kinds[i];
        const w = kind === "tab" ? getTabAdvance(lineW, tabStopAdvance) : widths[i];
        if (kind === "soft-hyphen") {
          if (hasContent) {
            lineEndSegmentIndex = i + 1;
            lineEndGraphemeIndex = 0;
            pendingBreakSegmentIndex = i + 1;
            pendingBreakFitWidth = lineW + discretionaryHyphenWidth;
            pendingBreakPaintWidth = lineW + discretionaryHyphenWidth;
            pendingBreakKind = kind;
          }
          i++;
          continue;
        }
        if (!hasContent) {
          if (w > maxWidth && breakableWidths[i] !== null) {
            appendBreakableSegment(i);
          } else {
            startLineAtSegment(i, w);
          }
          updatePendingBreakForWholeSegment(i, w);
          i++;
          continue;
        }
        const newW = lineW + w;
        if (newW > maxWidth + lineFitEpsilon) {
          const currentBreakFitWidth = lineW + (kind === "tab" ? 0 : lineEndFitAdvances[i]);
          const currentBreakPaintWidth = lineW + (kind === "tab" ? w : lineEndPaintAdvances[i]);
          if (pendingBreakKind === "soft-hyphen" && engineProfile.preferEarlySoftHyphenBreak && pendingBreakFitWidth <= maxWidth + lineFitEpsilon) {
            emitCurrentLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
            continue;
          }
          if (pendingBreakKind === "soft-hyphen" && continueSoftHyphenBreakableSegment(i)) {
            i++;
            continue;
          }
          if (canBreakAfter(kind) && currentBreakFitWidth <= maxWidth + lineFitEpsilon) {
            appendWholeSegment(i, w);
            emitCurrentLine(i + 1, 0, currentBreakPaintWidth);
            i++;
            continue;
          }
          if (pendingBreakSegmentIndex >= 0 && pendingBreakFitWidth <= maxWidth + lineFitEpsilon) {
            emitCurrentLine(pendingBreakSegmentIndex, 0, pendingBreakPaintWidth);
            continue;
          }
          if (w > maxWidth && breakableWidths[i] !== null) {
            emitCurrentLine();
            appendBreakableSegment(i);
            i++;
            continue;
          }
          emitCurrentLine();
          continue;
        }
        appendWholeSegment(i, w);
        updatePendingBreakForWholeSegment(i, w);
        i++;
      }
      if (hasContent) {
        const finalPaintWidth = pendingBreakSegmentIndex === chunk.consumedEndSegmentIndex ? pendingBreakPaintWidth : lineW;
        emitCurrentLine(chunk.consumedEndSegmentIndex, 0, finalPaintWidth);
      }
    }
    return lineCount;
  }

  // node_modules/@chenglou/pretext/dist/layout.js
  var sharedGraphemeSegmenter2 = null;
  function getSharedGraphemeSegmenter2() {
    if (sharedGraphemeSegmenter2 === null) {
      sharedGraphemeSegmenter2 = new Intl.Segmenter(void 0, { granularity: "grapheme" });
    }
    return sharedGraphemeSegmenter2;
  }
  function createEmptyPrepared(includeSegments) {
    if (includeSegments) {
      return {
        widths: [],
        lineEndFitAdvances: [],
        lineEndPaintAdvances: [],
        kinds: [],
        simpleLineWalkFastPath: true,
        segLevels: null,
        breakableWidths: [],
        breakablePrefixWidths: [],
        discretionaryHyphenWidth: 0,
        tabStopAdvance: 0,
        chunks: [],
        segments: []
      };
    }
    return {
      widths: [],
      lineEndFitAdvances: [],
      lineEndPaintAdvances: [],
      kinds: [],
      simpleLineWalkFastPath: true,
      segLevels: null,
      breakableWidths: [],
      breakablePrefixWidths: [],
      discretionaryHyphenWidth: 0,
      tabStopAdvance: 0,
      chunks: []
    };
  }
  function measureAnalysis(analysis, font, includeSegments) {
    const graphemeSegmenter = getSharedGraphemeSegmenter2();
    const engineProfile = getEngineProfile();
    const { cache, emojiCorrection } = getFontMeasurementState(font, textMayContainEmoji(analysis.normalized));
    const discretionaryHyphenWidth = getCorrectedSegmentWidth("-", getSegmentMetrics("-", cache), emojiCorrection);
    const spaceWidth = getCorrectedSegmentWidth(" ", getSegmentMetrics(" ", cache), emojiCorrection);
    const tabStopAdvance = spaceWidth * 8;
    if (analysis.len === 0)
      return createEmptyPrepared(includeSegments);
    const widths = [];
    const lineEndFitAdvances = [];
    const lineEndPaintAdvances = [];
    const kinds = [];
    let simpleLineWalkFastPath = analysis.chunks.length <= 1;
    const segStarts = includeSegments ? [] : null;
    const breakableWidths = [];
    const breakablePrefixWidths = [];
    const segments = includeSegments ? [] : null;
    const preparedStartByAnalysisIndex = Array.from({ length: analysis.len });
    const preparedEndByAnalysisIndex = Array.from({ length: analysis.len });
    function pushMeasuredSegment(text, width, lineEndFitAdvance, lineEndPaintAdvance, kind, start, breakable, breakablePrefix) {
      if (kind !== "text" && kind !== "space" && kind !== "zero-width-break") {
        simpleLineWalkFastPath = false;
      }
      widths.push(width);
      lineEndFitAdvances.push(lineEndFitAdvance);
      lineEndPaintAdvances.push(lineEndPaintAdvance);
      kinds.push(kind);
      segStarts?.push(start);
      breakableWidths.push(breakable);
      breakablePrefixWidths.push(breakablePrefix);
      if (segments !== null)
        segments.push(text);
    }
    for (let mi = 0; mi < analysis.len; mi++) {
      preparedStartByAnalysisIndex[mi] = widths.length;
      const segText = analysis.texts[mi];
      const segWordLike = analysis.isWordLike[mi];
      const segKind = analysis.kinds[mi];
      const segStart = analysis.starts[mi];
      if (segKind === "soft-hyphen") {
        pushMeasuredSegment(segText, 0, discretionaryHyphenWidth, discretionaryHyphenWidth, segKind, segStart, null, null);
        preparedEndByAnalysisIndex[mi] = widths.length;
        continue;
      }
      if (segKind === "hard-break") {
        pushMeasuredSegment(segText, 0, 0, 0, segKind, segStart, null, null);
        preparedEndByAnalysisIndex[mi] = widths.length;
        continue;
      }
      if (segKind === "tab") {
        pushMeasuredSegment(segText, 0, 0, 0, segKind, segStart, null, null);
        preparedEndByAnalysisIndex[mi] = widths.length;
        continue;
      }
      const segMetrics = getSegmentMetrics(segText, cache);
      if (segKind === "text" && segMetrics.containsCJK) {
        let unitText = "";
        let unitStart = 0;
        for (const gs of graphemeSegmenter.segment(segText)) {
          const grapheme = gs.segment;
          if (unitText.length === 0) {
            unitText = grapheme;
            unitStart = gs.index;
            continue;
          }
          if (kinsokuEnd.has(unitText) || kinsokuStart.has(grapheme) || leftStickyPunctuation.has(grapheme) || engineProfile.carryCJKAfterClosingQuote && isCJK(grapheme) && endsWithClosingQuote(unitText)) {
            unitText += grapheme;
            continue;
          }
          const unitMetrics = getSegmentMetrics(unitText, cache);
          const w2 = getCorrectedSegmentWidth(unitText, unitMetrics, emojiCorrection);
          pushMeasuredSegment(unitText, w2, w2, w2, "text", segStart + unitStart, null, null);
          unitText = grapheme;
          unitStart = gs.index;
        }
        if (unitText.length > 0) {
          const unitMetrics = getSegmentMetrics(unitText, cache);
          const w2 = getCorrectedSegmentWidth(unitText, unitMetrics, emojiCorrection);
          pushMeasuredSegment(unitText, w2, w2, w2, "text", segStart + unitStart, null, null);
        }
        preparedEndByAnalysisIndex[mi] = widths.length;
        continue;
      }
      const w = getCorrectedSegmentWidth(segText, segMetrics, emojiCorrection);
      const lineEndFitAdvance = segKind === "space" || segKind === "preserved-space" || segKind === "zero-width-break" ? 0 : w;
      const lineEndPaintAdvance = segKind === "space" || segKind === "zero-width-break" ? 0 : w;
      if (segWordLike && segText.length > 1) {
        const graphemeWidths = getSegmentGraphemeWidths(segText, segMetrics, cache, emojiCorrection);
        const graphemePrefixWidths = engineProfile.preferPrefixWidthsForBreakableRuns ? getSegmentGraphemePrefixWidths(segText, segMetrics, cache, emojiCorrection) : null;
        pushMeasuredSegment(segText, w, lineEndFitAdvance, lineEndPaintAdvance, segKind, segStart, graphemeWidths, graphemePrefixWidths);
      } else {
        pushMeasuredSegment(segText, w, lineEndFitAdvance, lineEndPaintAdvance, segKind, segStart, null, null);
      }
      preparedEndByAnalysisIndex[mi] = widths.length;
    }
    const chunks = mapAnalysisChunksToPreparedChunks(analysis.chunks, preparedStartByAnalysisIndex, preparedEndByAnalysisIndex);
    const segLevels = segStarts === null ? null : computeSegmentLevels(analysis.normalized, segStarts);
    if (segments !== null) {
      return {
        widths,
        lineEndFitAdvances,
        lineEndPaintAdvances,
        kinds,
        simpleLineWalkFastPath,
        segLevels,
        breakableWidths,
        breakablePrefixWidths,
        discretionaryHyphenWidth,
        tabStopAdvance,
        chunks,
        segments
      };
    }
    return {
      widths,
      lineEndFitAdvances,
      lineEndPaintAdvances,
      kinds,
      simpleLineWalkFastPath,
      segLevels,
      breakableWidths,
      breakablePrefixWidths,
      discretionaryHyphenWidth,
      tabStopAdvance,
      chunks
    };
  }
  function mapAnalysisChunksToPreparedChunks(chunks, preparedStartByAnalysisIndex, preparedEndByAnalysisIndex) {
    const preparedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const startSegmentIndex = chunk.startSegmentIndex < preparedStartByAnalysisIndex.length ? preparedStartByAnalysisIndex[chunk.startSegmentIndex] : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0;
      const endSegmentIndex = chunk.endSegmentIndex < preparedStartByAnalysisIndex.length ? preparedStartByAnalysisIndex[chunk.endSegmentIndex] : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0;
      const consumedEndSegmentIndex = chunk.consumedEndSegmentIndex < preparedStartByAnalysisIndex.length ? preparedStartByAnalysisIndex[chunk.consumedEndSegmentIndex] : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0;
      preparedChunks.push({
        startSegmentIndex,
        endSegmentIndex,
        consumedEndSegmentIndex
      });
    }
    return preparedChunks;
  }
  function prepareInternal(text, font, includeSegments, options) {
    const analysis = analyzeText(text, getEngineProfile(), options?.whiteSpace);
    return measureAnalysis(analysis, font, includeSegments);
  }
  function prepare(text, font, options) {
    return prepareInternal(text, font, false, options);
  }
  function getInternalPrepared(prepared) {
    return prepared;
  }
  function layout(prepared, maxWidth, lineHeight) {
    const lineCount = countPreparedLines(getInternalPrepared(prepared), maxWidth);
    return { lineCount, height: lineCount * lineHeight };
  }

  // app/static/public/src/chat/pretext_layout.js
  var PretextLayoutEngine = class {
    constructor(options = {}) {
      this.defaultFont = String(options.defaultFont || "").trim();
      this.defaultWhiteSpace = String(options.defaultWhiteSpace || "pre-wrap");
      this.defaultLineHeight = Number(options.defaultLineHeight || 24);
      this.prepareFn = typeof options.prepareFn === "function" ? options.prepareFn : prepare;
      this.layoutFn = typeof options.layoutFn === "function" ? options.layoutFn : layout;
      this.cache = /* @__PURE__ */ new Map();
      this.currentKey = "";
      this.currentPrepared = null;
    }
    prepareTail(text, font = this.defaultFont, options = {}) {
      const normalizedText = String(text || "");
      const normalizedFont = String(font || this.defaultFont || "").trim();
      const normalizedOptions = {
        whiteSpace: options.whiteSpace || this.defaultWhiteSpace
      };
      const cacheKey = JSON.stringify([normalizedText, normalizedFont, normalizedOptions.whiteSpace]);
      this.currentKey = cacheKey;
      if (!this.cache.has(cacheKey)) {
        this.cache.set(cacheKey, this.prepareFn(normalizedText, normalizedFont, normalizedOptions));
      }
      this.currentPrepared = this.cache.get(cacheKey);
      return this.currentPrepared;
    }
    measure(width, lineHeight = this.defaultLineHeight) {
      if (!this.currentPrepared) {
        return { height: 0, lineCount: 0 };
      }
      const normalizedWidth = Number(width || 0);
      if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0) {
        return { height: 0, lineCount: 0 };
      }
      const normalizedLineHeight = Number(lineHeight || this.defaultLineHeight);
      return this.layoutFn(this.currentPrepared, normalizedWidth, normalizedLineHeight);
    }
    invalidateOnFontChange(font = "") {
      const normalizedFont = String(font || "").trim();
      if (!normalizedFont || normalizedFont === this.defaultFont) return false;
      this.defaultFont = normalizedFont;
      this.currentKey = "";
      this.currentPrepared = null;
      return true;
    }
  };

  // app/static/public/src/chat/stream_blocks.js
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function renderInlineMarkdown(value) {
    let output = escapeHtml(value);
    output = output.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
    output = output.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    return output;
  }
  function replaceMediaTokens(value, resolveRenderGroup) {
    if (typeof resolveRenderGroup !== "function") return value;
    return String(value || "").replace(
      /(?:@@GROK_MEDIA_CARD_[^@]+@@(?:\s|&nbsp;|\u00a0|\u2060)*)+/g,
      (match) => {
        const ids = Array.from(match.matchAll(/@@GROK_MEDIA_CARD_([^@]+)@@/g)).map((part) => String(part[1] || "").trim()).filter(Boolean);
        if (!ids.length) return "";
        return resolveRenderGroup(ids);
      }
    );
  }
  function replaceMarkdownImagesLite(value, renderImage) {
    const text = String(value || "");
    if (!text.includes("![") || typeof renderImage !== "function") return text;
    let result = "";
    let index = 0;
    while (index < text.length) {
      const start = text.indexOf("![", index);
      if (start === -1) {
        result += text.slice(index);
        break;
      }
      result += text.slice(index, start);
      const altEnd = text.indexOf("]", start + 2);
      if (altEnd === -1) {
        result += text.slice(start);
        break;
      }
      let cursor = altEnd + 1;
      while (cursor < text.length && text[cursor] !== "\n" && text[cursor] !== "(") {
        cursor += 1;
      }
      if (cursor >= text.length || text[cursor] !== "(") {
        result += text.slice(start, cursor);
        index = cursor;
        continue;
      }
      let depth = 0;
      let end = cursor;
      for (; end < text.length; end += 1) {
        const ch = text[end];
        if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (end >= text.length || text[end] !== ")") {
        result += text.slice(start);
        break;
      }
      const alt = text.slice(start + 2, altEnd);
      const url = text.slice(cursor + 1, end);
      result += renderImage({ alt, url, raw: text.slice(start, end + 1) });
      index = end + 1;
    }
    return result;
  }
  function parseThinkLiteSections(raw) {
    const source = String(raw || "");
    if (!source.includes("<think>")) {
      return [{ type: "text", value: source, open: false }];
    }
    const parts = [];
    let cursor = 0;
    while (cursor < source.length) {
      const start = source.indexOf("<think>", cursor);
      if (start === -1) {
        const textPart = source.slice(cursor);
        if (textPart) parts.push({ type: "text", value: textPart, open: false });
        break;
      }
      if (start > cursor) {
        parts.push({ type: "text", value: source.slice(cursor, start), open: false });
      }
      const thinkStart = start + "<think>".length;
      const end = source.indexOf("</think>", thinkStart);
      if (end === -1) {
        parts.push({ type: "think", value: source.slice(thinkStart), open: true });
        break;
      }
      parts.push({ type: "think", value: source.slice(thinkStart, end), open: true });
      cursor = end + "</think>".length;
    }
    return parts;
  }
  function parseRolloutBlocksLite(text, defaultId = "General") {
    const lines = String(text || "").split(/\r?\n/);
    const blocks = [];
    let current = null;
    for (const line of lines) {
      const matchDouble = line.match(/^\s*\[([^\]]+)\]\[([^\]]+)\]\s*(.*)$/);
      if (matchDouble) {
        if (current) blocks.push(current);
        current = { id: matchDouble[1], type: matchDouble[2], lines: [] };
        if (matchDouble[3]) current.lines.push(matchDouble[3]);
        continue;
      }
      const matchSingle = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
      if (matchSingle) {
        const maybeType = String(matchSingle[1] || "").trim();
        if (/^(WebSearch|SearchImage|AgentThink)$/i.test(maybeType)) {
          if (current) blocks.push(current);
          current = { id: defaultId || "General", type: maybeType, lines: [] };
          if (matchSingle[2]) current.lines.push(matchSingle[2]);
          continue;
        }
      }
      if (current && /^\s*\[[^\]]+\]\s*$/.test(line)) {
        continue;
      }
      if (current) {
        current.lines.push(line);
      }
    }
    if (current) blocks.push(current);
    return blocks;
  }
  function parseAgentSectionsLite(text) {
    const lines = String(text || "").split(/\r?\n/);
    const sections = [];
    let current = { title: null, lines: [] };
    let hasAgentHeading = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        current.lines.push(line);
        continue;
      }
      const agentMatch = trimmed.match(/^(Grok\s+Leader|(?:Grok\s+)?Agent\s*\d+)$/i);
      if (agentMatch) {
        hasAgentHeading = true;
        if (current.lines.length) {
          sections.push(current);
        }
        current = { title: agentMatch[1], lines: [] };
        continue;
      }
      current.lines.push(line);
    }
    if (current.lines.length) {
      sections.push(current);
    }
    if (!hasAgentHeading) {
      return [{ title: null, lines }];
    }
    return sections;
  }
  function splitBlocksIntoSyntheticAgentsLite(blocks) {
    const list = Array.isArray(blocks) ? blocks : [];
    if (!list.length) return [];
    const ids = Array.from(new Set(list.map((block) => String(block.id || "").trim()).filter(Boolean)));
    const nonGeneralIds = ids.filter((id) => !/^general$/i.test(id));
    if (nonGeneralIds.length <= 1) return [];
    const groups = [];
    const groupMap = /* @__PURE__ */ new Map();
    for (const block of list) {
      const key = String(block.id || "General");
      let group = groupMap.get(key);
      if (!group) {
        group = { key, blocks: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.blocks.push(block);
    }
    return groups.map((group, index) => ({
      title: index === 0 ? "Grok Leader" : `Agent ${index}`,
      blocks: group.blocks
    }));
  }
  function renderLiteLine(line) {
    const trimmed = line.trimEnd();
    if (!trimmed) return "";
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      return `<div class="stream-lite-heading stream-lite-heading-${level}">${renderInlineMarkdown(headingMatch[2])}</div>`;
    }
    const listMatch = trimmed.match(/^([*-]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      return `<div class="stream-lite-list"><span class="stream-lite-marker">${escapeHtml(listMatch[1])}</span><span>${renderInlineMarkdown(listMatch[2])}</span></div>`;
    }
    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      return `<div class="stream-lite-quote">${renderInlineMarkdown(quoteMatch[1])}</div>`;
    }
    return `<div class="stream-lite-line">${renderInlineMarkdown(trimmed)}</div>`;
  }
  function renderLiteBody(text, options = {}) {
    const source = String(text || "").replace(/\\n/g, "\n");
    if (!source.trim()) return "";
    const withSlots = replaceMediaTokens(source, options.resolveRenderGroup);
    const withImages = replaceMarkdownImagesLite(withSlots, options.renderMarkdownImage || (({ alt, url }) => {
      const safeUrl = escapeHtml(String(url || "").trim());
      const safeAlt = escapeHtml(String(alt || "image").trim() || "image");
      if (!safeUrl) return "";
      return `<figure class="message-image-card stream-lite-image-card"><img src="${safeUrl}" alt="${safeAlt}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous"></figure>`;
    }));
    const normalizedParagraphs = withImages.split(/\n{2,}/);
    return normalizedParagraphs.map((paragraph) => {
      if (/<div class="stream-media-slot"|<figure class="message-image-card/.test(paragraph.trim())) {
        return `<div class="stream-lite-paragraph">${paragraph.trim()}</div>`;
      }
      const lines = paragraph.split("\n").map((line) => renderLiteLine(line)).filter(Boolean);
      if (!lines.length) return "";
      return `<div class="stream-lite-paragraph">${lines.join("")}</div>`;
    }).filter(Boolean).join("");
  }
  function renderThinkItemRowsLite(blocks, options = {}) {
    return (Array.isArray(blocks) ? blocks : []).map((item) => {
      const typeText = escapeHtml(String(item && item.type || ""));
      const typeKey = String(item && item.type || "").trim().toLowerCase().replace(/\s+/g, "");
      const body = renderLiteBody((item && item.lines ? item.lines.join("\n") : "").trim(), options);
      return `<div class="think-item-row"><div class="think-item-type" data-type="${escapeHtml(typeKey)}">${typeText}</div><div class="think-item-body">${body || "<em>\uFF08\u7A7A\uFF09</em>"}</div></div>`;
    }).join("");
  }
  function renderThinkLiteContent(text, openAll, options = {}) {
    const sections = parseAgentSectionsLite(text);
    if (!sections.length) {
      return renderLiteBody(text, options);
    }
    const renderThinkAgentSummary = (title) => {
      const safeTitle = escapeHtml(String(title || ""));
      return `<summary><span class="think-agent-avatar" aria-hidden="true"></span><span class="think-agent-label">${safeTitle}</span></summary>`;
    };
    const renderGroups = (blocks) => {
      const groups = [];
      const groupMap = /* @__PURE__ */ new Map();
      for (const block of blocks) {
        const key = String(block.id || "General");
        let group = groupMap.get(key);
        if (!group) {
          group = { id: key, items: [] };
          groupMap.set(key, group);
          groups.push(group);
        }
        group.items.push(block);
      }
      return groups.map((group) => {
        const title = escapeHtml(group.id);
        const openAttr = openAll ? " open" : "";
        const items = renderThinkItemRowsLite(group.items, options);
        return `<details class="think-rollout-group"${openAttr}><summary><span class="think-rollout-title"><span class="think-rollout-avatar" aria-hidden="true"></span><span class="think-rollout-label">${title}</span></span></summary><div class="think-rollout-body">${items || "<em>\uFF08\u7A7A\uFF09</em>"}</div></details>`;
      }).join("");
    };
    const agentBlocks = sections.map((section, index) => {
      const blocks = parseRolloutBlocksLite(section.lines.join("\n"), section.title || "General");
      if (!section.title && blocks.length) {
        const syntheticAgents = splitBlocksIntoSyntheticAgentsLite(blocks);
        if (syntheticAgents.length) {
          return syntheticAgents.map((agent, agentIndex) => {
            const openAttr2 = openAll ? " open" : index === 0 && agentIndex === 0 ? " open" : "";
            const inner2 = renderThinkItemRowsLite(agent.blocks, options);
            return `<details class="think-agent"${openAttr2}>${renderThinkAgentSummary(agent.title)}<div class="think-agent-items">${inner2}</div></details>`;
          }).join("");
        }
      }
      const inner = blocks.length ? renderGroups(blocks) : `<div class="think-rollout-body">${renderLiteBody(section.lines.join("\n").trim(), options) || "<em>\uFF08\u7A7A\uFF09</em>"}</div>`;
      if (!section.title) {
        return `<div class="think-agent-items">${inner}</div>`;
      }
      const openAttr = openAll ? " open" : index === 0 ? " open" : "";
      return `<details class="think-agent"${openAttr}>${renderThinkAgentSummary(section.title)}<div class="think-agent-items">${inner}</div></details>`;
    });
    return `<div class="think-agents">${agentBlocks.join("")}</div>`;
  }
  function renderLiteMarkdown(text, options = {}) {
    const source = String(text || "").replace(/\\n/g, "\n");
    if (!source.trim()) return "";
    const parts = parseThinkLiteSections(source);
    return parts.map((part) => {
      if (part.type === "think") {
        const body = renderThinkLiteContent(part.value.trim(), part.open, options);
        const openAttr = part.open ? " open" : "";
        return `<details class="think-block" data-think="true"${openAttr}><summary class="think-summary">\u601D\u8003\u4E2D</summary><div class="think-content">${body || "<em>\uFF08\u7A7A\uFF09</em>"}</div></details>`;
      }
      return renderLiteBody(part.value, options);
    }).filter(Boolean).join("");
  }
  function splitStableAndTail(text) {
    const source = String(text || "").replace(/\\n/g, "\n");
    if (!source) {
      return {
        stableText: "",
        liveTailText: "",
        stableIndex: 0
      };
    }
    let inCodeFence = false;
    let thinkDepth = 0;
    let lastBoundary = 0;
    for (let index = 0; index < source.length; index += 1) {
      const slice = source.slice(index);
      const lineStart = index === 0 || source[index - 1] === "\n";
      if (lineStart && slice.startsWith("```")) {
        inCodeFence = !inCodeFence;
      }
      if (slice.startsWith("<think>")) {
        thinkDepth += 1;
      }
      if (slice.startsWith("</think>")) {
        thinkDepth = Math.max(0, thinkDepth - 1);
      }
      if (!inCodeFence && thinkDepth === 0 && slice.startsWith("\n\n")) {
        lastBoundary = index + 2;
      }
    }
    if (!inCodeFence && thinkDepth === 0 && source.endsWith("\n")) {
      const trailingBoundary = source.match(/\n{2,}$/);
      if (trailingBoundary) {
        lastBoundary = source.length;
      }
    }
    return {
      stableText: source.slice(0, lastBoundary),
      liveTailText: source.slice(lastBoundary),
      stableIndex: lastBoundary
    };
  }

  // app/static/public/src/chat/stream_renderer.js
  function syncMediaCardNode(node, item) {
    node.dataset.mediaKey = item.key;
    node.classList.remove("is-broken");
    node.querySelectorAll(".img-retry").forEach((retryNode) => retryNode.remove());
    let img = node.querySelector("img");
    if (!(img instanceof HTMLImageElement)) {
      img = document.createElement("img");
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.crossOrigin = "anonymous";
      node.insertBefore(img, node.firstChild);
    }
    if (img.getAttribute("src") !== item.src) {
      img.setAttribute("src", item.src);
    }
    img.dataset.originalSrc = item.src;
    img.setAttribute("alt", item.alt || "image");
    delete img.dataset.failed;
    delete img.dataset.fallbackTried;
    img.dataset.streamRetryCount = "0";
    img.classList.remove("hidden");
    const retryTimerId = Number(img.dataset.retryTimerId || 0);
    if (retryTimerId) {
      clearTimeout(retryTimerId);
      delete img.dataset.retryTimerId;
    }
    if (item.fallbackSrc) {
      img.dataset.fallbackSrc = item.fallbackSrc;
    } else {
      delete img.dataset.fallbackSrc;
    }
    let sourceNode = node.querySelector(".message-image-source");
    if (item.sourceHref) {
      if (!(sourceNode instanceof HTMLAnchorElement)) {
        sourceNode = document.createElement("a");
        sourceNode.className = "message-image-source";
        sourceNode.target = "_blank";
        sourceNode.rel = "noopener noreferrer";
        node.appendChild(sourceNode);
      }
      sourceNode.href = item.sourceHref;
      sourceNode.title = item.sourceHref;
      sourceNode.textContent = item.sourceLabel || item.sourceHref;
    } else if (sourceNode) {
      sourceNode.remove();
    }
    let captionNode = node.querySelector(".message-image-caption");
    if (item.caption) {
      if (!(captionNode instanceof HTMLElement)) {
        captionNode = document.createElement("figcaption");
        captionNode.className = "message-image-caption";
        node.appendChild(captionNode);
      }
      captionNode.textContent = item.caption;
    } else if (captionNode) {
      captionNode.remove();
    }
  }
  function createMediaCardNode(item) {
    const card = document.createElement("figure");
    card.className = "message-image-card";
    syncMediaCardNode(card, item);
    return card;
  }
  function syncOrderedChildren(parent, desiredNodes) {
    if (!parent) return;
    const desiredSet = new Set(desiredNodes);
    Array.from(parent.children).forEach((child) => {
      if (!desiredSet.has(child)) {
        child.remove();
      }
    });
    desiredNodes.forEach((node, index) => {
      const currentNode = parent.children[index];
      if (currentNode !== node) {
        parent.insertBefore(node, currentNode || null);
      }
    });
  }
  var StreamRenderer = class {
    constructor(options) {
      this.contentNode = options.contentNode;
      this.stableRoot = options.stableRoot;
      this.liveTailRoot = options.liveTailRoot;
      this.mediaRoot = options.mediaRoot;
      this.renderMarkdown = options.renderMarkdown;
      this.renderLiteMarkdown = options.renderLiteMarkdown;
      this.getWidth = typeof options.getWidth === "function" ? options.getWidth : () => this.liveTailRoot.clientWidth || this.contentNode.clientWidth || 0;
      this.getFont = typeof options.getFont === "function" ? options.getFont : () => "";
      this.getLineHeight = typeof options.getLineHeight === "function" ? options.getLineHeight : () => 24;
      this.layoutEngine = options.layoutEngine || new PretextLayoutEngine();
      this.mediaNodeCache = /* @__PURE__ */ new Map();
      this.state = {
        stableText: "",
        liveTailText: "",
        mediaItems: []
      };
    }
    pushDelta(payload) {
      return this.applyState(payload, false);
    }
    finalize(payload) {
      return this.applyState(payload, true);
    }
    restoreFromDraft(draftState, renderState = {}) {
      if (!draftState || typeof draftState !== "object") return this.applyState(renderState, false);
      return this.applyState({
        stableText: draftState.stableText || "",
        liveTailText: draftState.liveTailText || "",
        imageSourceMap: renderState.imageSourceMap || null,
        mediaItems: Array.isArray(draftState.mediaItems) ? draftState.mediaItems : renderState.mediaItems || []
      }, false);
    }
    resize() {
      return this.updateLiveTail(this.state.liveTailText, true);
    }
    getDraftState() {
      return {
        stableText: this.state.stableText,
        liveTailText: this.state.liveTailText,
        mediaItems: this.state.mediaItems
      };
    }
    applyState(payload, finalize = false) {
      const nextStableText = String(payload && payload.stableText || "");
      const nextLiveTailText = finalize ? "" : String(payload && payload.liveTailText || "");
      const nextMediaItems = Array.isArray(payload && payload.mediaItems) ? payload.mediaItems : [];
      const imageSourceMap = payload && payload.imageSourceMap ? payload.imageSourceMap : null;
      const stableChanged = nextStableText !== this.state.stableText || finalize;
      const liveChanged = nextLiveTailText !== this.state.liveTailText || finalize;
      const mediaChanged = JSON.stringify(nextMediaItems) !== JSON.stringify(this.state.mediaItems);
      let placedKeys = /* @__PURE__ */ new Set();
      if (stableChanged) {
        const stableHtml = nextStableText ? this.renderMarkdown(nextStableText, imageSourceMap) : "";
        this.stableRoot.innerHTML = this.injectMediaSlotMarkup(stableHtml, nextMediaItems);
      }
      if (stableChanged || mediaChanged) {
        placedKeys = this.patchRenderedInlineFigures(this.stableRoot, nextMediaItems, placedKeys);
        placedKeys = this.patchInlineSlots(this.stableRoot, nextMediaItems, placedKeys);
      }
      const tailHeightDelta = liveChanged ? this.updateLiveTail(nextLiveTailText, nextMediaItems, false) : 0;
      if (liveChanged || mediaChanged) {
        placedKeys = this.patchInlineSlots(this.liveTailRoot, nextMediaItems, placedKeys);
      }
      if (mediaChanged || stableChanged || liveChanged) {
        this.patchMedia(nextMediaItems, placedKeys);
      }
      this.state = {
        stableText: nextStableText,
        liveTailText: nextLiveTailText,
        mediaItems: nextMediaItems
      };
      return {
        stableChanged,
        liveChanged,
        mediaChanged,
        tailHeightDelta
      };
    }
    updateLiveTail(nextLiveTailText, mediaItems, forceMeasure) {
      const currentHeight = Number(this.liveTailRoot.dataset.predictedHeight || 0);
      if (!nextLiveTailText) {
        this.liveTailRoot.innerHTML = "";
        this.liveTailRoot.style.minHeight = "0px";
        this.liveTailRoot.dataset.predictedHeight = "0";
        return -currentHeight;
      }
      const font = this.getFont();
      this.layoutEngine.invalidateOnFontChange(font);
      this.layoutEngine.prepareTail(nextLiveTailText, font, { whiteSpace: "pre-wrap" });
      const lineHeight = this.getLineHeight();
      const width = this.getWidth();
      const measured = forceMeasure ? this.layoutEngine.measure(width, lineHeight) : this.layoutEngine.measure(width, lineHeight);
      const nextHeight = Number(measured && measured.height || 0);
      this.liveTailRoot.style.minHeight = nextHeight > 0 ? `${nextHeight}px` : "0px";
      this.liveTailRoot.dataset.predictedHeight = String(nextHeight || 0);
      const liteHtml = this.renderLiteMarkdown(nextLiveTailText, {
        resolveRenderGroup: (ids) => this.buildInlineSlotMarkup(ids, mediaItems)
      });
      this.liveTailRoot.innerHTML = liteHtml;
      return nextHeight - currentHeight;
    }
    buildInlineSlotMarkup(ids, items) {
      const rendered = [];
      ids.forEach((id) => {
        const item = items.find((candidate) => candidate && candidate.cardId && candidate.cardId === id);
        if (!item) return;
        rendered.push(`<div class="stream-media-slot" data-media-key="${item.key}"></div>`);
      });
      return rendered.join("");
    }
    injectMediaSlotMarkup(html, items) {
      if (!html || !Array.isArray(items) || !items.length) return html;
      return String(html).replace(
        /@@GROK_MEDIA_CARD_([^@]+)@@/g,
        (match, cardId) => {
          const item = items.find((candidate) => candidate && candidate.cardId && candidate.cardId === String(cardId));
          return item ? `<div class="stream-media-slot" data-media-key="${item.key}"></div>` : "";
        }
      );
    }
    getMediaNode(item) {
      const existing = this.mediaNodeCache.get(item.key);
      if (existing) {
        syncMediaCardNode(existing, item);
        return existing;
      }
      const created = createMediaCardNode(item);
      this.mediaNodeCache.set(item.key, created);
      return created;
    }
    patchInlineSlots(root, items, placedKeys = /* @__PURE__ */ new Set()) {
      if (!root || !root.querySelectorAll) return placedKeys;
      const slots = root.querySelectorAll(".stream-media-slot[data-media-key]");
      slots.forEach((slot) => {
        const key = String(slot.getAttribute("data-media-key") || "").trim();
        if (!key) return;
        const item = items.find((candidate) => candidate && candidate.key === key);
        if (!item) return;
        const node = this.getMediaNode(item);
        if (slot.firstElementChild !== node) {
          slot.replaceChildren(node);
        }
        placedKeys.add(key);
      });
      return placedKeys;
    }
    patchRenderedInlineFigures(root, items, placedKeys = /* @__PURE__ */ new Set()) {
      if (!root || !root.querySelectorAll) return placedKeys;
      const figures = root.querySelectorAll(".message-image-card");
      figures.forEach((figure) => {
        const img = figure.querySelector("img");
        const src = normalizeMediaUrl(img && (img.currentSrc || img.getAttribute("src") || ""));
        if (!src) return;
        const item = items.find((candidate) => candidate && candidate.src === src);
        if (!item || placedKeys.has(item.key)) return;
        const node = this.getMediaNode(item);
        figure.replaceWith(node);
        placedKeys.add(item.key);
      });
      return placedKeys;
    }
    patchMedia(items, placedKeys = /* @__PURE__ */ new Set()) {
      let grid = this.mediaRoot.querySelector(".img-grid");
      if (!grid) {
        grid = document.createElement("div");
        grid.className = "img-grid assistant-media-grid";
        this.mediaRoot.appendChild(grid);
      }
      const desiredNodes = [];
      let remainingCount = 0;
      items.forEach((item) => {
        if (placedKeys.has(item.key)) return;
        const node = this.getMediaNode(item);
        desiredNodes.push(node);
        remainingCount += 1;
      });
      syncOrderedChildren(grid, desiredNodes);
      this.mediaRoot.classList.toggle("hidden", remainingCount === 0);
    }
  };

  // app/static/public/js/chat.js
  (() => {
    const modelSelect = document.getElementById("modelSelect");
    const modelPicker = document.getElementById("modelPicker");
    const modelPickerBtn = document.getElementById("modelPickerBtn");
    const modelPickerLabel = document.getElementById("modelPickerLabel");
    const modelPickerMenu = document.getElementById("modelPickerMenu");
    const reasoningSelect = document.getElementById("reasoningSelect");
    const tempRange = document.getElementById("tempRange");
    const tempValue = document.getElementById("tempValue");
    const topPRange = document.getElementById("topPRange");
    const topPValue = document.getElementById("topPValue");
    const systemInput = document.getElementById("systemInput");
    const promptInput = document.getElementById("promptInput");
    const sendBtn = document.getElementById("sendBtn");
    const settingsToggle = document.getElementById("settingsToggle");
    const settingsPanel = document.getElementById("settingsPanel");
    const chatLog = document.getElementById("chatLog");
    const emptyState = document.getElementById("emptyState");
    const statusText = document.getElementById("statusText");
    const attachBtn = document.getElementById("attachBtn");
    const fileInput = document.getElementById("fileInput");
    const fileBadge = document.getElementById("fileBadge");
    const chatSidebar = document.getElementById("chatSidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const newChatBtn = document.getElementById("newChatBtn");
    const collapseSidebarBtn = document.getElementById("collapseSidebarBtn");
    const sidebarExpandBtn = document.getElementById("sidebarExpandBtn");
    const sessionListEl = document.getElementById("sessionList");
    let messageHistory = [];
    let isSending = false;
    let abortController = null;
    let attachments = [];
    let availableModels = [];
    let activeStreamInfo = null;
    let sessionsData = null;
    let followStreamScroll = true;
    let suppressScrollTracking = false;
    let userLockedStreamScroll = false;
    let pendingBottomScrollRaf = 0;
    let fixedViewportAnchor = null;
    const activeThinkSpinEntries = /* @__PURE__ */ new Set();
    const activeAssistantEntries = /* @__PURE__ */ new Set();
    let thinkSpinRafId = 0;
    const feedbackUrl = "https://github.com/chenyme/grok2api/issues/new";
    const STORAGE_KEY = "grok2api_chat_sessions";
    const SESSION_STORAGE_FALLBACK_KEY = "grok2api_chat_sessions_fallback";
    const SIDEBAR_STATE_KEY = "grok2api_chat_sidebar_collapsed";
    const MAX_CONTEXT_MESSAGES = 30;
    const MAX_PERSIST_SESSIONS = 12;
    const AUTO_SCROLL_THRESHOLD = 48;
    const STREAM_RENDER_INTERVAL_MS = 96;
    const STREAM_PERSIST_INTERVAL_MS = 320;
    const DEFAULT_SESSION_TITLES = ["\u65B0\u4F1A\u8BDD", "New Session"];
    const SEND_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><path d="M22 2L15 22L11 13L2 9L22 2Z"></path></svg>';
    const STOP_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect></svg>';
    let lastStorageErrorToastAt = 0;
    function generateId() {
      return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    function isDefaultTitleValue(title) {
      return DEFAULT_SESSION_TITLES.includes(title);
    }
    function getMessageDisplay(msg) {
      if (!msg) return "";
      if (typeof msg.content === "string") return msg.content;
      if (typeof msg.display === "string" && msg.display.trim()) return msg.display;
      if (Array.isArray(msg.content)) {
        const textParts = [];
        let fileCount = 0;
        for (const block of msg.content) {
          if (!block) continue;
          if (block.type === "text" && block.text) {
            textParts.push(block.text);
          }
          if (block.type === "file") {
            fileCount += 1;
          }
        }
        const suffix = fileCount > 0 ? `
[\u6587\u4EF6] ${fileCount} \u4E2A` : "";
        return `${textParts.join("\n")}${suffix}`.trim() || "\uFF08\u590D\u5408\u5185\u5BB9\uFF09";
      }
      return "\uFF08\u590D\u5408\u5185\u5BB9\uFF09";
    }
    function trimPersistText(value, maxLength = 8e4) {
      const text = String(value || "");
      if (text.length <= maxLength) return text;
      return text.slice(0, maxLength);
    }
    function sanitizePersistUrl(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (/^data:/i.test(raw)) return "";
      return trimPersistText(raw, 2048);
    }
    function sanitizePersistContent(content) {
      if (typeof content === "string") {
        return trimPersistText(content);
      }
      if (!Array.isArray(content)) return content;
      return content.map((block) => {
        if (!block || typeof block !== "object") return null;
        if (block.type === "text") {
          return { type: "text", text: trimPersistText(block.text || "", 24e3) };
        }
        if (block.type === "image_url") {
          const imageUrl = block.image_url && typeof block.image_url === "object" ? sanitizePersistUrl(block.image_url.url || "") : sanitizePersistUrl(block.url || "");
          return imageUrl ? {
            type: "image_url",
            image_url: { url: imageUrl },
            persistedPreview: true
          } : { type: "image_url", persistedPreview: false };
        }
        if (block.type === "file") {
          return {
            type: "file",
            name: trimPersistText(block.name || block.filename || "", 256),
            mime: trimPersistText(block.mime || "", 128),
            size: Number(block.size || 0) || 0,
            url: sanitizePersistUrl(block.url || "")
          };
        }
        return null;
      }).filter(Boolean);
    }
    function sanitizePersistSources(sources) {
      if (!sources || typeof sources !== "object") return null;
      try {
        return JSON.parse(JSON.stringify(sources, (key, value) => {
          if (typeof value === "string") {
            if (/^data:/i.test(value)) return "";
            return trimPersistText(value, 4e3);
          }
          return value;
        }));
      } catch (e) {
        return null;
      }
    }
    function sanitizePersistRendering(rendering) {
      if (!rendering || typeof rendering !== "object") return null;
      const sanitized = {};
      if (Array.isArray(rendering.extraImages)) {
        sanitized.extraImages = rendering.extraImages.map((item) => sanitizePersistUrl(item)).filter(Boolean).slice(0, 24);
      }
      const rawModelResponse = rendering.rawModelResponse && typeof rendering.rawModelResponse === "object" ? rendering.rawModelResponse : null;
      if (rawModelResponse) {
        sanitized.rawModelResponse = {
          message: trimPersistText(rawModelResponse.message || "", 12e4),
          cardAttachmentsJson: Array.isArray(rawModelResponse.cardAttachmentsJson) ? rawModelResponse.cardAttachmentsJson.filter((item) => typeof item === "string" && item.trim()).map((item) => trimPersistText(item, 12e3)).slice(0, 48) : []
        };
      }
      return Object.keys(sanitized).length ? sanitized : null;
    }
    function sanitizePersistDraftState(draftState) {
      if (!draftState || typeof draftState !== "object") return null;
      return {
        stableText: trimPersistText(draftState.stableText || "", 12e4),
        liveTailText: trimPersistText(draftState.liveTailText || "", 24e3),
        mediaItems: Array.isArray(draftState.mediaItems) ? draftState.mediaItems.slice(0, 24).map((item) => ({
          key: trimPersistText(item && item.key || "", 256),
          cardId: trimPersistText(item && item.cardId || "", 256),
          src: sanitizePersistUrl(item && item.src || ""),
          alt: trimPersistText(item && item.alt || "", 512),
          caption: trimPersistText(item && item.caption || "", 512),
          sourceHref: sanitizePersistUrl(item && item.sourceHref || ""),
          sourceLabel: trimPersistText(item && item.sourceLabel || "", 256),
          fallbackSrc: sanitizePersistUrl(item && item.fallbackSrc || "")
        })).filter((item) => item.src || item.cardId) : []
      };
    }
    function serializeMessage(msg) {
      if (!msg || typeof msg !== "object") return msg;
      const serialized = {
        ...msg,
        content: sanitizePersistContent(msg.content),
        sources: sanitizePersistSources(msg.sources),
        rendering: sanitizePersistRendering(msg.rendering),
        draftState: msg.committed ? null : sanitizePersistDraftState(msg.draftState)
      };
      return serialized;
    }
    function buildSessionSnapshot(limitSessions = MAX_PERSIST_SESSIONS, activeOnly = false) {
      if (!sessionsData) return null;
      const sourceSessions = Array.isArray(sessionsData.sessions) ? sessionsData.sessions.slice() : [];
      sourceSessions.sort((a, b) => Number(b && b.updatedAt || 0) - Number(a && a.updatedAt || 0));
      let picked = sourceSessions;
      if (activeOnly) {
        picked = sourceSessions.filter((session) => session && session.id === sessionsData.activeId);
      } else if (limitSessions > 0 && sourceSessions.length > limitSessions) {
        const activeId = sessionsData.activeId;
        const selected = sourceSessions.slice(0, limitSessions);
        if (activeId && !selected.some((session) => session && session.id === activeId)) {
          const activeSession = sourceSessions.find((session) => session && session.id === activeId);
          if (activeSession) {
            selected.pop();
            selected.push(activeSession);
          }
        }
        picked = selected;
      }
      return {
        activeId: sessionsData.activeId,
        sessions: picked.map((session) => ({
          ...session,
          messages: Array.isArray(session.messages) ? session.messages.map(serializeMessage) : []
        }))
      };
    }
    function notifyStorageFailure() {
      const now = Date.now();
      if (now - lastStorageErrorToastAt < 2500) return;
      lastStorageErrorToastAt = now;
      toast("\u4F1A\u8BDD\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u81EA\u52A8\u7CBE\u7B80\u672C\u5730\u7F13\u5B58", "error");
    }
    function saveFallbackSession(snapshot) {
      if (!snapshot) return false;
      try {
        sessionStorage.setItem(SESSION_STORAGE_FALLBACK_KEY, JSON.stringify(snapshot));
        return true;
      } catch (e) {
        return false;
      }
    }
    function clearFallbackSession() {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_FALLBACK_KEY);
      } catch (e) {
      }
    }
    function saveSessions() {
      if (!sessionsData) return;
      const attempts = [
        buildSessionSnapshot(MAX_PERSIST_SESSIONS, false),
        buildSessionSnapshot(6, false),
        buildSessionSnapshot(1, true)
      ].filter(Boolean);
      try {
        let saved = false;
        for (const snapshot of attempts) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
            clearFallbackSession();
            saved = true;
            break;
          } catch (e) {
          }
        }
        if (!saved) {
          const fallbackSnapshot = buildSessionSnapshot(1, true);
          if (!saveFallbackSession(fallbackSnapshot)) {
            notifyStorageFailure();
          }
        }
      } catch (e) {
        const fallbackSnapshot = buildSessionSnapshot(1, true);
        if (!saveFallbackSession(fallbackSnapshot)) {
          notifyStorageFailure();
        }
      }
    }
    function getActiveSession() {
      if (!sessionsData) return null;
      return sessionsData.sessions.find((s) => s.id === sessionsData.activeId) || null;
    }
    function trimMessageHistory(maxCount = MAX_CONTEXT_MESSAGES) {
      if (!maxCount || maxCount <= 0) return;
      if (messageHistory.length <= maxCount) return;
      messageHistory = messageHistory.slice(-maxCount);
      const session = getActiveSession();
      if (session) {
        session.messages = messageHistory.slice();
        session.updatedAt = Date.now();
        saveSessions();
        renderSessionList();
      }
    }
    function restoreActiveSession() {
      const session = getActiveSession();
      if (!session) return;
      messageHistory = Array.isArray(session.messages) ? session.messages.slice() : [];
      trimMessageHistory();
      if (chatLog) chatLog.innerHTML = "";
      if (!messageHistory.length) {
        showEmptyState();
        return;
      }
      hideEmptyState();
      for (const msg of messageHistory) {
        const text = getMessageDisplay(msg);
        const entry = createMessage(msg.role, text);
        if (entry && msg.role === "assistant") {
          entry.messageId = msg.id || entry.messageId;
          entry.sources = msg.sources || null;
          entry.rendering = msg.rendering || null;
          if (msg.committed === false) {
            updateMessage(entry, text, false);
          } else {
            updateMessage(entry, text, true);
          }
        } else if (entry && msg.role === "user") {
          let msgAttachments = [];
          if (Array.isArray(msg.content)) {
            msgAttachments = msg.content.filter((b) => b && (b.type === "image_url" || b.type === "file")).map((b) => {
              if (b.type === "image_url" && b.image_url && b.image_url.url) {
                return { mime: "image/jpeg", name: "image", data: b.image_url.url };
              }
              if (b.type === "image_url") {
                return {
                  mime: "image/jpeg",
                  name: "\u56FE\u7247\u9644\u4EF6",
                  placeholder: true,
                  placeholderLabel: "\u56FE\u7247\u9644\u4EF6\u672A\u7F13\u5B58"
                };
              }
              if (b.type === "file" && (b.data || b.url)) {
                return { mime: b.mime || "", name: b.name || "file", data: b.data || b.url };
              }
              if (b.type === "file") {
                return {
                  mime: b.mime || "",
                  name: b.name || "file",
                  placeholder: true,
                  placeholderLabel: "\u6587\u4EF6\u9644\u4EF6\u672A\u7F13\u5B58",
                  size: Number(b.size || 0) || 0
                };
              }
              return null;
            }).filter(Boolean);
          }
          renderUserMessage(entry, text, msgAttachments);
        }
      }
      if (activeStreamInfo && activeStreamInfo.sessionId === session.id && activeStreamInfo.entry.row) {
        chatLog.appendChild(activeStreamInfo.entry.row);
      }
      scrollToBottom();
    }
    function syncCurrentSession() {
      const session = getActiveSession();
      if (!session) return;
      session.messages = messageHistory.slice();
      session.updatedAt = Date.now();
    }
    function updateSessionTitle(session) {
      if (!session || session.isDefaultTitle === false) return;
      const firstUser = session.messages.find((m) => m.role === "user");
      if (!firstUser) return;
      const text = getMessageDisplay(firstUser);
      if (!text) return;
      const title = text.replace(/\n/g, " ").trim().slice(0, 20);
      if (title) {
        session.title = title;
        session.isDefaultTitle = false;
      }
    }
    function renameSession(id, newTitle) {
      if (!sessionsData) return;
      const session = sessionsData.sessions.find((s) => s.id === id);
      if (!session) return;
      const trimmed = (newTitle || "").trim();
      session.title = trimmed || "\u65B0\u4F1A\u8BDD";
      session.isDefaultTitle = !trimmed && isDefaultTitleValue(session.title);
      session.updatedAt = Date.now();
      saveSessions();
      renderSessionList();
    }
    function startRenameSession(sessionId, titleSpan) {
      if (!sessionsData) return;
      const session = sessionsData.sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "session-rename-input";
      input.value = session.title || "";
      input.maxLength = 40;
      titleSpan.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => renameSession(sessionId, input.value);
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
        if (e.key === "Escape") {
          input.value = session.title || "\u65B0\u4F1A\u8BDD";
          input.blur();
        }
      });
    }
    function syncSessionModel() {
      const session = getActiveSession();
      if (!session) return;
      session.model = modelSelect && modelSelect.value || "";
    }
    function restoreSessionModel() {
      const session = getActiveSession();
      if (!session || !session.model || !Array.isArray(availableModels)) return;
      if (availableModels.includes(session.model)) {
        setModelValue(session.model);
      }
    }
    function renderSessionList() {
      if (!sessionListEl || !sessionsData) return;
      sessionListEl.innerHTML = "";
      for (const session of sessionsData.sessions) {
        const item = document.createElement("div");
        item.className = `session-item${session.id === sessionsData.activeId ? " active" : ""}`;
        item.dataset.id = session.id;
        const titleSpan = document.createElement("span");
        titleSpan.className = "session-title";
        titleSpan.textContent = session.title || "\u65B0\u4F1A\u8BDD";
        titleSpan.title = titleSpan.textContent;
        titleSpan.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          startRenameSession(session.id, titleSpan);
        });
        item.appendChild(titleSpan);
        if (session.unread && session.id !== sessionsData.activeId) {
          const dot = document.createElement("span");
          dot.className = "session-unread";
          item.appendChild(dot);
        }
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "session-delete";
        delBtn.title = "\u5220\u9664";
        delBtn.textContent = "\xD7";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteSession(session.id);
        });
        item.appendChild(delBtn);
        item.addEventListener("click", () => switchSession(session.id));
        sessionListEl.appendChild(item);
      }
    }
    function createSession() {
      if (!sessionsData) return;
      const id = generateId();
      const session = {
        id,
        title: "\u65B0\u4F1A\u8BDD",
        isDefaultTitle: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      sessionsData.sessions.unshift(session);
      sessionsData.activeId = id;
      messageHistory = [];
      if (chatLog) chatLog.innerHTML = "";
      showEmptyState();
      saveSessions();
      renderSessionList();
      if (isMobileSidebar()) closeSidebar();
    }
    function collectChatUploadCacheNames(session) {
      const picked = /* @__PURE__ */ new Set();
      if (!session || !Array.isArray(session.messages)) return [];
      const tryCollectFromUrl = (value) => {
        const text = String(value || "").trim();
        if (!text) return;
        const matches = text.match(/chat-upload-[a-z0-9]+\.[a-z0-9]+/ig);
        if (matches) {
          matches.forEach((name) => picked.add(name));
        }
      };
      const collectFromBlocks = (content) => {
        if (typeof content === "string") {
          tryCollectFromUrl(content);
          return;
        }
        if (!Array.isArray(content)) return;
        content.forEach((block) => {
          if (!block || typeof block !== "object") return;
          if (block.cacheName) {
            tryCollectFromUrl(block.cacheName);
          }
          if (block.url) {
            tryCollectFromUrl(block.url);
          }
          if (block.data && typeof block.data === "string" && !String(block.data).startsWith("data:")) {
            tryCollectFromUrl(block.data);
          }
          if (block.type === "image_url") {
            const imageUrl = block.image_url && typeof block.image_url === "object" ? block.image_url.url : "";
            tryCollectFromUrl(imageUrl);
          }
          if (block.type === "file") {
            const fileData = block.file && typeof block.file === "object" ? block.file.file_data : "";
            tryCollectFromUrl(fileData);
          }
        });
      };
      session.messages.forEach((message) => {
        if (!message || typeof message !== "object") return;
        collectFromBlocks(message.content);
        if (Array.isArray(message.attachments)) {
          collectFromBlocks(message.attachments);
        }
      });
      return Array.from(picked);
    }
    async function deleteChatUploadCache(files) {
      const names = Array.isArray(files) ? Array.from(new Set(files.map((item) => String(item || "").trim()).filter((name) => /^chat-upload-/i.test(name)))) : [];
      if (!names.length) return;
      let headers = { "Content-Type": "application/json" };
      try {
        const authHeader = await ensurePublicKey();
        headers = {
          ...headers,
          ...buildAuthHeaders(authHeader)
        };
      } catch (e) {
      }
      const res = await fetch("/v1/public/chat/delete-upload-cache", {
        method: "POST",
        headers,
        body: JSON.stringify({ files: names })
      });
      if (!res.ok) {
        throw new Error("\u5220\u9664\u804A\u5929\u4E0A\u4F20\u7F13\u5B58\u5931\u8D25");
      }
    }
    async function deleteSession(id) {
      if (!sessionsData) return;
      const idx = sessionsData.sessions.findIndex((s) => s.id === id);
      if (idx === -1) return;
      const targetSession = sessionsData.sessions[idx];
      const cacheNames = collectChatUploadCacheNames(targetSession);
      try {
        await deleteChatUploadCache(cacheNames);
      } catch (e) {
        console.warn("deleteSession cache cleanup failed", e);
      }
      sessionsData.sessions.splice(idx, 1);
      if (!sessionsData.sessions.length) {
        createSession();
        return;
      }
      if (sessionsData.activeId === id) {
        const newIdx = Math.min(idx, sessionsData.sessions.length - 1);
        sessionsData.activeId = sessionsData.sessions[newIdx].id;
        restoreActiveSession();
        restoreSessionModel();
      }
      saveSessions();
      renderSessionList();
    }
    function switchSession(id) {
      if (!sessionsData || sessionsData.activeId === id) return;
      syncCurrentSession();
      syncSessionModel();
      sessionsData.activeId = id;
      const target = getActiveSession();
      if (target) target.unread = false;
      restoreActiveSession();
      restoreSessionModel();
      saveSessions();
      renderSessionList();
      if (isMobileSidebar()) closeSidebar();
    }
    function isMobileSidebar() {
      return window.matchMedia("(max-width: 1024px)").matches;
    }
    function setSidebarCollapsed(collapsed) {
      const layout2 = chatSidebar ? chatSidebar.closest(".chat-layout") : null;
      if (!layout2) return;
      layout2.classList.toggle("collapsed", collapsed);
      try {
        localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? "1" : "0");
      } catch (e) {
      }
    }
    function openSidebar() {
      if (isMobileSidebar()) {
        if (chatSidebar) chatSidebar.classList.add("open");
        if (sidebarOverlay) sidebarOverlay.classList.add("open");
        return;
      }
      setSidebarCollapsed(false);
    }
    function closeSidebar() {
      if (isMobileSidebar()) {
        if (chatSidebar) chatSidebar.classList.remove("open");
        if (sidebarOverlay) sidebarOverlay.classList.remove("open");
        return;
      }
      setSidebarCollapsed(true);
    }
    function toggleSidebar() {
      if (isMobileSidebar()) {
        if (chatSidebar && chatSidebar.classList.contains("open")) {
          closeSidebar();
        } else {
          openSidebar();
        }
        return;
      }
      const layout2 = chatSidebar ? chatSidebar.closest(".chat-layout") : null;
      if (!layout2) return;
      setSidebarCollapsed(!layout2.classList.contains("collapsed"));
    }
    function restoreSidebarState() {
      try {
        const raw = localStorage.getItem(SIDEBAR_STATE_KEY);
        setSidebarCollapsed(raw === "1");
      } catch (e) {
      }
    }
    function loadSessions() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          sessionsData = JSON.parse(raw);
          if (!sessionsData || !Array.isArray(sessionsData.sessions)) {
            sessionsData = null;
          }
        }
      } catch (e) {
        sessionsData = null;
      }
      if (!sessionsData) {
        try {
          const fallbackRaw = sessionStorage.getItem(SESSION_STORAGE_FALLBACK_KEY);
          if (fallbackRaw) {
            sessionsData = JSON.parse(fallbackRaw);
            if (!sessionsData || !Array.isArray(sessionsData.sessions)) {
              sessionsData = null;
            }
          }
        } catch (e) {
          sessionsData = null;
        }
      }
      if (!sessionsData || !sessionsData.sessions.length) {
        const id = generateId();
        sessionsData = {
          activeId: id,
          sessions: [{
            id,
            title: "\u65B0\u4F1A\u8BDD",
            isDefaultTitle: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
          }]
        };
        saveSessions();
      }
      sessionsData.sessions.forEach((session) => {
        if (session && typeof session.isDefaultTitle === "undefined") {
          session.isDefaultTitle = isDefaultTitleValue(session.title);
        }
        if (!Array.isArray(session.messages)) {
          session.messages = [];
        }
      });
      if (!sessionsData.activeId || !sessionsData.sessions.find((s) => s.id === sessionsData.activeId)) {
        sessionsData.activeId = sessionsData.sessions[0].id;
      }
      restoreActiveSession();
      restoreSessionModel();
      renderSessionList();
    }
    function toast(message, type) {
      if (typeof showToast === "function") {
        showToast(message, type);
      }
    }
    async function parseApiError(res) {
      let text = "";
      try {
        text = await res.text();
      } catch (e) {
        text = "";
      }
      let message = `\u8BF7\u6C42\u5931\u8D25: ${res.status}`;
      let code = "";
      let param = "";
      if (text) {
        try {
          const data = JSON.parse(text);
          const err2 = data && typeof data === "object" && data.error ? data.error : data;
          if (err2 && typeof err2 === "object") {
            message = String(err2.message || message);
            code = String(err2.code || "");
            param = String(err2.param || "");
          } else if (typeof data === "string" && data.trim()) {
            message = data.trim();
          }
        } catch (e) {
          const plain = text.trim();
          if (plain) message = plain;
        }
      }
      if (code === "content_moderated" || /content[- ]moderated/i.test(message)) {
        message = "\u56FE\u7247\u5185\u5BB9\u89E6\u53D1\u5BA1\u6838\u9650\u5236\uFF0C\u65E0\u6CD5\u4E0A\u4F20\u3002\u8BF7\u66F4\u6362\u56FE\u7247\u540E\u91CD\u8BD5\u3002";
      }
      const err = new Error(message);
      err.status = res.status;
      err.code = code;
      err.param = param;
      err.raw = text;
      return err;
    }
    function setStatus(state, text) {
      if (!statusText) return;
      statusText.textContent = text || "\u5C31\u7EEA";
      statusText.classList.remove("connected", "connecting", "error");
      if (state) statusText.classList.add(state);
    }
    function setSendingState(sending) {
      isSending = sending;
      if (!sendBtn) return;
      sendBtn.disabled = false;
      sendBtn.classList.toggle("is-abort", sending);
      sendBtn.setAttribute("aria-label", sending ? "Abort" : "Send");
      sendBtn.innerHTML = sending ? STOP_ICON : SEND_ICON;
    }
    function abortCurrentRequest() {
      if (!isSending || !abortController) return false;
      try {
        abortController.abort();
      } catch (e) {
      }
      setStatus("error", "\u5DF2\u4E2D\u6B62");
      return true;
    }
    function updateRangeValues() {
      if (tempValue && tempRange) {
        tempValue.textContent = Number(tempRange.value).toFixed(2);
      }
      if (topPValue && topPRange) {
        topPValue.textContent = Number(topPRange.value).toFixed(2);
      }
    }
    function getScrollContainer() {
      const body = document.scrollingElement || document.documentElement;
      if (!body) return null;
      const hasOwnScroll = chatLog && chatLog.scrollHeight > chatLog.clientHeight + 1;
      return hasOwnScroll ? chatLog : body;
    }
    function getScrollViewportTop(container) {
      if (!container) return 0;
      if (container === document.body || container === document.documentElement || container === document.scrollingElement) {
        return 0;
      }
      const rect = container.getBoundingClientRect();
      return rect.top;
    }
    function captureViewportAnchor(container = getScrollContainer()) {
      if (!container || !chatLog) return null;
      const viewportTop = getScrollViewportTop(container);
      const probeY = Math.max(1, Math.min(window.innerHeight - 1, viewportTop + 12));
      const probeX = Math.max(16, Math.min(window.innerWidth - 16, Math.floor(window.innerWidth * 0.35)));
      const candidates = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(probeX, probeY) : [];
      const anchorElement = candidates.find((node) => node instanceof HTMLElement && chatLog.contains(node) && node.closest(".message-row, .think-block, .think-agent, .think-rollout-group, .stream-lite-paragraph, p, h1, h2, h3, li, .message-image-card"));
      const resolvedAnchor = anchorElement ? anchorElement.closest(".think-block, .think-agent, .think-rollout-group, .stream-lite-paragraph, p, h1, h2, h3, li, .message-image-card, .message-row") : null;
      if (!(resolvedAnchor instanceof HTMLElement)) {
        return {
          container,
          scrollTop: container.scrollTop,
          anchorElement: null,
          offsetTop: 0
        };
      }
      return {
        container,
        scrollTop: container.scrollTop,
        anchorElement: resolvedAnchor,
        offsetTop: resolvedAnchor.getBoundingClientRect().top - viewportTop
      };
    }
    function restoreViewportAnchor(snapshot) {
      if (!snapshot || !snapshot.container) return;
      const { container, anchorElement, offsetTop, scrollTop } = snapshot;
      if (!(anchorElement instanceof HTMLElement) || !anchorElement.isConnected) {
        container.scrollTop = scrollTop;
        return;
      }
      const viewportTop = getScrollViewportTop(container);
      const currentTop = anchorElement.getBoundingClientRect().top - viewportTop;
      const delta = currentTop - offsetTop;
      if (Math.abs(delta) > 0.5) {
        container.scrollTop += delta;
      }
    }
    function refreshFixedViewportAnchor(container = getScrollContainer()) {
      if (!userLockedStreamScroll || !isSending) {
        fixedViewportAnchor = null;
        return null;
      }
      fixedViewportAnchor = captureViewportAnchor(container);
      return fixedViewportAnchor;
    }
    function isNearScrollBottom() {
      const container = getScrollContainer();
      if (!container) return true;
      const remaining = container.scrollHeight - (container.scrollTop + container.clientHeight);
      return remaining <= AUTO_SCROLL_THRESHOLD;
    }
    function updateFollowStreamScroll() {
      if (userLockedStreamScroll) {
        followStreamScroll = false;
        return;
      }
      followStreamScroll = isNearScrollBottom();
      if (followStreamScroll) {
        fixedViewportAnchor = null;
      }
    }
    function lockStreamScrollFollow() {
      if (!isSending) return;
      userLockedStreamScroll = true;
      followStreamScroll = false;
      refreshFixedViewportAnchor();
    }
    function scrollToBottom(force = false) {
      const container = getScrollContainer();
      if (!container) return;
      if (!force && !followStreamScroll) return;
      if (pendingBottomScrollRaf) {
        cancelAnimationFrame(pendingBottomScrollRaf);
        pendingBottomScrollRaf = 0;
      }
      pendingBottomScrollRaf = requestAnimationFrame(() => {
        pendingBottomScrollRaf = 0;
        suppressScrollTracking = true;
        const targetTop = Math.max(0, container.scrollHeight - container.clientHeight);
        container.scrollTop = targetTop;
        requestAnimationFrame(() => {
          suppressScrollTracking = false;
          fixedViewportAnchor = null;
          updateFollowStreamScroll();
        });
      });
    }
    function hideEmptyState() {
      if (emptyState) emptyState.classList.add("hidden");
    }
    function showEmptyState() {
      if (emptyState) emptyState.classList.remove("hidden");
    }
    function escapeHtml2(value) {
      return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function closeChatImagePreview() {
      const overlay = document.getElementById("chatImagePreviewOverlay");
      if (!overlay) return;
      overlay.remove();
    }
    function openChatImagePreview(src, name) {
      if (!src) return;
      const opened = document.getElementById("chatImagePreviewOverlay");
      if (opened && opened.dataset.src === src) {
        closeChatImagePreview();
        return;
      }
      closeChatImagePreview();
      const overlay = document.createElement("div");
      overlay.id = "chatImagePreviewOverlay";
      overlay.className = "chat-image-preview-overlay";
      overlay.dataset.src = src;
      const img = document.createElement("img");
      img.className = "chat-image-preview-image";
      img.src = src;
      img.alt = name || "image";
      img.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      overlay.appendChild(img);
      overlay.addEventListener("click", () => closeChatImagePreview());
      document.body.appendChild(overlay);
    }
    function bindMessageImagePreview(root) {
      if (!root || !root.querySelectorAll) return;
      const userImageButtons = root.querySelectorAll(".user-image-btn");
      userImageButtons.forEach((btn) => {
        if (btn.dataset.previewBound === "1") return;
        btn.dataset.previewBound = "1";
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const src = btn.dataset.previewSrc || "";
          const name = btn.dataset.previewName || "image";
          openChatImagePreview(src, name);
        });
      });
      const images = root.querySelectorAll("img");
      images.forEach((img) => {
        if (img.dataset.previewBound === "1") return;
        img.dataset.previewBound = "1";
        img.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const src = img.getAttribute("src") || "";
          const name = img.getAttribute("alt") || "image";
          if (!src) return;
          openChatImagePreview(src, name);
        });
      });
    }
    function getInlineCitationLabel(link) {
      if (!link || typeof link !== "object") return "";
      const hostname = normalizeSourceText2(link.hostname || getSourceHostname2(link.href || ""));
      if (hostname) return hostname;
      const label = normalizeSourceText2(link.label || "");
      if (label) return label;
      return normalizeSourceText2(link.href || "");
    }
    function buildInlineCitationChip(links) {
      const items = Array.isArray(links) ? links.filter(Boolean) : [];
      if (!items.length) return "";
      const first = items[0];
      const href = escapeHtml2(String(first.href || "").trim());
      const label = escapeHtml2(getInlineCitationLabel(first));
      if (!href || !label) return "";
      const extraCount = items.length - 1;
      const titles = items.map((item) => normalizeSourceText2(item.label || item.hostname || item.href || "")).filter(Boolean);
      const titleAttr = titles.length ? ` title="${escapeHtml2(titles.join("\n"))}"` : "";
      if (extraCount <= 0) {
        return `<span class="inline print-hidden"><span class="inline"><a href="${href}" target="_blank" rel="noopener noreferrer nofollow" class="citation inline-citation-chip no-copy inline text-nowrap print-hidden"${titleAttr} data-state="closed"><span class="inline-citation-chip__label">${label}</span></a></span></span>`;
      }
      const payload = escapeHtml2(encodeURIComponent(JSON.stringify(items.map((item) => ({
        href: String(item && item.href || "").trim(),
        hostname: normalizeSourceText2(item && item.hostname || ""),
        label: normalizeSourceText2(item && item.label || "")
      })))));
      return `<span class="inline print-hidden"><span class="inline"><a href="${href}" target="_blank" rel="noopener noreferrer nofollow" class="citation inline-citation-chip inline-citation-cluster no-copy inline text-nowrap print-hidden" data-state="closed" data-citation-links="${payload}"${titleAttr}><span class="inline-citation-chip__label">${label}</span><span class="inline-citation-chip__count">+${extraCount}</span></a></span></span>`;
    }
    function expandInlineCitationCluster(cluster) {
      if (!(cluster instanceof HTMLElement)) return;
      if (cluster.dataset.expanded === "1") return;
      const raw = cluster.dataset.citationLinks || "";
      if (!raw) return;
      try {
        const links = JSON.parse(decodeURIComponent(raw));
        if (!Array.isArray(links) || !links.length) return;
        const expanded = links.map((item) => buildInlineCitationChip([item])).filter(Boolean).join("");
        if (!expanded) return;
        const wrapper = document.createElement("span");
        wrapper.className = "inline print-hidden inline-citation-cluster-expanded";
        wrapper.innerHTML = expanded;
        cluster.replaceWith(wrapper);
      } catch (e) {
      }
    }
    function parseRenderingCards2(rendering) {
      const rawModelResponse = rendering && rendering.rawModelResponse && typeof rendering.rawModelResponse === "object" ? rendering.rawModelResponse : null;
      const rawCards = Array.isArray(rawModelResponse && rawModelResponse.cardAttachmentsJson) ? rawModelResponse.cardAttachmentsJson : [];
      const cardMap = /* @__PURE__ */ new Map();
      rawCards.forEach((raw) => {
        if (typeof raw !== "string" || !raw.trim()) return;
        try {
          const card = JSON.parse(raw);
          if (!card || typeof card !== "object" || !card.id) return;
          cardMap.set(String(card.id), card);
        } catch (e) {
        }
      });
      return cardMap;
    }
    function buildRenderedImageMarkdown(card) {
      let image = card && card.image && typeof card.image === "object" ? card.image : null;
      let original = image ? String(image.original || image.link || "").trim() : "";
      let title = image ? normalizeSourceText2(image.title || "") : "";
      if (!original && card && card.image_chunk) {
        original = String(card.image_chunk.imageUrl || "").trim();
        if (!title && card.image_chunk.imageTitle) {
          title = normalizeSourceText2(card.image_chunk.imageTitle || "");
        }
      }
      if (original && !original.startsWith("http")) {
        let basePath = original.startsWith("/") ? original : "/" + original;
        original = "/v1/files/image" + basePath;
      }
      if (!original) return "";
      return `
![${title || "image"}](${original})
`;
    }
    function buildRenderedImageSourceMap(rendering) {
      const cardMap = parseRenderingCards2(rendering);
      const sourceMap = /* @__PURE__ */ new Map();
      cardMap.forEach((card) => {
        if (!card || typeof card !== "object") return;
        const image = card.image && typeof card.image === "object" ? card.image : null;
        const articleUrl = image ? String(image.link || "").trim() : "";
        const originalUrl = image ? String(image.original || "").trim() : "";
        const thumbnailUrl = image ? String(image.thumbnail || "").trim() : "";
        const resolvedUrl = articleUrl || originalUrl;
        if (!resolvedUrl) return;
        const sourceInfo = {
          href: resolvedUrl,
          label: getSourceHostname2(resolvedUrl),
          fallbackImage: thumbnailUrl
        };
        [
          originalUrl,
          normalizeRenderedImageUrl(originalUrl),
          articleUrl
        ].filter(Boolean).forEach((candidate) => {
          sourceMap.set(String(candidate), sourceInfo);
        });
      });
      return sourceMap;
    }
    function normalizeRenderedImageUrl(url) {
      const raw = String(url || "").trim();
      if (!raw) return "";
      if (raw.startsWith("data:")) {
        return raw;
      }
      if (/^(?:https?:)?\/\//i.test(raw)) {
        try {
          const parsed = new URL(raw, window.location.origin);
          const host = String(parsed.hostname || "").toLowerCase();
          const path = String(parsed.pathname || "").trim();
          const marker = "/v1/files/image/";
          if (path.includes(marker)) {
            return path.slice(path.indexOf(marker));
          }
          if (host === "localhost" || host === "127.0.0.1") {
            return path || "";
          }
          if (host === "assets.grok.com" && path) {
            return `/v1/files/image${path.startsWith("/") ? path : `/${path}`}`;
          }
          return "";
        } catch (e) {
          return "";
        }
      }
      const basePath = raw.startsWith("/") ? raw : `/${raw}`;
      return basePath.startsWith("/v1/files/image/") ? basePath : `/v1/files/image${basePath}`;
    }
    function collectRenderedImageUrlsFromCard(card) {
      const urls = [];
      if (!card || typeof card !== "object") return urls;
      if (card.image && typeof card.image === "object") {
        urls.push(card.image.original, card.image.link);
      }
      if (card.image_chunk && typeof card.image_chunk === "object") {
        urls.push(card.image_chunk.imageUrl);
      }
      return urls.map((item) => normalizeRenderedImageUrl(item)).filter(Boolean);
    }
    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("\u8BFB\u53D6\u56FE\u7247\u5931\u8D25"));
        reader.readAsDataURL(blob);
      });
    }
    function inferImageExtension(mime, fallbackUrl) {
      const normalizedMime = String(mime || "").trim().toLowerCase();
      if (normalizedMime === "image/jpeg") return "jpg";
      if (normalizedMime === "image/png") return "png";
      if (normalizedMime === "image/webp") return "webp";
      if (normalizedMime === "image/gif") return "gif";
      if (normalizedMime === "image/svg+xml") return "svg";
      const match = String(fallbackUrl || "").match(/\.([a-z0-9]+)(?:[\?#]|$)/i);
      return match ? String(match[1]).toLowerCase() : "png";
    }
    async function buildAssistantImageAttachment(url, index) {
      const normalizedUrl = normalizeRenderedImageUrl(url);
      if (!normalizedUrl) return null;
      try {
        const res = await fetch(normalizedUrl);
        if (!res.ok) {
          throw new Error(`\u4E0B\u8F7D\u56FE\u7247\u5931\u8D25: ${res.status}`);
        }
        const blob = await res.blob();
        const data = await blobToDataUrl(blob);
        const mime = String(blob.type || "").trim() || "image/png";
        const ext = inferImageExtension(mime, normalizedUrl);
        return {
          mime,
          name: `grok-image-${index + 1}.${ext}`,
          data,
          source: "assistant"
        };
      } catch (e) {
        console.warn("\u81EA\u52A8\u9644\u52A0 assistant \u56FE\u7247\u5931\u8D25", normalizedUrl, e);
        return null;
      }
    }
    function collectAssistantImageUrls(entry) {
      const urls = [];
      const seen = /* @__PURE__ */ new Set();
      const pushUrl = (value) => {
        const normalized = normalizeRenderedImageUrl(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        urls.push(normalized);
      };
      if (entry && entry.contentNode && entry.contentNode.querySelectorAll) {
        const images = entry.contentNode.querySelectorAll(".message-image-card img, .img-grid img");
        images.forEach((img) => {
          pushUrl(img.currentSrc || img.getAttribute("src") || "");
        });
      }
      if (!urls.length && entry && entry.rendering) {
        const cardMap = parseRenderingCards2(entry.rendering);
        cardMap.forEach((card) => {
          const cType = String(card && card.type || "");
          const cardType = String(card && card.cardType || "");
          if (cType === "render_searched_image" || cType === "render_edited_image" || cType === "render_generated_image" || cardType === "generated_image_card") {
            collectRenderedImageUrlsFromCard(card).forEach(pushUrl);
          }
        });
        const extraImages = Array.isArray(entry.rendering.extraImages) ? entry.rendering.extraImages : [];
        extraImages.forEach(pushUrl);
      }
      return urls;
    }
    async function quoteAssistantImages(entry) {
      if (!entry || entry.role !== "assistant") {
        toast("\u5F53\u524D\u6D88\u606F\u4E0D\u53EF\u5F15\u7528", "error");
        return;
      }
      const urls = collectAssistantImageUrls(entry);
      if (!urls.length) {
        toast("\u5F53\u524D\u56DE\u7B54\u6CA1\u6709\u53EF\u5F15\u7528\u7684\u56FE\u7247", "error");
        return;
      }
      const results = await Promise.all(urls.map((url, index) => buildAssistantImageAttachment(url, index)));
      const imageAttachments = results.filter(Boolean);
      if (!imageAttachments.length) {
        toast("\u5F15\u7528\u56FE\u7247\u5931\u8D25", "error");
        return;
      }
      imageAttachments.forEach((item) => {
        attachments.push({
          ...item,
          name: buildUniqueFileName(item.name || "image")
        });
      });
      showAttachmentBadge();
      if (promptInput) {
        promptInput.focus();
      }
      toast(`\u5DF2\u5F15\u7528 ${imageAttachments.length} \u5F20\u56FE\u7247`, "success");
    }
    function normalizeRenderedMarkdownLayout(text) {
      let output = String(text || "");
      output = output.replace(/<\/?grok:render\b[^>]*>/gi, "");
      output = output.replace(/<\/?argument\b[^>]*>/gi, "");
      output = output.replace(/\bcard_id="[^"]*"/gi, "");
      output = output.replace(/\bcard_type="[^"]*"/gi, "");
      output = output.replace(/\btype="render_inline_citation"/gi, "");
      output = output.replace(/\bname="citation_id"/gi, "");
      output = output.replace(/\bcitation_card['"]?/gi, "");
      output = output.replace(/([^\n])\s*(#{2,6}\s+)/g, "$1\n\n$2");
      output = output.replace(/(<\/span><\/span>)\s*(#{2,6}\s+)/g, "$1\n\n$2");
      output = output.replace(/(<\/span><\/span>)\s*(\d+\.\s+)/g, "$1\n\n$2");
      output = output.replace(/(<\/span><\/span>)\s*([*-]\s+)/g, "$1\n\n$2");
      output = output.replace(/(<\/span><\/span>)\s*(\*\*[^*]+\*\*:)/g, "$1\n\n$2");
      output = output.replace(/([。！？；])\s*(\d+\.\s+)/g, "$1\n\n$2");
      output = output.replace(/([。！？；])\s*([*-]\s+)/g, "$1\n\n$2");
      output = output.replace(/([^\n])\s*(?:[-*•]\s+\*\*[^*]+\*\*:)/g, (match, prefix) => `${prefix}

${match.slice(prefix.length).trimStart()}`);
      output = output.replace(/\n{3,}/g, "\n\n");
      return output;
    }
    function preserveRenderBoundary(match, replacement) {
      const trailingWhitespaceMatch = String(match || "").match(/((?:\s|&nbsp;|\u00a0|\u2060)*)$/);
      const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[1] : "";
      const normalizedTrailing = trailingWhitespace.replace(/&nbsp;|\u00a0|\u2060/g, " ").replace(/[ \t]+\n/g, "\n");
      if (!normalizedTrailing) return replacement;
      if (normalizedTrailing.includes("\n\n")) return `${replacement}

`;
      if (normalizedTrailing.includes("\n")) return `${replacement}
`;
      return `${replacement} `;
    }
    function renderExactGrokCards(rawMessage, rendering, options = {}) {
      const message = String(rawMessage || "");
      if (!rendering || typeof rendering !== "object") return message;
      const includeImages = options.includeImages !== false;
      const preserveImageMarkers = options.preserveImageMarkers === true;
      const cardMap = parseRenderingCards2(rendering);
      const extraImages = Array.isArray(rendering.extraImages) ? rendering.extraImages : [];
      if (!cardMap.size && !extraImages.length) return message;
      let rendered = message.replace(
        /(?:<grok:render\b[^>]*card_id="[^"]+"[^>]*>[\s\S]*?<\/grok:render>(?:\s|&nbsp;|\u00a0|\u2060)*)+/g,
        (match) => {
          const ids = Array.from(match.matchAll(/card_id="([^"]+)"/g)).map((part) => String(part[1] || "").trim()).filter(Boolean);
          if (!ids.length) return "";
          const output = [];
          let pendingCitations = [];
          const flushCitations = () => {
            if (!pendingCitations.length) return;
            output.push(buildInlineCitationChip(pendingCitations));
            pendingCitations = [];
          };
          ids.forEach((id) => {
            const card = cardMap.get(id);
            if (!card) return;
            if (String(card.type || "") === "render_inline_citation" && card.url) {
              pendingCitations.push({
                href: String(card.url).trim(),
                hostname: getSourceHostname2(card.url),
                label: normalizeSourceText2(card.title || "") || getSourceHostname2(card.url) || String(card.url).trim()
              });
              return;
            }
            flushCitations();
            const cType = String(card.type || "");
            const cardType = String(card.cardType || "");
            if (includeImages && (cType === "render_searched_image" || cType === "render_edited_image" || cType === "render_generated_image" || cardType === "generated_image_card")) {
              output.push(buildRenderedImageMarkdown(card));
            } else if (preserveImageMarkers && (cType === "render_searched_image" || cType === "render_edited_image" || cType === "render_generated_image" || cardType === "generated_image_card")) {
              output.push(`
@@GROK_MEDIA_CARD_${id}@@
`);
            }
          });
          flushCitations();
          return preserveRenderBoundary(match, output.join(""));
        }
      );
      if (includeImages && extraImages.length) {
        const appended = extraImages.map((url) => String(url || "").trim()).filter(Boolean).map((url) => `
![image](${url})
`).join("");
        if (appended) rendered += appended;
      }
      return normalizeRenderedMarkdownLayout(rendered);
    }
    function extractThinkMarkup(raw) {
      const source = String(raw || "");
      if (!source.includes("<think>")) return "";
      const matches = source.match(/<think>[\s\S]*?<\/think>|<think>[\s\S]*$/g) || [];
      return matches.join("\n");
    }
    function stripThinkMarkup(raw) {
      const source = String(raw || "");
      if (!source.includes("<think>")) return source;
      return source.replace(/<think>[\s\S]*?<\/think>|<think>[\s\S]*$/g, "").trim();
    }
    function getRenderableAssistantText(entry, options = {}) {
      if (!entry || entry.role !== "assistant") {
        return entry && entry.raw ? entry.raw : "";
      }
      const rendering = entry.rendering && typeof entry.rendering === "object" ? entry.rendering : null;
      const rawModelResponse = rendering && rendering.rawModelResponse && typeof rendering.rawModelResponse === "object" ? rendering.rawModelResponse : null;
      const rawMessageSource = rawModelResponse && typeof rawModelResponse.message === "string" ? rawModelResponse.message : entry.raw || "";
      const thinkMarkup = extractThinkMarkup(rawMessageSource) || extractThinkMarkup(entry.raw || "");
      const rawMessage = stripThinkMarkup(rawMessageSource);
      const renderedAnswer = renderExactGrokCards(rawMessage, rendering, options);
      if (!thinkMarkup) return renderedAnswer;
      return `${thinkMarkup}

${renderedAnswer}`.trim();
    }
    function renderInlineCitationTokens(value, htmlLinks) {
      return value.replace(/(?:@@HTMLLINK_\d+@@(?:\s|&nbsp;|\u00a0|\u2060)*)+/g, (match) => {
        const indices = Array.from(match.matchAll(/@@HTMLLINK_(\d+)@@/g)).map((part) => Number(part[1])).filter((index) => Number.isFinite(index));
        const links = [];
        const seen = /* @__PURE__ */ new Set();
        indices.forEach((index) => {
          const item = htmlLinks[index];
          const href = String(item && item.href || "").trim();
          if (!href || seen.has(href)) return;
          seen.add(href);
          links.push(item);
        });
        if (!links.length) return "";
        if (links.every((item) => typeof item.html === "string" && item.html.trim())) {
          return links.map((item) => item.html).join("");
        }
        return buildInlineCitationChip(links);
      });
    }
    function renderBasicMarkdown(rawText, imageSourceMap = null) {
      const text = (rawText || "").replace(/\\n/g, "\n");
      const htmlLinks = [];
      const linkExtractedText = text.replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (match, quote, href, inner) => {
        const label = String(inner || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").replace(/\u2060/g, "").trim();
        const token = `@@HTMLLINK_${htmlLinks.length}@@`;
        htmlLinks.push({
          href: String(href || "").trim(),
          label,
          hostname: getSourceHostname2(href),
          html: match
        });
        return token;
      });
      const normalizedText = linkExtractedText.replace(/<\/?span\b[^>]*>/gi, "");
      const escaped = escapeHtml2(normalizedText);
      const codeBlocks = [];
      const fenced = escaped.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const safeLang = lang ? escapeHtml2(lang) : "";
        const encoded = encodeURIComponent(code);
        const html = `<div class="code-block-wrap"><button type="button" class="code-copy-btn" data-copy-code="${encoded}">\u590D\u5236</button><pre class="code-block"><code${safeLang ? ` class="language-${safeLang}"` : ""}>${code}</code></pre></div>`;
        const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
        codeBlocks.push(html);
        return token;
      });
      const renderInline = (value) => {
        let output2 = value.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
        output2 = replaceMarkdownImages(output2, ({ alt, middle, url, raw }) => {
          const normalizedAlt = decodeHtmlEntities(alt || "");
          const normalizedMiddle = decodeHtmlEntities(middle || "");
          const normalizedUrl = decodeHtmlEntities(url || "").trim();
          if (!/^https?:\/\//i.test(normalizedUrl) && !normalizedUrl.startsWith("data:")) {
            return raw;
          }
          const mergedAlt = [String(normalizedAlt || "").trim(), String(normalizedMiddle || "").trim()].filter(Boolean).join(" ").trim();
          const safeAlt = escapeHtml2(mergedAlt || normalizedAlt || "image");
          const safeUrl = escapeHtml2(normalizedUrl);
          const sourceInfo = imageSourceMap instanceof Map ? imageSourceMap.get(normalizedUrl) || imageSourceMap.get(normalizeRenderedImageUrl(normalizedUrl)) || null : null;
          const sourceHref = escapeHtml2(sourceInfo && sourceInfo.href ? sourceInfo.href : normalizedUrl);
          const fallbackSrc = escapeHtml2(sourceInfo && sourceInfo.fallbackImage ? sourceInfo.fallbackImage : "");
          const sourceLabel = escapeHtml2(
            sourceInfo && sourceInfo.label ? sourceInfo.label : getImageSourceLabel(normalizedUrl)
          );
          const caption = mergedAlt && mergedAlt !== "image" ? `<figcaption class="message-image-caption">${escapeHtml2(mergedAlt)}</figcaption>` : "";
          const sourceBadge = sourceLabel ? `<a class="message-image-source" href="${sourceHref}" target="_blank" rel="noopener noreferrer" title="${sourceHref}">${sourceLabel}</a>` : "";
          const fallbackAttr = fallbackSrc ? ` data-fallback-src="${fallbackSrc}"` : "";
          return `<figure class="message-image-card"><img src="${safeUrl}" alt="${safeAlt}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous"${fallbackAttr}>${sourceBadge}${caption}</figure>`;
        });
        output2 = output2.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
          const safeLabel = escapeHtml2(decodeHtmlEntities(label || ""));
          const safeUrl = escapeHtml2(decodeHtmlEntities(url || ""));
          return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeLabel}</a>`;
        });
        output2 = renderInlineCitationTokens(output2, htmlLinks);
        output2 = linkifyPlainTextSegments(output2);
        return output2;
      };
      const linkifyPlainTextSegments = (html) => {
        const segments = String(html || "").split(/(<[^>]+>)/g);
        return segments.map((segment) => {
          if (!segment || segment.startsWith("<")) return segment;
          return segment.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'*+,;=%]+/gi, (rawUrl) => {
            let url = rawUrl;
            let trailing = "";
            while (/[),.;!?，。；：！？）\]]$/.test(url)) {
              trailing = url.slice(-1) + trailing;
              url = url.slice(0, -1);
            }
            if (!url) return rawUrl;
            const safeUrl = escapeHtml2(url);
            return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a>${escapeHtml2(trailing)}`;
          });
        }).join("");
      };
      const lines = fenced.split(/\r?\n/);
      const htmlParts = [];
      let inUl = false;
      let inOl = false;
      let inTable = false;
      let paragraphLines = [];
      const isStandaloneMediaLine = (line) => {
        const trimmed = String(line || "").trim();
        if (!trimmed) return false;
        if (/^\[[^\]]+\]\((https?:\/\/.+)\)$/.test(trimmed)) {
          return true;
        }
        if (!trimmed.startsWith("![")) {
          return false;
        }
        const replaced = replaceMarkdownImages(trimmed, () => "@@IMG@@");
        return String(replaced || "").trim() === "@@IMG@@";
      };
      const closeLists = () => {
        if (inUl) {
          htmlParts.push("</ul>");
          inUl = false;
        }
        if (inOl) {
          htmlParts.push("</ol>");
          inOl = false;
        }
      };
      const closeTable = () => {
        if (inTable) {
          htmlParts.push("</tbody></table>");
          inTable = false;
        }
      };
      const flushParagraph = () => {
        if (!paragraphLines.length) return;
        let textChunk = [];
        let mediaChunk = [];
        const flushTextChunk = () => {
          if (!textChunk.length) return;
          htmlParts.push(`<p>${renderInline(textChunk.join("<br>"))}</p>`);
          textChunk = [];
        };
        const flushMediaChunk = () => {
          if (!mediaChunk.length) return;
          htmlParts.push(mediaChunk.map((line) => renderInline(line.trim())).join(""));
          mediaChunk = [];
        };
        paragraphLines.forEach((line) => {
          const trimmed = String(line || "").trim();
          if (!trimmed) return;
          if (isStandaloneMediaLine(trimmed)) {
            flushTextChunk();
            mediaChunk.push(trimmed);
            return;
          }
          flushMediaChunk();
          textChunk.push(trimmed);
        });
        flushTextChunk();
        flushMediaChunk();
        paragraphLines = [];
      };
      const isTableSeparator = (line) => /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(line);
      const splitTableRow = (line) => {
        const trimmed = line.trim();
        const row = trimmed.replace(/^\|/, "").replace(/\|$/, "");
        return row.split("|").map((cell) => cell.trim());
      };
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
          flushParagraph();
          closeLists();
          closeTable();
          continue;
        }
        const codeTokenMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
        if (codeTokenMatch) {
          flushParagraph();
          closeLists();
          closeTable();
          htmlParts.push(trimmed);
          continue;
        }
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          flushParagraph();
          closeLists();
          closeTable();
          const level = headingMatch[1].length;
          htmlParts.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
          continue;
        }
        if (trimmed.includes("|")) {
          const nextLine = lines[i + 1] || "";
          if (!inTable && isTableSeparator(nextLine.trim())) {
            flushParagraph();
            closeLists();
            const headers = splitTableRow(trimmed);
            htmlParts.push('<div class="table-wrap"><table><thead><tr>');
            headers.forEach((cell) => htmlParts.push(`<th>${renderInline(cell)}</th>`));
            htmlParts.push("</tr></thead><tbody>");
            inTable = true;
            i += 1;
            continue;
          }
          if (inTable && !isTableSeparator(trimmed)) {
            const cells = splitTableRow(trimmed);
            htmlParts.push("<tr>");
            cells.forEach((cell) => htmlParts.push(`<td>${renderInline(cell)}</td>`));
            htmlParts.push("</tr>");
            continue;
          }
        }
        const ulMatch = trimmed.match(/^[-*+•]\s+(.*)$/);
        if (ulMatch) {
          flushParagraph();
          if (!inUl) {
            closeLists();
            closeTable();
            htmlParts.push("<ul>");
            inUl = true;
          }
          htmlParts.push(`<li>${renderInline(ulMatch[1])}</li>`);
          continue;
        }
        const olMatch = trimmed.match(/^\d+[.)、]\s+(.*)$/);
        if (olMatch) {
          flushParagraph();
          if (!inOl) {
            closeLists();
            closeTable();
            htmlParts.push("<ol>");
            inOl = true;
          }
          htmlParts.push(`<li>${renderInline(olMatch[1])}</li>`);
          continue;
        }
        paragraphLines.push(trimmed);
      }
      flushParagraph();
      closeLists();
      closeTable();
      let output = htmlParts.join("");
      codeBlocks.forEach((html, index) => {
        output = output.replace(`@@CODEBLOCK_${index}@@`, html);
      });
      return output;
    }
    function parseThinkSections(raw) {
      const parts = [];
      let cursor = 0;
      while (cursor < raw.length) {
        const start = raw.indexOf("<think>", cursor);
        if (start === -1) {
          parts.push({ type: "text", value: raw.slice(cursor) });
          break;
        }
        if (start > cursor) {
          parts.push({ type: "text", value: raw.slice(cursor, start) });
        }
        const thinkStart = start + 7;
        const end = raw.indexOf("</think>", thinkStart);
        if (end === -1) {
          parts.push({ type: "think", value: raw.slice(thinkStart), open: true });
          cursor = raw.length;
        } else {
          parts.push({ type: "think", value: raw.slice(thinkStart, end), open: false });
          cursor = end + 8;
        }
      }
      return parts;
    }
    function parseRolloutBlocks(text, defaultId = "General") {
      const lines = (text || "").split(/\r?\n/);
      const blocks = [];
      let current = null;
      for (const line of lines) {
        const matchDouble = line.match(/^\s*\[([^\]]+)\]\[([^\]]+)\]\s*(.*)$/);
        if (matchDouble) {
          if (current) blocks.push(current);
          current = { id: matchDouble[1], type: matchDouble[2], lines: [] };
          if (matchDouble[3]) current.lines.push(matchDouble[3]);
          continue;
        }
        const matchSingle = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
        if (matchSingle) {
          const maybeType = String(matchSingle[1] || "").trim();
          if (/^(WebSearch|SearchImage|AgentThink)$/i.test(maybeType)) {
            if (current) blocks.push(current);
            current = { id: defaultId || "General", type: maybeType, lines: [] };
            if (matchSingle[2]) current.lines.push(matchSingle[2]);
            continue;
          }
        }
        if (current && /^\s*\[[^\]]+\]\s*$/.test(line)) {
          continue;
        }
        if (current) {
          current.lines.push(line);
        }
      }
      if (current) blocks.push(current);
      return blocks;
    }
    function parseAgentSections(text) {
      const lines = (text || "").split(/\r?\n/);
      const sections = [];
      let current = { title: null, lines: [] };
      let hasAgentHeading = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          current.lines.push(line);
          continue;
        }
        const agentMatch = trimmed.match(/^(Grok\s+Leader|(?:Grok\s+)?Agent\s*\d+)$/i);
        if (agentMatch) {
          hasAgentHeading = true;
          if (current.lines.length) {
            sections.push(current);
          }
          current = { title: agentMatch[1], lines: [] };
          continue;
        }
        current.lines.push(line);
      }
      if (current.lines.length) {
        sections.push(current);
      }
      if (!hasAgentHeading) {
        return [{ title: null, lines }];
      }
      return sections;
    }
    function splitBlocksIntoSyntheticAgents(blocks) {
      const list = Array.isArray(blocks) ? blocks : [];
      if (!list.length) return [];
      const ids = Array.from(new Set(list.map((b) => String(b.id || "").trim()).filter(Boolean)));
      const nonGeneralIds = ids.filter((id) => !/^general$/i.test(id));
      if (nonGeneralIds.length <= 1) {
        return [];
      }
      const groups = [];
      const map = /* @__PURE__ */ new Map();
      for (const block of list) {
        const key = String(block.id || "General");
        let group = map.get(key);
        if (!group) {
          group = { key, blocks: [] };
          map.set(key, group);
          groups.push(group);
        }
        group.blocks.push(block);
      }
      return groups.map((group, idx) => ({
        title: idx === 0 ? "Grok Leader" : `Agent ${idx}`,
        blocks: group.blocks
      }));
    }
    function renderFlatBlocks(blocks, imageSourceMap = null) {
      return (Array.isArray(blocks) ? blocks : []).map((item) => {
        const body = renderBasicMarkdown((item.lines || []).join("\n").trim(), imageSourceMap);
        const typeText = escapeHtml2(item.type);
        const typeKey = String(item.type || "").trim().toLowerCase().replace(/\s+/g, "");
        const typeAttr = escapeHtml2(typeKey);
        return `<div class="think-item-row"><div class="think-item-type" data-type="${typeAttr}">${typeText}</div><div class="think-item-body">${body || "<em>\uFF08\u7A7A\uFF09</em>"}</div></div>`;
      }).join("");
    }
    function renderThinkContent(text, openAll, imageSourceMap = null) {
      const sections = parseAgentSections(text);
      if (!sections.length) {
        return renderBasicMarkdown(text, imageSourceMap);
      }
      const renderThinkAgentSummary = (title) => {
        const safeTitle = escapeHtml2(title);
        return `<summary><span class="think-agent-avatar" aria-hidden="true"></span><span class="think-agent-label">${safeTitle}</span></summary>`;
      };
      const renderGroups = (blocks, openAllGroups) => {
        const groups = [];
        const map = /* @__PURE__ */ new Map();
        for (const block of blocks) {
          const key = block.id;
          let group = map.get(key);
          if (!group) {
            group = { id: key, items: [] };
            map.set(key, group);
            groups.push(group);
          }
          group.items.push(block);
        }
        return groups.map((group) => {
          const items = group.items.map((item) => {
            const body = renderBasicMarkdown(item.lines.join("\n").trim(), imageSourceMap);
            const typeText = escapeHtml2(item.type);
            const typeKey = String(item.type || "").trim().toLowerCase().replace(/\s+/g, "");
            const typeAttr = escapeHtml2(typeKey);
            return `<div class="think-item-row"><div class="think-item-type" data-type="${typeAttr}">${typeText}</div><div class="think-item-body">${body || "<em>\uFF08\u7A7A\uFF09</em>"}</div></div>`;
          }).join("");
          const title = escapeHtml2(group.id);
          const openAttr = openAllGroups ? " open" : "";
          return `<details class="think-rollout-group"${openAttr}><summary><span class="think-rollout-title"><span class="think-rollout-avatar" aria-hidden="true"></span><span class="think-rollout-label">${title}</span></span></summary><div class="think-rollout-body">${items}</div></details>`;
        }).join("");
      };
      const agentBlocks = sections.map((section, idx) => {
        const blocks = parseRolloutBlocks(section.lines.join("\n"), section.title || "General");
        if (!section.title && blocks.length) {
          const synthetic = splitBlocksIntoSyntheticAgents(blocks);
          if (synthetic.length) {
            return synthetic.map((agent, agentIdx) => {
              const inner2 = renderFlatBlocks(agent.blocks, imageSourceMap);
              const openAttr2 = openAll ? " open" : idx === 0 && agentIdx === 0 ? " open" : "";
              return `<details class="think-agent"${openAttr2}>${renderThinkAgentSummary(agent.title)}<div class="think-agent-items">${inner2}</div></details>`;
            }).join("");
          }
        }
        const inner = blocks.length ? renderGroups(blocks, openAll) : `<div class="think-rollout-body">${renderBasicMarkdown(section.lines.join("\n").trim(), imageSourceMap)}</div>`;
        if (!section.title) {
          return `<div class="think-agent-items">${inner}</div>`;
        }
        const openAttr = openAll ? " open" : idx === 0 ? " open" : "";
        return `<details class="think-agent"${openAttr}>${renderThinkAgentSummary(section.title)}<div class="think-agent-items">${inner}</div></details>`;
      });
      return `<div class="think-agents">${agentBlocks.join("")}</div>`;
    }
    function renderMarkdown(text, imageSourceMap = null) {
      const raw = text || "";
      const parts = parseThinkSections(raw);
      return parts.map((part) => {
        if (part.type === "think") {
          const body = renderThinkContent(part.value.trim(), part.open, imageSourceMap);
          const openAttr = part.open ? " open" : "";
          return `<details class="think-block" data-think="true"${openAttr}><summary class="think-summary">\u601D\u8003</summary><div class="think-content">${body || "<em>\uFF08\u7A7A\uFF09</em>"}</div></details>`;
        }
        return renderBasicMarkdown(part.value, imageSourceMap);
      }).join("");
    }
    function createMessage(role, content) {
      if (!chatLog) return null;
      hideEmptyState();
      const row = document.createElement("div");
      row.className = `message-row ${role === "user" ? "user" : "assistant"}`;
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      const contentNode = document.createElement("div");
      contentNode.className = "message-content";
      let assistantRoots = null;
      if (role === "assistant") {
        contentNode.classList.add("rendered", "assistant-rendered");
        const stableRoot = document.createElement("div");
        stableRoot.className = "assistant-stable-root";
        const liveTailRoot = document.createElement("div");
        liveTailRoot.className = "assistant-live-root";
        const mediaRoot = document.createElement("div");
        mediaRoot.className = "assistant-media-root hidden";
        contentNode.appendChild(stableRoot);
        contentNode.appendChild(liveTailRoot);
        contentNode.appendChild(mediaRoot);
        assistantRoots = { stableRoot, liveTailRoot, mediaRoot };
      } else {
        contentNode.textContent = content || "";
      }
      bubble.appendChild(contentNode);
      row.appendChild(bubble);
      chatLog.appendChild(row);
      scrollToBottom(true);
      const entry = {
        row,
        contentNode,
        role,
        messageId: generateId(),
        raw: content || "",
        sources: null,
        rendering: null,
        committed: false,
        startedAt: Date.now(),
        firstTokenAt: null,
        hasThink: false,
        thinkElapsed: null,
        thinkingActive: false,
        streamRenderTimer: 0,
        streamRenderRaf: 0,
        streamRenderQueued: false,
        lastStreamRenderAt: 0,
        lastPersistAt: 0,
        assistantRoots,
        streamRenderer: null
      };
      if (role === "assistant") {
        activeAssistantEntries.add(entry);
      }
      return entry;
    }
    function captureOpenState(root, selector) {
      if (!root || !root.querySelectorAll) return null;
      const nodes = Array.from(root.querySelectorAll(selector));
      if (!nodes.length) return null;
      return nodes.map((node) => node.hasAttribute("open"));
    }
    function captureScrollState(root, selector) {
      if (!root || !root.querySelectorAll) return null;
      const nodes = Array.from(root.querySelectorAll(selector));
      if (!nodes.length) return null;
      return nodes.map((node) => node.scrollTop || 0);
    }
    function restoreOpenState(root, selector, states) {
      if (!root || !root.querySelectorAll || !Array.isArray(states) || !states.length) return;
      const nodes = Array.from(root.querySelectorAll(selector));
      const max = Math.min(nodes.length, states.length);
      for (let i = 0; i < max; i += 1) {
        if (states[i]) {
          nodes[i].setAttribute("open", "");
        } else {
          nodes[i].removeAttribute("open");
        }
      }
    }
    function restoreScrollState(root, selector, states) {
      if (!root || !root.querySelectorAll || !Array.isArray(states) || !states.length) return;
      const nodes = Array.from(root.querySelectorAll(selector));
      const max = Math.min(nodes.length, states.length);
      for (let i = 0; i < max; i += 1) {
        nodes[i].scrollTop = states[i] || 0;
      }
    }
    function ensureAssistantRenderer(entry) {
      if (!entry || entry.role !== "assistant" || !entry.assistantRoots) return null;
      if (entry.streamRenderer) return entry.streamRenderer;
      const { stableRoot, liveTailRoot, mediaRoot } = entry.assistantRoots;
      entry.streamRenderer = new StreamRenderer({
        contentNode: entry.contentNode,
        stableRoot,
        liveTailRoot,
        mediaRoot,
        renderMarkdown,
        renderLiteMarkdown,
        layoutEngine: new PretextLayoutEngine(),
        getWidth: () => {
          const width = liveTailRoot.clientWidth || entry.contentNode.clientWidth || 0;
          return width > 0 ? width : 0;
        },
        getFont: () => {
          const styles = window.getComputedStyle(liveTailRoot);
          return styles.font || `${styles.fontSize} ${styles.fontFamily}`;
        },
        getLineHeight: () => {
          const styles = window.getComputedStyle(liveTailRoot);
          const lineHeight = parseFloat(styles.lineHeight);
          if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
          const fontSize = parseFloat(styles.fontSize);
          return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.6 : 24;
        }
      });
      return entry.streamRenderer;
    }
    function cancelPendingAssistantRender(entry) {
      if (!entry) return;
      if (entry.streamRenderTimer) {
        clearTimeout(entry.streamRenderTimer);
        entry.streamRenderTimer = 0;
      }
      if (entry.streamRenderRaf) {
        cancelAnimationFrame(entry.streamRenderRaf);
        entry.streamRenderRaf = 0;
      }
      entry.streamRenderQueued = false;
    }
    function renderAssistantMessage(entry, finalize = false) {
      if (!entry || !entry.contentNode) return;
      const shouldPreserveScroll = isSending && !followStreamScroll;
      const scrollContainer = shouldPreserveScroll ? getScrollContainer() : null;
      const viewportAnchor = shouldPreserveScroll ? fixedViewportAnchor || captureViewportAnchor(scrollContainer) : null;
      const savedThinkBlockState = captureOpenState(entry.contentNode, ".think-block");
      const savedThinkAgentState = captureOpenState(entry.contentNode, ".think-agent");
      const savedRolloutState = captureOpenState(entry.contentNode, ".think-rollout-group");
      const savedThinkContentScroll = captureScrollState(entry.contentNode, ".think-content");
      const savedThinkAgentItemsScroll = captureScrollState(entry.contentNode, ".think-agent-items");
      const savedThinkRolloutBodyScroll = captureScrollState(entry.contentNode, ".think-rollout-body");
      if (!entry.hasThink && entry.raw.includes("<think>")) {
        entry.hasThink = true;
      }
      const includeInlineImages = finalize;
      const renderText = getRenderableAssistantText(entry, {
        includeImages: includeInlineImages,
        preserveImageMarkers: !includeInlineImages
      });
      const imageSourceMap = buildRenderedImageSourceMap(entry.rendering);
      const mediaItems = buildMediaItems(entry.rendering);
      const renderer = ensureAssistantRenderer(entry);
      const renderMeta = finalize ? renderer.finalize({
        stableText: renderText,
        liveTailText: "",
        imageSourceMap,
        mediaItems
      }) : renderer.pushDelta({
        ...splitStableAndTail(renderText),
        imageSourceMap,
        mediaItems
      });
      restoreOpenState(entry.contentNode, ".think-block", savedThinkBlockState);
      restoreOpenState(entry.contentNode, ".think-agent", savedThinkAgentState);
      restoreOpenState(entry.contentNode, ".think-rollout-group", savedRolloutState);
      if (shouldPreserveScroll) {
        restoreScrollState(entry.contentNode, ".think-content", savedThinkContentScroll);
        restoreScrollState(entry.contentNode, ".think-agent-items", savedThinkAgentItemsScroll);
        restoreScrollState(entry.contentNode, ".think-rollout-body", savedThinkRolloutBodyScroll);
      }
      if (entry.hasThink) {
        entry.thinkingActive = !finalize;
        if (finalize && (entry.thinkElapsed === null || typeof entry.thinkElapsed === "undefined")) {
          entry.thinkElapsed = Math.max(1, Math.round((Date.now() - (entry.startedAt || Date.now())) / 1e3));
        }
        updateThinkSummary(entry, entry.thinkElapsed);
      }
      if (entry.assistantRoots) {
        if (renderMeta.stableChanged || finalize) {
          liftThinkImages(entry.assistantRoots.stableRoot);
          applyImageGrid(entry.assistantRoots.stableRoot);
          syncImageGridLayouts(entry.assistantRoots.stableRoot);
          syncImageGridControls(entry.assistantRoots.stableRoot);
          bindInlineCitationExpand(entry.assistantRoots.stableRoot);
          bindCodeCopyButtons(entry.assistantRoots.stableRoot);
        }
        if (renderMeta.mediaChanged || finalize) {
          syncImageGridLayouts(entry.assistantRoots.mediaRoot);
          syncImageGridControls(entry.assistantRoots.mediaRoot);
        }
      }
      enhanceBrokenImages(entry.contentNode);
      bindMessageImagePreview(entry.contentNode);
      bindInlineCitationExpand(entry.contentNode);
      const thinkNodes = entry.contentNode.querySelectorAll(".think-content");
      if (!shouldPreserveScroll) {
        thinkNodes.forEach((node) => {
          node.scrollTop = node.scrollHeight;
        });
      }
      if (finalize && entry.row && !entry.row.querySelector(".message-actions")) {
        attachAssistantActions(entry);
      }
      if (scrollContainer) {
        suppressScrollTracking = true;
        restoreViewportAnchor(viewportAnchor);
        requestAnimationFrame(() => {
          suppressScrollTracking = false;
          refreshFixedViewportAnchor(scrollContainer);
        });
        return;
      }
      scrollToBottom();
    }
    function scheduleAssistantRender(entry) {
      if (!entry || entry.role !== "assistant" || !entry.contentNode) return;
      if (entry.streamRenderQueued) return;
      const now = Date.now();
      const wait = Math.max(0, STREAM_RENDER_INTERVAL_MS - (now - (entry.lastStreamRenderAt || 0)));
      entry.streamRenderQueued = true;
      const queueRender = () => {
        entry.streamRenderTimer = 0;
        entry.streamRenderRaf = requestAnimationFrame(() => {
          entry.streamRenderRaf = 0;
          entry.streamRenderQueued = false;
          entry.lastStreamRenderAt = Date.now();
          renderAssistantMessage(entry, false);
        });
      };
      if (wait > 0) {
        entry.streamRenderTimer = setTimeout(queueRender, wait);
        return;
      }
      queueRender();
    }
    function captureRenderedImageCards(root) {
      if (!root || !root.querySelectorAll) return /* @__PURE__ */ new Map();
      const cardMap = /* @__PURE__ */ new Map();
      const cards = root.querySelectorAll(".message-image-card");
      cards.forEach((card) => {
        const img = card.querySelector("img");
        const src = normalizeRenderedImageUrl(img && (img.currentSrc || img.getAttribute("src") || ""));
        if (!src) return;
        if (!cardMap.has(src)) {
          cardMap.set(src, []);
        }
        cardMap.get(src).push(card);
      });
      return cardMap;
    }
    function restoreRenderedImageCards(root, cardMap) {
      if (!root || !root.querySelectorAll || !(cardMap instanceof Map) || !cardMap.size) return;
      const nextCards = root.querySelectorAll(".message-image-card");
      nextCards.forEach((card) => {
        const img = card.querySelector("img");
        const src = normalizeRenderedImageUrl(img && (img.getAttribute("src") || ""));
        if (!src || !cardMap.has(src)) return;
        const queue = cardMap.get(src);
        if (!Array.isArray(queue) || !queue.length) return;
        const preserved = queue.shift();
        if (!preserved || preserved === card) return;
        card.replaceWith(preserved);
      });
    }
    function renderUserMessage(entry, text, files) {
      if (!entry || !entry.contentNode) return;
      const prompt = String(text || "").trim();
      const attachmentsList = Array.isArray(files) ? files : [];
      const imageFiles = attachmentsList.filter((item) => String(item.mime || "").startsWith("image/") && item.data);
      const imagePlaceholders = attachmentsList.filter((item) => String(item.mime || "").startsWith("image/") && !item.data);
      const otherFiles = attachmentsList.filter((item) => !String(item.mime || "").startsWith("image/"));
      const parts = [];
      if (prompt) {
        parts.push(`<div class="user-text-bubble">${renderBasicMarkdown(prompt)}</div>`);
      }
      if (imageFiles.length) {
        const thumbs = imageFiles.map((item) => {
          const src = escapeHtml2(item.data || "");
          const name = escapeHtml2(item.name || "image");
          return `<button type="button" class="user-image-btn" data-preview-src="${src}" data-preview-name="${name}" aria-label="\u9884\u89C8\u56FE\u7247 ${name}"><img src="${src}" alt="${name}" loading="lazy"></button>`;
        }).join("");
        parts.push(`<div class="user-media-row">${thumbs}</div>`);
      }
      if (imagePlaceholders.length) {
        const placeholders = imagePlaceholders.map((item) => {
          const name = escapeHtml2(item.name || "\u56FE\u7247\u9644\u4EF6");
          const label = escapeHtml2(item.placeholderLabel || "\u56FE\u7247\u9644\u4EF6\u672A\u7F13\u5B58");
          return `<div class="user-image-btn user-image-btn--placeholder" aria-label="${name}"><span class="user-image-placeholder__icon">\u{1F5BC}</span><span class="user-image-placeholder__text">${label}</span></div>`;
        }).join("");
        parts.push(`<div class="user-media-row">${placeholders}</div>`);
      }
      if (otherFiles.length) {
        const tags = otherFiles.map((item) => {
          const name = escapeHtml2(item.name || "file");
          const placeholder = item.placeholder ? "\uFF08\u672A\u7F13\u5B58\uFF09" : "";
          return `<span class="user-file-chip">[\u6587\u4EF6] ${name}${placeholder}</span>`;
        }).join("");
        parts.push(`<div class="user-file-row">${tags}</div>`);
      }
      if (!parts.length) {
        parts.push('<div class="user-text-bubble">\uFF08\u7A7A\uFF09</div>');
      }
      entry.raw = prompt;
      entry.contentNode.classList.add("rendered", "user-rendered");
      entry.contentNode.innerHTML = parts.join("");
      bindMessageImagePreview(entry.contentNode);
      scrollToBottom(true);
    }
    function applyImageGrid(root) {
      if (!root) return;
      const isIgnorable = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return !node.textContent.trim();
        }
        return node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
      };
      const isImageLink = (node) => {
        if (!node || node.nodeType !== Node.ELEMENT_NODE || node.tagName !== "A") return false;
        const children = Array.from(node.childNodes);
        if (!children.length) return false;
        return children.every((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            return !child.textContent.trim();
          }
          return child.nodeType === Node.ELEMENT_NODE && child.tagName === "IMG";
        });
      };
      const extractImageItems = (node) => {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
        if (node.classList && node.classList.contains("img-grid")) return null;
        if (node.tagName === "IMG") {
          return { items: [node], removeNode: null };
        }
        if (node.tagName === "FIGURE" && node.classList.contains("message-image-card")) {
          return { items: [node], removeNode: null };
        }
        if (isImageLink(node)) {
          return { items: [node], removeNode: null };
        }
        if (node.tagName === "P") {
          const items = [];
          const children = Array.from(node.childNodes);
          if (!children.length) return null;
          for (const child of children) {
            if (child.nodeType === Node.TEXT_NODE) {
              if (!child.textContent.trim()) continue;
              return null;
            }
            if (child.nodeType === Node.ELEMENT_NODE) {
              if (child.tagName === "IMG" || isImageLink(child) || child.tagName === "FIGURE" && child.classList.contains("message-image-card")) {
                items.push(child);
                continue;
              }
              if (child.tagName === "BR") continue;
              return null;
            }
            return null;
          }
          if (!items.length) return null;
          return { items, removeNode: node };
        }
        return null;
      };
      const wrapImagesInContainer = (container) => {
        const children = Array.from(container.childNodes);
        let group = [];
        let groupStart = null;
        let removeNodes = [];
        const flush = () => {
          if (group.length < 2) {
            group = [];
            groupStart = null;
            removeNodes = [];
            return;
          }
          const wrapper = document.createElement("div");
          wrapper.className = "img-grid";
          if (group.length >= 4) {
            wrapper.classList.add("img-grid--desktop-scroll");
          }
          if (group.length >= 3) {
            wrapper.classList.add("img-grid--mobile-scroll");
          }
          const cols = Math.min(4, group.length);
          wrapper.style.setProperty("--cols", String(cols));
          if (groupStart) {
            container.insertBefore(wrapper, groupStart);
          } else {
            container.appendChild(wrapper);
          }
          group.forEach((img) => wrapper.appendChild(img));
          removeNodes.forEach((n) => n.parentNode && n.parentNode.removeChild(n));
          group = [];
          groupStart = null;
          removeNodes = [];
        };
        children.forEach((node) => {
          if (group.length && isIgnorable(node)) {
            removeNodes.push(node);
            return;
          }
          const extracted = extractImageItems(node);
          if (extracted && extracted.items.length) {
            if (!groupStart) groupStart = node;
            group.push(...extracted.items);
            if (extracted.removeNode) {
              removeNodes.push(extracted.removeNode);
            }
            return;
          }
          flush();
        });
        flush();
      };
      const containers = [root, ...root.querySelectorAll(".think-content, .think-item-body, .think-rollout-body, .think-agent-items")];
      containers.forEach((container) => {
        if (!container || container.closest(".img-grid")) return;
        if (!container.querySelector || !container.querySelector("img")) return;
        wrapImagesInContainer(container);
      });
    }
    function updateImageGridLayout(grid) {
      if (!(grid instanceof HTMLElement)) return;
      if (window.innerWidth <= 720) {
        grid.style.removeProperty("grid-template-columns");
        return;
      }
      const figures = Array.from(grid.querySelectorAll(":scope > .message-image-card"));
      if (figures.length < 2) {
        grid.style.removeProperty("grid-template-columns");
        return;
      }
      const ratios = figures.map((figure) => {
        const img = figure.querySelector("img");
        if (!(img instanceof HTMLImageElement)) return 1;
        const naturalWidth = Number(img.naturalWidth || 0);
        const naturalHeight = Number(img.naturalHeight || 0);
        if (naturalWidth > 0 && naturalHeight > 0) {
          return Math.max(0.72, Math.min(2.4, naturalWidth / naturalHeight));
        }
        return 1;
      });
      if (ratios.every((value) => Math.abs(value - 1) < 0.01)) {
        grid.style.removeProperty("grid-template-columns");
        return;
      }
      const template = ratios.map((value) => `minmax(0, ${value.toFixed(4)}fr)`).join(" ");
      grid.style.gridTemplateColumns = template;
    }
    function syncImageGridLayouts(root) {
      if (!root) return;
      const grids = root instanceof Element && root.classList.contains("img-grid") ? [root] : Array.from(root.querySelectorAll ? root.querySelectorAll(".img-grid") : []);
      grids.forEach((grid) => {
        updateImageGridLayout(grid);
        const images = Array.from(grid.querySelectorAll(":scope > .message-image-card img"));
        images.forEach((img) => {
          if (!(img instanceof HTMLImageElement) || img.dataset.gridBound === "1") return;
          img.dataset.gridBound = "1";
          const refresh = () => updateImageGridLayout(grid);
          img.addEventListener("load", refresh);
          img.addEventListener("error", refresh);
        });
      });
    }
    function syncImageGridControls(root) {
      if (!root) return;
      const grids = root instanceof Element && root.classList.contains("img-grid") ? [root] : Array.from(root.querySelectorAll ? root.querySelectorAll(".img-grid") : []);
      grids.forEach((grid) => {
        if (!(grid instanceof HTMLElement)) return;
        let shell = grid.parentElement;
        if (!(shell instanceof HTMLElement) || !shell.classList.contains("img-grid-shell")) {
          shell = document.createElement("div");
          shell.className = "img-grid-shell";
          grid.parentNode && grid.parentNode.insertBefore(shell, grid);
          shell.appendChild(grid);
        }
        let controls = shell.querySelector(":scope > .img-grid-controls");
        if (!(controls instanceof HTMLElement)) {
          controls = document.createElement("div");
          controls.className = "img-grid-controls";
          controls.innerHTML = [
            '<button type="button" class="img-grid-nav img-grid-nav--prev" aria-label="\u67E5\u770B\u4E0A\u4E00\u5F20"><span class="img-grid-nav__icon" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>',
            '<button type="button" class="img-grid-nav img-grid-nav--next" aria-label="\u67E5\u770B\u4E0B\u4E00\u5F20"><span class="img-grid-nav__icon" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>'
          ].join("");
          shell.appendChild(controls);
        }
        const prevBtn = controls.querySelector(".img-grid-nav--prev");
        const nextBtn = controls.querySelector(".img-grid-nav--next");
        const updateState = () => {
          const maxScrollLeft = Math.max(0, grid.scrollWidth - grid.clientWidth);
          const scrollable = maxScrollLeft > 8;
          controls.hidden = !scrollable;
          shell.classList.toggle("is-scrollable", scrollable);
          if (!(prevBtn instanceof HTMLButtonElement) || !(nextBtn instanceof HTMLButtonElement)) return;
          prevBtn.disabled = !scrollable || grid.scrollLeft <= 8;
          nextBtn.disabled = !scrollable || grid.scrollLeft >= maxScrollLeft - 8;
        };
        const bindButton = (button, direction) => {
          if (!(button instanceof HTMLButtonElement) || button.dataset.bound === "1") return;
          button.dataset.bound = "1";
          button.addEventListener("click", () => {
            const items = Array.from(grid.querySelectorAll(":scope > .message-image-card"));
            if (!items.length) return;
            const positions = items.map((item) => item.offsetLeft).sort((a, b) => a - b);
            const current = grid.scrollLeft;
            const maxScrollLeft = Math.max(0, grid.scrollWidth - grid.clientWidth);
            let target = current;
            if (direction > 0) {
              target = positions.find((value) => value > current + 24) ?? maxScrollLeft;
            } else {
              const previous = positions.filter((value) => value < current - 24);
              target = previous.length ? previous[previous.length - 1] : 0;
            }
            target = Math.max(0, Math.min(maxScrollLeft, target));
            grid.scrollTo({ left: target, behavior: "smooth" });
          });
        };
        bindButton(prevBtn, -1);
        bindButton(nextBtn, 1);
        if (grid.dataset.controlsBound !== "1") {
          grid.dataset.controlsBound = "1";
          grid.addEventListener("scroll", updateState, { passive: true });
        }
        requestAnimationFrame(updateState);
      });
    }
    function liftThinkImages(root) {
      if (!root || !root.querySelectorAll) return;
      const thinkBlocks = Array.from(root.querySelectorAll(".think-block"));
      thinkBlocks.forEach((block, blockIndex) => {
        const images = Array.from(block.querySelectorAll(".think-content img"));
        if (!images.length) return;
        let gallery = block.nextElementSibling;
        if (!(gallery instanceof HTMLElement) || !gallery.classList.contains("think-image-extract")) {
          gallery = document.createElement("div");
          gallery.className = "think-image-extract";
          gallery.dataset.thinkBlockIndex = String(blockIndex);
          block.insertAdjacentElement("afterend", gallery);
        }
        images.forEach((img) => {
          const paragraph = img.closest("p");
          gallery.appendChild(img);
          if (paragraph) {
            const residue = (paragraph.textContent || "").replace(/\s+/g, "");
            if (!residue || /^\.(?:png|jpe?g|webp|gif)\)?$/i.test(residue)) {
              paragraph.remove();
              return;
            }
          }
          const nextText = img.nextSibling;
          if (nextText && nextText.nodeType === Node.TEXT_NODE) {
            nextText.textContent = String(nextText.textContent || "").replace(/^\s*\.(?:png|jpe?g|webp|gif)\)?/i, "");
            if (!nextText.textContent.trim()) {
              nextText.parentNode && nextText.parentNode.removeChild(nextText);
            }
          }
        });
      });
    }
    function bindCodeCopyButtons(root) {
      if (!root || !root.querySelectorAll) return;
      const buttons = root.querySelectorAll(".code-copy-btn");
      buttons.forEach((btn) => {
        if (btn.dataset.bound === "1") return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async () => {
          const encoded = btn.getAttribute("data-copy-code") || "";
          const code = decodeURIComponent(encoded);
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(code);
            } else {
              const temp = document.createElement("textarea");
              temp.value = code;
              temp.style.position = "fixed";
              temp.style.opacity = "0";
              document.body.appendChild(temp);
              temp.select();
              document.execCommand("copy");
              document.body.removeChild(temp);
            }
            const original = btn.textContent || "\u590D\u5236";
            btn.textContent = "\u5DF2\u590D\u5236";
            setTimeout(() => {
              btn.textContent = original;
            }, 1200);
          } catch (e) {
            toast("\u590D\u5236\u5931\u8D25", "error");
          }
        });
      });
    }
    function updateMessage(entry, content, finalize = false) {
      if (!entry) return;
      entry.raw = content || "";
      if (!entry.contentNode) return;
      if (entry.role === "user") {
        renderUserMessage(entry, entry.raw, []);
        return;
      }
      if (finalize) {
        cancelPendingAssistantRender(entry);
        renderAssistantMessage(entry, true);
        return;
      }
      scheduleAssistantRender(entry);
    }
    function upsertAssistantMessage(sessionId, messageId, assistantText, assistantSources = null, assistantRendering = null, committed = false, draftState = null) {
      if (!sessionId || !sessionsData || !messageId) return;
      const session = sessionsData.sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const nextMessage = {
        id: messageId,
        role: "assistant",
        content: assistantText,
        sources: assistantSources || null,
        rendering: assistantRendering || null,
        committed: Boolean(committed),
        draftState: committed ? null : draftState || null
      };
      const existingIndex = session.messages.findIndex((item) => item && item.role === "assistant" && item.id === messageId);
      if (existingIndex >= 0) {
        session.messages[existingIndex] = {
          ...session.messages[existingIndex],
          ...nextMessage
        };
      } else {
        session.messages.push(nextMessage);
      }
      if (session.messages.length > MAX_CONTEXT_MESSAGES) {
        session.messages = session.messages.slice(-MAX_CONTEXT_MESSAGES);
      }
      session.updatedAt = Date.now();
      updateSessionTitle(session);
      if (sessionsData.activeId === sessionId) {
        messageHistory = session.messages.slice();
        trimMessageHistory();
      } else {
        session.unread = true;
      }
      saveSessions();
      renderSessionList();
    }
    function persistAssistantDraft(entry, sessionId, force = false) {
      if (!entry || !sessionId) return;
      const now = Date.now();
      if (!force && now - (entry.lastPersistAt || 0) < STREAM_PERSIST_INTERVAL_MS) {
        return;
      }
      entry.lastPersistAt = now;
      const renderer = ensureAssistantRenderer(entry);
      const fallbackSplit = splitStableAndTail(getRenderableAssistantText(entry, { includeImages: false }));
      const draftState = renderer ? renderer.getDraftState() : {
        stableText: fallbackSplit.stableText,
        liveTailText: fallbackSplit.liveTailText,
        mediaItems: buildMediaItems(entry.rendering)
      };
      upsertAssistantMessage(
        sessionId,
        entry.messageId,
        entry.raw || "",
        entry.sources,
        entry.rendering,
        force,
        draftState
      );
    }
    function enhanceBrokenImages(root) {
      if (!root) return;
      const images = root.querySelectorAll("img");
      images.forEach((img) => {
        if (img.dataset.retryBound) return;
        img.dataset.retryBound = "1";
        if (!img.dataset.originalSrc) {
          img.dataset.originalSrc = String(img.getAttribute("src") || "").trim();
        }
        const restoreLockedViewport = () => {
          if (!isSending || followStreamScroll || !userLockedStreamScroll) return;
          const container = getScrollContainer();
          if (!container) return;
          suppressScrollTracking = true;
          restoreViewportAnchor(fixedViewportAnchor);
          requestAnimationFrame(() => {
            suppressScrollTracking = false;
            refreshFixedViewportAnchor(container);
          });
        };
        const clearPendingRetryTimer = () => {
          const timerId = Number(img.dataset.retryTimerId || 0);
          if (timerId) {
            clearTimeout(timerId);
            delete img.dataset.retryTimerId;
          }
        };
        const clearFailureUi = (figure) => {
          if (figure) {
            figure.classList.remove("is-broken");
            const retryButton = figure.querySelector(".img-retry");
            if (retryButton) {
              retryButton.remove();
            }
          }
          img.classList.remove("hidden");
          delete img.dataset.failed;
        };
        const reloadImage = (forceOriginal = false) => {
          const original = String(img.dataset.originalSrc || img.getAttribute("src") || "").trim();
          const candidate = forceOriginal ? original : String(img.getAttribute("src") || original).trim();
          if (!candidate) return;
          const cacheBust = candidate.includes("?") ? "&" : "?";
          img.src = `${candidate}${cacheBust}t=${Date.now()}`;
        };
        const showFailureUi = (figure) => {
          if (!figure) return;
          figure.classList.add("is-broken");
          let wrapper = figure.querySelector(".img-retry");
          if (!(wrapper instanceof HTMLButtonElement)) {
            wrapper = document.createElement("button");
            wrapper.type = "button";
            wrapper.className = "img-retry";
            wrapper.textContent = "\u56FE\u7247\u52A0\u8F7D\u5931\u8D25\uFF0C\u70B9\u51FB\u91CD\u8BD5";
            wrapper.addEventListener("click", () => {
              wrapper.classList.add("loading");
              clearPendingRetryTimer();
              clearFailureUi(figure);
              reloadImage(true);
            });
            figure.appendChild(wrapper);
          }
          img.classList.add("hidden");
        };
        img.addEventListener("error", () => {
          const fallbackSrc = String(img.dataset.fallbackSrc || "").trim();
          if (fallbackSrc && img.dataset.fallbackTried !== "1") {
            img.dataset.fallbackTried = "1";
            img.src = fallbackSrc;
            restoreLockedViewport();
            return;
          }
          const figure = img.closest(".message-image-card");
          const retryCount = Number(img.dataset.streamRetryCount || 0);
          const canSilentRetry = isSending && retryCount < 2;
          clearPendingRetryTimer();
          if (canSilentRetry) {
            img.dataset.streamRetryCount = String(retryCount + 1);
            const retryDelay = retryCount === 0 ? 180 : 520;
            const timerId = window.setTimeout(() => {
              delete img.dataset.retryTimerId;
              clearFailureUi(figure);
              reloadImage(true);
              restoreLockedViewport();
            }, retryDelay);
            img.dataset.retryTimerId = String(timerId);
            restoreLockedViewport();
            return;
          }
          img.dataset.failed = "1";
          showFailureUi(figure);
          restoreLockedViewport();
        });
        img.addEventListener("load", () => {
          clearPendingRetryTimer();
          img.dataset.streamRetryCount = "0";
          const figure = img.closest(".message-image-card");
          clearFailureUi(figure);
          if (img.naturalWidth > 0 && img.naturalHeight > 0 && figure) {
            figure.style.setProperty("--message-image-ratio", `${img.naturalWidth} / ${img.naturalHeight}`);
          }
          restoreLockedViewport();
        });
      });
    }
    function updateThinkSummary(entry, elapsedSec) {
      if (!entry || !entry.contentNode) return;
      const summaries = entry.contentNode.querySelectorAll(".think-summary");
      if (!summaries.length) return;
      const text = typeof elapsedSec === "number" ? `\u601D\u8003 ${elapsedSec} \u79D2` : "\u601D\u8003\u4E2D";
      const spinDurationMs = 5500;
      const elapsedMs = Math.max(0, Date.now() - (entry.startedAt || Date.now()));
      const spinOffset = `-${elapsedMs % spinDurationMs}ms`;
      summaries.forEach((node) => {
        node.textContent = text;
        const block = node.closest(".think-block");
        if (!block) return;
        if (!entry.thinkingActive) {
          block.removeAttribute("data-thinking");
          node.style.removeProperty("--think-spin-delay");
          activeThinkSpinEntries.delete(entry);
          block.querySelectorAll(".think-agent-avatar, .think-rollout-avatar").forEach((avatar) => {
            avatar.style.removeProperty("transform");
          });
        } else {
          block.setAttribute("data-thinking", "true");
          node.style.setProperty("--think-spin-delay", spinOffset);
          activeThinkSpinEntries.add(entry);
          ensureThinkSpinLoop();
        }
      });
    }
    function ensureThinkSpinLoop() {
      if (thinkSpinRafId) return;
      const tick = () => {
        thinkSpinRafId = 0;
        if (!activeThinkSpinEntries.size) return;
        const now = Date.now();
        activeThinkSpinEntries.forEach((entry) => {
          if (!entry || !entry.contentNode || !entry.thinkingActive || !entry.contentNode.isConnected) {
            activeThinkSpinEntries.delete(entry);
            return;
          }
          const elapsedMs = Math.max(0, now - (entry.startedAt || now));
          const angle = elapsedMs % 2200 / 2200 * 360;
          entry.contentNode.querySelectorAll('.think-block[data-thinking="true"] .think-agent-avatar, .think-block[data-thinking="true"] .think-rollout-avatar').forEach((avatar) => {
            avatar.style.transform = `rotate(${angle}deg)`;
          });
        });
        if (activeThinkSpinEntries.size) {
          thinkSpinRafId = requestAnimationFrame(tick);
        }
      };
      thinkSpinRafId = requestAnimationFrame(tick);
    }
    function normalizeSourceText2(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }
    function decodeHtmlEntities(value) {
      const raw = String(value || "");
      if (!raw || !/[&][a-zA-Z#0-9]+;/.test(raw)) return raw;
      const textarea = document.createElement("textarea");
      textarea.innerHTML = raw;
      return textarea.value;
    }
    function replaceMarkdownImages(value, renderImage) {
      const text = String(value || "");
      if (!text.includes("![")) return text;
      let result = "";
      let index = 0;
      while (index < text.length) {
        const start = text.indexOf("![", index);
        if (start === -1) {
          result += text.slice(index);
          break;
        }
        result += text.slice(index, start);
        const altEnd = text.indexOf("]", start + 2);
        if (altEnd === -1) {
          result += text.slice(start);
          break;
        }
        let cursor = altEnd + 1;
        while (cursor < text.length && text[cursor] !== "\n" && text[cursor] !== "(") {
          cursor += 1;
        }
        const middle = text.slice(altEnd + 1, cursor);
        if (cursor >= text.length || text[cursor] !== "(") {
          result += text.slice(start, cursor);
          index = cursor;
          continue;
        }
        let depth = 0;
        let end = cursor;
        for (; end < text.length; end += 1) {
          const ch = text[end];
          if (ch === "(") {
            depth += 1;
          } else if (ch === ")") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        if (end >= text.length || text[end] !== ")") {
          result += text.slice(start);
          break;
        }
        const alt = text.slice(start + 2, altEnd);
        const url = text.slice(cursor + 1, end);
        result += renderImage({
          alt,
          middle,
          url,
          raw: text.slice(start, end + 1)
        });
        index = end + 1;
      }
      return result;
    }
    function getSourceHostname2(url) {
      try {
        return new URL(url).hostname.replace(/^www\./i, "");
      } catch (e) {
        return "";
      }
    }
    function getSourceFavicon(hostname) {
      if (!hostname) return "";
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=256`;
    }
    function getImageSourceLabel(url) {
      const raw = String(url || "").trim();
      if (!raw || raw.startsWith("data:")) return "";
      try {
        const parsed = new URL(raw, window.location.origin);
        return String(parsed.hostname || "").replace(/^www\./i, "");
      } catch (e) {
        return "";
      }
    }
    function bindInlineCitationExpand(root) {
      if (!root || root.dataset.citationExpandBound === "1") return;
      root.dataset.citationExpandBound = "1";
      root.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest(".inline-citation-cluster.inline-citation-chip") : null;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.expanded === "1") return;
        event.preventDefault();
        event.stopPropagation();
        expandInlineCitationCluster(target);
      });
    }
    function cleanExtractedUrl(url) {
      return String(url || "").trim().replace(/[),.;]+$/g, "");
    }
    function extractUrlsFromText(text) {
      const raw = String(text || "");
      const matches = raw.match(/https?:\/\/[^\s"'<>]+/g) || [];
      return matches.map(cleanExtractedUrl).filter((url) => /^https?:\/\//i.test(url));
    }
    function extractAssistantSources(root) {
      if (!root || !root.querySelectorAll) {
        return { links: [], searches: [] };
      }
      const rows = Array.from(root.querySelectorAll(".think-item-row"));
      const links = [];
      const searches = [];
      const seenLinks = /* @__PURE__ */ new Set();
      const seenSearches = /* @__PURE__ */ new Set();
      const pushLink = (item) => {
        const url = String(item && item.url || "").trim();
        if (!url || seenLinks.has(url)) return;
        seenLinks.add(url);
        links.push(item);
      };
      const pushSearch = (item) => {
        const label = String(item && item.label || "").trim();
        if (!label || seenSearches.has(label)) return;
        seenSearches.add(label);
        searches.push(item);
      };
      rows.forEach((row) => {
        const typeNode = row.querySelector(".think-item-type");
        const bodyNode = row.querySelector(".think-item-body");
        const type = String(typeNode && typeNode.dataset && typeNode.dataset.type || "").trim().toLowerCase();
        if (!bodyNode || !type) return;
        if (type === "websearch" || type === "searchimage") {
          const firstParagraph = bodyNode.querySelector("p");
          const queryText = normalizeSourceText2(firstParagraph ? firstParagraph.textContent : bodyNode.textContent || "");
          const compactQuery = queryText.split(/\s{2,}|\n/)[0].slice(0, 140).trim();
          if (compactQuery) {
            pushSearch({
              type: "search",
              label: compactQuery,
              meta: type === "searchimage" ? "\u5DF2\u641C\u7D22\u56FE\u7247" : "\u5DF2\u641C\u7D22\u7684\u7F51\u7EDC"
            });
          }
        }
        const links2 = Array.from(bodyNode.querySelectorAll("a[href]"));
        links2.forEach((link) => {
          const url = String(link.getAttribute("href") || "").trim();
          if (!/^https?:\/\//i.test(url)) return;
          const hostname = getSourceHostname2(url);
          pushLink({
            type: "visit",
            label: hostname || url,
            meta: "\u5DF2\u6D4F\u89C8",
            url,
            hostname
          });
        });
        extractUrlsFromText(bodyNode.textContent || "").forEach((url) => {
          const hostname = getSourceHostname2(url);
          pushLink({
            type: "visit",
            label: hostname || url,
            meta: "\u5DF2\u6D4F\u89C8",
            url,
            hostname
          });
        });
      });
      return { links, searches };
    }
    function createSourcesWidget(entry) {
      const structured = entry && entry.sources && typeof entry.sources === "object" ? entry.sources : null;
      const groups = Array.isArray(structured && structured.groups) ? structured.groups : [];
      const citations = Array.isArray(structured && structured.citations) ? structured.citations : [];
      const rawSourceCount = citations.length + groups.reduce((sum, group) => {
        const results = Array.isArray(group && group.results) ? group.results : [];
        return sum + results.length;
      }, 0);
      const data = !groups.length && !citations.length ? extractAssistantSources(entry && entry.contentNode) : { links: [], searches: [] };
      const sources = Array.isArray(data && data.links) ? data.links.slice() : [];
      const searches = Array.isArray(data && data.searches) ? data.searches.slice() : [];
      const seenLinks = new Set(sources.map((item) => String(item && item.url || "").trim()).filter(Boolean));
      citations.forEach((item) => {
        const url = String(item && item.url || "").trim();
        if (!url || seenLinks.has(url)) return;
        const hostname = getSourceHostname2(url);
        seenLinks.add(url);
        sources.unshift({
          type: "citation",
          label: hostname || url,
          meta: "\u5F15\u7528\u6765\u6E90",
          preview: normalizeSourceText2(item && item.preview || ""),
          url,
          hostname
        });
      });
      groups.forEach((group) => {
        const query = normalizeSourceText2(group && group.query || "");
        if (query) {
          searches.push({
            type: "search",
            label: query,
            meta: group.kind === "search_images" ? "\u56FE\u7247\u641C\u7D22" : "\u7F51\u7EDC\u641C\u7D22"
          });
        }
        const results = Array.isArray(group && group.results) ? group.results : [];
        results.forEach((item) => {
          const url = String(item && item.url || "").trim();
          if (!url || seenLinks.has(url)) return;
          const hostname = getSourceHostname2(url);
          seenLinks.add(url);
          sources.push({
            type: "visit",
            label: normalizeSourceText2(item && item.title || "") || hostname || url,
            meta: hostname || "\u641C\u7D22\u7ED3\u679C",
            preview: normalizeSourceText2(item && item.preview || ""),
            url,
            hostname
          });
        });
      });
      if (!sources.length && !searches.length) return null;
      const wrapper = document.createElement("details");
      wrapper.className = "sources-widget";
      const summary = document.createElement("summary");
      summary.className = "sources-chip";
      const summaryCount = rawSourceCount || sources.length || searches.length;
      const summaryLabel = sources.length ? `${summaryCount} sources` : `${summaryCount} searches`;
      summary.setAttribute("aria-label", summaryLabel);
      const iconStack = document.createElement("div");
      iconStack.className = "sources-icons";
      const faviconHosts = [];
      sources.forEach((item) => {
        if (item.hostname && !faviconHosts.includes(item.hostname)) {
          faviconHosts.push(item.hostname);
        }
      });
      faviconHosts.slice(0, 3).forEach((hostname, index) => {
        const badge = document.createElement("div");
        badge.className = "sources-icon-badge";
        badge.style.zIndex = String(3 - index);
        const img = document.createElement("img");
        img.src = getSourceFavicon(hostname);
        img.alt = "";
        img.setAttribute("role", "presentation");
        badge.appendChild(img);
        iconStack.appendChild(badge);
      });
      if (!iconStack.childNodes.length) {
        const fallback = document.createElement("div");
        fallback.className = "sources-icon-fallback";
        fallback.textContent = "S";
        iconStack.appendChild(fallback);
      }
      summary.appendChild(iconStack);
      const label = document.createElement("div");
      label.className = "sources-chip-label";
      label.textContent = summaryLabel;
      summary.appendChild(label);
      const panel = document.createElement("div");
      panel.className = "sources-panel";
      const panelHeader = document.createElement("div");
      panelHeader.className = "sources-panel-header";
      const panelHeading = document.createElement("div");
      panelHeading.className = "sources-section-title sources-panel-heading";
      panelHeading.textContent = "\u53EF\u9A8C\u8BC1\u6765\u6E90";
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "sources-panel-close";
      closeButton.setAttribute("aria-label", "\u5173\u95ED\u6765\u6E90\u9762\u677F");
      closeButton.textContent = "\xD7";
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        wrapper.open = false;
      });
      panelHeader.appendChild(panelHeading);
      panelHeader.appendChild(closeButton);
      panel.appendChild(panelHeader);
      const sectionAnchors = [];
      const registerSectionAnchor = (labelText) => {
        const anchor = document.createElement("div");
        anchor.className = "sources-section-anchor";
        anchor.dataset.sectionLabel = labelText;
        panel.appendChild(anchor);
        sectionAnchors.push(anchor);
        return anchor;
      };
      const updatePanelHeading = () => {
        if (!sectionAnchors.length) return;
        const headerHeight = panelHeader.offsetHeight || 0;
        const threshold = panel.scrollTop + headerHeight + 8;
        let activeLabel = sectionAnchors[0].dataset.sectionLabel || "";
        sectionAnchors.forEach((anchor) => {
          if (anchor.offsetTop <= threshold) {
            activeLabel = anchor.dataset.sectionLabel || activeLabel;
          }
        });
        if (activeLabel) {
          panelHeading.textContent = activeLabel;
        }
      };
      registerSectionAnchor("\u53EF\u9A8C\u8BC1\u6765\u6E90");
      sources.forEach((item) => {
        const row = document.createElement(item.url ? "a" : "div");
        row.className = "source-row";
        if (item.url) {
          row.href = item.url;
          row.target = "_blank";
          row.rel = "noopener noreferrer nofollow";
        }
        const icon = document.createElement("div");
        icon.className = "source-row-icon";
        if (item.hostname) {
          const img = document.createElement("img");
          img.src = getSourceFavicon(item.hostname);
          img.alt = "";
          img.setAttribute("role", "presentation");
          icon.appendChild(img);
        } else {
          icon.textContent = item.type === "search" ? "Q" : "L";
        }
        const textWrap = document.createElement("div");
        textWrap.className = "source-row-text";
        const meta = document.createElement("span");
        meta.className = "source-row-meta";
        meta.textContent = item.meta || "\u6765\u6E90";
        const title = document.createElement("span");
        title.className = "source-row-title";
        title.textContent = item.label || item.url || "";
        textWrap.appendChild(title);
        if (item.preview) {
          const preview = document.createElement("span");
          preview.className = "source-row-preview";
          preview.textContent = item.preview;
          textWrap.appendChild(preview);
        }
        textWrap.appendChild(meta);
        row.appendChild(icon);
        row.appendChild(textWrap);
        panel.appendChild(row);
      });
      if (searches.length) {
        registerSectionAnchor("\u641C\u7D22\u8F68\u8FF9");
        const title = document.createElement("div");
        title.className = "sources-section-title";
        title.textContent = "\u641C\u7D22\u8F68\u8FF9";
        panel.appendChild(title);
      }
      searches.forEach((item) => {
        const row = document.createElement("div");
        row.className = "source-row is-query";
        const icon = document.createElement("div");
        icon.className = "source-row-icon";
        icon.textContent = "Q";
        const textWrap = document.createElement("div");
        textWrap.className = "source-row-text";
        const meta = document.createElement("span");
        meta.className = "source-row-meta";
        meta.textContent = item.meta || "\u641C\u7D22\u8F68\u8FF9";
        const title = document.createElement("span");
        title.className = "source-row-title";
        title.textContent = item.label || "";
        textWrap.appendChild(meta);
        textWrap.appendChild(title);
        row.appendChild(icon);
        row.appendChild(textWrap);
        panel.appendChild(row);
      });
      wrapper.appendChild(summary);
      wrapper.appendChild(panel);
      panel.addEventListener("scroll", updatePanelHeading, { passive: true });
      wrapper.addEventListener("toggle", () => {
        if (wrapper.open) {
          updatePanelHeading();
        }
      });
      return wrapper;
    }
    function clearChat() {
      messageHistory = [];
      if (chatLog) {
        chatLog.innerHTML = "";
      }
      showEmptyState();
    }
    function buildMessages() {
      return buildMessagesFrom(messageHistory);
    }
    function sanitizeRequestContent(content) {
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return content;
      return content.map((block) => {
        if (!block || typeof block !== "object") return null;
        if (block.type === "text") {
          const text = String(block.text || "");
          return text ? { type: "text", text } : null;
        }
        if (block.type === "image_url") {
          const imageUrl = block.image_url && typeof block.image_url === "object" ? String(block.image_url.url || "").trim() : String(block.url || "").trim();
          if (!imageUrl) return null;
          return { type: "image_url", image_url: { url: imageUrl } };
        }
        if (block.type === "file") {
          const fileData = block.file && typeof block.file === "object" ? String(block.file.file_data || "").trim() : String(block.url || block.data || "").trim();
          if (!fileData) return null;
          return { type: "file", file: { file_data: fileData } };
        }
        return null;
      }).filter(Boolean);
    }
    function buildMessagesFrom(history) {
      const payload = [];
      const systemPrompt = systemInput ? systemInput.value.trim() : "";
      if (systemPrompt) {
        payload.push({ role: "system", content: systemPrompt });
      }
      for (const msg of history) {
        payload.push({ role: msg.role, content: sanitizeRequestContent(msg.content) });
      }
      return payload;
    }
    function buildPayload() {
      const payload = {
        model: modelSelect && modelSelect.value || "grok-3",
        messages: buildMessages(),
        stream: true,
        temperature: Number(tempRange ? tempRange.value : 0.8),
        top_p: Number(topPRange ? topPRange.value : 0.95)
      };
      const reasoning = reasoningSelect ? reasoningSelect.value : "";
      if (reasoning) {
        payload.reasoning_effort = reasoning;
      }
      return payload;
    }
    function buildPayloadFrom(history) {
      const payload = {
        model: modelSelect && modelSelect.value || "grok-3",
        messages: buildMessagesFrom(history),
        stream: true,
        temperature: Number(tempRange ? tempRange.value : 0.8),
        top_p: Number(topPRange ? topPRange.value : 0.95)
      };
      const reasoning = reasoningSelect ? reasoningSelect.value : "";
      if (reasoning) {
        payload.reasoning_effort = reasoning;
      }
      return payload;
    }
    function closeModelPicker() {
      if (!modelPicker || !modelPickerMenu || !modelPickerBtn) return;
      modelPicker.classList.remove("open");
      modelPickerMenu.classList.add("hidden");
      modelPickerBtn.setAttribute("aria-expanded", "false");
    }
    function openModelPicker() {
      if (!modelPicker || !modelPickerMenu || !modelPickerBtn) return;
      modelPicker.classList.add("open");
      modelPickerMenu.classList.remove("hidden");
      modelPickerBtn.setAttribute("aria-expanded", "true");
    }
    function setModelValue(modelId) {
      if (!modelSelect || !modelId) return;
      modelSelect.value = modelId;
      if (modelPickerLabel) {
        modelPickerLabel.textContent = modelId;
      }
      if (modelPickerMenu) {
        const options = modelPickerMenu.querySelectorAll(".model-option");
        options.forEach((node) => {
          node.classList.toggle("active", node.dataset.value === modelId);
        });
      }
      if (sessionsData) {
        syncSessionModel();
        saveSessions();
        renderSessionList();
      }
    }
    function renderModelOptions(models) {
      if (!modelSelect || !modelPickerMenu) return;
      modelSelect.innerHTML = "";
      modelPickerMenu.innerHTML = "";
      availableModels = Array.isArray(models) ? models.slice() : [];
      availableModels.forEach((id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = id;
        modelSelect.appendChild(option);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "model-option";
        btn.textContent = id;
        btn.dataset.value = id;
        btn.setAttribute("role", "option");
        btn.addEventListener("click", () => {
          setModelValue(id);
          closeModelPicker();
        });
        modelPickerMenu.appendChild(btn);
      });
    }
    async function loadModels() {
      if (!modelSelect) return;
      const fallback = ["grok-4.1-fast", "grok-4", "grok-3", "grok-3-mini", "grok-3-thinking", "grok-4.20-fast", "grok-4.20-expert", "grok-4.20-auto"];
      const preferred = "grok-4.20-auto";
      let list = fallback;
      try {
        const authHeader = await ensurePublicKey();
        if (authHeader === null) {
          renderModelOptions(list);
          if (list.includes(preferred)) {
            setModelValue(preferred);
          } else {
            setModelValue(list[list.length - 1] || preferred);
          }
          return;
        }
        const res = await fetch("/v1/models", {
          cache: "no-store",
          headers: buildAuthHeaders(authHeader)
        });
        if (!res.ok) throw new Error("models fetch failed");
        const data = await res.json();
        const items = Array.isArray(data && data.data) ? data.data : [];
        const ids = items.map((item) => item && item.id).filter(Boolean).filter((id) => !String(id).startsWith("grok-imagine")).filter((id) => !String(id).includes("video"));
        if (ids.length) list = ids;
      } catch (e) {
        list = fallback;
      }
      renderModelOptions(list);
      if (list.includes(preferred)) {
        setModelValue(preferred);
      } else {
        setModelValue(list[list.length - 1] || preferred);
      }
      restoreSessionModel();
    }
    function showAttachmentBadge() {
      if (!fileBadge) return;
      fileBadge.innerHTML = "";
      if (!attachments.length) {
        fileBadge.classList.add("hidden");
        return;
      }
      fileBadge.classList.remove("hidden");
      attachments.forEach((item, index) => {
        const tag = document.createElement("div");
        tag.className = "file-badge-item";
        tag.dataset.index = String(index);
        const isImage = String(item.mime || "").startsWith("image/");
        if (isImage && item.data) {
          const preview = document.createElement("img");
          preview.className = "file-preview";
          preview.src = item.data;
          preview.alt = item.name || "preview";
          tag.classList.add("is-image");
          tag.appendChild(preview);
        }
        const name = document.createElement("span");
        name.className = "file-name";
        name.textContent = item.name || "file";
        tag.appendChild(name);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "file-remove";
        removeBtn.dataset.action = "remove";
        removeBtn.dataset.index = String(index);
        removeBtn.textContent = "\xD7";
        tag.appendChild(removeBtn);
        fileBadge.appendChild(tag);
      });
    }
    function removeAttachmentAt(index) {
      if (!Number.isInteger(index) || index < 0 || index >= attachments.length) return;
      attachments.splice(index, 1);
      if (!attachments.length && fileInput) {
        fileInput.value = "";
      }
      showAttachmentBadge();
      closeAttachmentPreview();
    }
    function clearAttachment() {
      attachments = [];
      if (fileInput) fileInput.value = "";
      showAttachmentBadge();
      closeAttachmentPreview();
    }
    function closeAttachmentPreview() {
      const overlay = document.getElementById("attachmentPreviewOverlay");
      if (!overlay) return;
      overlay.remove();
    }
    function openAttachmentPreview(src, name) {
      if (!src) return;
      closeAttachmentPreview();
      const overlay = document.createElement("div");
      overlay.id = "attachmentPreviewOverlay";
      overlay.className = "attachment-preview-overlay";
      const img = document.createElement("img");
      img.className = "attachment-preview-image";
      img.src = src;
      img.alt = name || "preview";
      img.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      overlay.appendChild(img);
      overlay.addEventListener("click", () => closeAttachmentPreview());
      document.body.appendChild(overlay);
    }
    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25"));
        reader.readAsDataURL(file);
      });
    }
    function readFileAsDataUrlFallback(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const buffer = reader.result;
            const bytes = new Uint8Array(buffer);
            let binary = "";
            const chunkSize = 32768;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, i + chunkSize);
              binary += String.fromCharCode.apply(null, chunk);
            }
            const b64 = btoa(binary);
            const mime = file && file.type ? file.type : "application/octet-stream";
            resolve(`data:${mime};base64,${b64}`);
          } catch (e) {
            reject(new Error("\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25"));
          }
        };
        reader.onerror = () => reject(new Error("\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25"));
        reader.readAsArrayBuffer(file);
      });
    }
    async function uploadCachedChatImage(file) {
      const formData = new FormData();
      formData.append("file", file, file.name || "image");
      let headers = {};
      try {
        const authHeader = await ensurePublicKey();
        headers = buildAuthHeaders(authHeader);
      } catch (e) {
      }
      const res = await fetch("/v1/public/chat/upload-image", {
        method: "POST",
        headers,
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== "success" || !data.url) {
        throw new Error(data.detail || "\u56FE\u7247\u7F13\u5B58\u4E0A\u4F20\u5931\u8D25");
      }
      return data;
    }
    function buildUniqueFileName(name) {
      const baseName = name || "file";
      const exists = new Set(attachments.map((item) => item.name));
      if (!exists.has(baseName)) return baseName;
      const dot = baseName.lastIndexOf(".");
      const hasExt = dot > 0;
      const prefix = hasExt ? baseName.slice(0, dot) : baseName;
      const ext = hasExt ? baseName.slice(dot) : "";
      let index = 2;
      while (true) {
        const candidate = `${prefix} (${index})${ext}`;
        if (!exists.has(candidate)) return candidate;
        index += 1;
      }
    }
    async function handleFileSelect(file) {
      if (!file) return false;
      try {
        const safeName = buildUniqueFileName(file.name || "file");
        const isImage = String(file.type || "").startsWith("image/");
        if (isImage) {
          const uploaded = await uploadCachedChatImage(file);
          attachments.push({
            name: safeName,
            data: uploaded.url,
            url: uploaded.url,
            mime: uploaded.content_type || file.type || "image/jpeg",
            size: Number(uploaded.size_bytes || file.size || 0) || 0,
            cached: true,
            cacheName: uploaded.filename || ""
          });
        } else {
          let dataUrl = "";
          try {
            dataUrl = await readFileAsDataUrl(file);
          } catch (e) {
            dataUrl = await readFileAsDataUrlFallback(file);
          }
          attachments.push({
            name: safeName,
            data: dataUrl,
            mime: file.type || "",
            size: Number(file.size || 0) || 0
          });
        }
        try {
          showAttachmentBadge();
        } catch (e) {
          console.error("showAttachmentBadge failed", e);
        }
        return true;
      } catch (e) {
        console.error("handleFileSelect failed", e, file);
        return false;
      }
    }
    function dataTransferHasFiles(dataTransfer) {
      if (!dataTransfer) return false;
      const types = Array.from(dataTransfer.types || []);
      return types.includes("Files");
    }
    function extractFiles(dataTransfer) {
      if (!dataTransfer) return [];
      const items = Array.from(dataTransfer.items || []);
      const filesFromItems = [];
      const seen = /* @__PURE__ */ new Set();
      const pushUnique = (file) => {
        if (!file) return;
        const size = Number(file.size || 0);
        if (size <= 0) return;
        const key = `${file.name || ""}|${file.type || ""}|${size}|${file.lastModified || 0}`;
        if (seen.has(key)) return;
        seen.add(key);
        filesFromItems.push(file);
      };
      for (const item of items) {
        if (item && item.kind === "file") {
          const file = item.getAsFile();
          if (!file) continue;
          const type = String(file.type || "").toLowerCase();
          const hasName = Boolean(file.name);
          const isUseful = type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/") || type.startsWith("application/") || hasName;
          if (isUseful) pushUnique(file);
        }
      }
      if (filesFromItems.length) return filesFromItems;
      const fallbackFiles = Array.from(dataTransfer.files || []).filter(Boolean).filter((file) => {
        const type = String(file.type || "").toLowerCase();
        return type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/") || type.startsWith("application/") || Boolean(file.name);
      });
      fallbackFiles.forEach(pushUnique);
      return filesFromItems;
    }
    function createActionButton(label, title, onClick) {
      const btn = document.createElement("button");
      btn.className = "action-btn";
      btn.type = "button";
      btn.textContent = label;
      if (title) btn.title = title;
      if (onClick) btn.addEventListener("click", onClick);
      return btn;
    }
    function attachAssistantActions(entry) {
      if (!entry || !entry.row) return;
      const existing = entry.row.querySelector(".message-actions");
      if (existing) existing.remove();
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const sourcesWidget = createSourcesWidget(entry);
      const retryBtn = createActionButton("\u91CD\u8BD5", "\u91CD\u8BD5\u4E0A\u4E00\u6761\u56DE\u7B54", () => retryLast());
      const copyBtn = createActionButton("\u590D\u5236", "\u590D\u5236\u56DE\u7B54\u5185\u5BB9", () => copyToClipboard(entry.raw || ""));
      const quoteBtn = createActionButton("\u5F15\u7528", "\u628A\u8FD9\u6761\u56DE\u7B54\u91CC\u7684\u56FE\u7247\u52A0\u5165\u9644\u4EF6", () => quoteAssistantImages(entry));
      const feedbackBtn = createActionButton("\u53CD\u9988", "\u53CD\u9988\u5230 Grok2API", () => {
        window.open(feedbackUrl, "_blank", "noopener");
      });
      if (sourcesWidget) actions.appendChild(sourcesWidget);
      actions.appendChild(retryBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(quoteBtn);
      actions.appendChild(feedbackBtn);
      entry.row.appendChild(actions);
    }
    async function copyToClipboard(text) {
      if (!text) {
        toast("\u6682\u65E0\u5185\u5BB9\u53EF\u590D\u5236", "error");
        return;
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const temp = document.createElement("textarea");
          temp.value = text;
          temp.style.position = "fixed";
          temp.style.opacity = "0";
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          document.body.removeChild(temp);
        }
        toast("\u5DF2\u590D\u5236", "success");
      } catch (e) {
        toast("\u590D\u5236\u5931\u8D25", "error");
      }
    }
    async function retryLast() {
      if (isSending) return;
      if (!messageHistory.length) return;
      let lastUserIndex = -1;
      for (let i = messageHistory.length - 1; i >= 0; i -= 1) {
        if (messageHistory[i].role === "user") {
          lastUserIndex = i;
          break;
        }
      }
      if (lastUserIndex === -1) {
        toast("\u6CA1\u6709\u53EF\u91CD\u8BD5\u7684\u5BF9\u8BDD", "error");
        return;
      }
      const historySlice = messageHistory.slice(0, lastUserIndex + 1);
      const retrySessionId = sessionsData ? sessionsData.activeId : null;
      const assistantEntry = createMessage("assistant", "");
      if (retrySessionId) {
        persistAssistantDraft(assistantEntry, retrySessionId, true);
      }
      setSendingState(true);
      setStatus("connecting", "\u53D1\u9001\u4E2D");
      followStreamScroll = true;
      userLockedStreamScroll = false;
      fixedViewportAnchor = null;
      abortController = new AbortController();
      const payload = buildPayloadFrom(historySlice);
      let headers = { "Content-Type": "application/json" };
      try {
        const authHeader = await ensurePublicKey();
        headers = { ...headers, ...buildAuthHeaders(authHeader) };
      } catch (e) {
      }
      try {
        const res = await fetch("/v1/public/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: abortController.signal
        });
        if (!res.ok) {
          throw await parseApiError(res);
        }
        await handleStream(res, assistantEntry, retrySessionId);
        setStatus("connected", "\u5B8C\u6210");
      } catch (e) {
        if (e && e.name === "AbortError") {
          updateMessage(assistantEntry, assistantEntry.raw || "\u5DF2\u4E2D\u6B62", true);
          if (!assistantEntry.committed) {
            assistantEntry.committed = true;
            if (retrySessionId) {
              commitToSession(retrySessionId, assistantEntry.raw || "", assistantEntry.sources, assistantEntry.rendering, assistantEntry.messageId);
            } else {
              messageHistory.push({ id: assistantEntry.messageId, role: "assistant", content: assistantEntry.raw || "", sources: assistantEntry.sources || null, rendering: assistantEntry.rendering || null, committed: true, draftState: null });
            }
          }
          setStatus("error", "\u5DF2\u4E2D\u6B62");
        } else {
          updateMessage(assistantEntry, `\u8BF7\u6C42\u5931\u8D25: ${e.message || e}`, true);
          setStatus("error", "\u5931\u8D25");
          toast(e.message || "\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u670D\u52A1\u72B6\u6001", "error");
        }
      } finally {
        setSendingState(false);
        abortController = null;
        scrollToBottom();
      }
    }
    async function sendMessage() {
      if (isSending) return;
      const prompt = promptInput ? promptInput.value.trim() : "";
      if (!prompt && attachments.length === 0) {
        toast("\u8BF7\u8F93\u5165\u5185\u5BB9", "error");
        return;
      }
      const attachmentsSnapshot = attachments.map((item) => ({ ...item }));
      const userEntry = createMessage("user", "");
      renderUserMessage(userEntry, prompt, attachmentsSnapshot);
      let content = prompt;
      if (attachments.length) {
        const blocks = [];
        if (prompt) {
          blocks.push({ type: "text", text: prompt });
        }
        attachments.forEach((item) => {
          const isImage = String(item.mime || "").startsWith("image/");
          if (isImage) {
            blocks.push({ type: "image_url", image_url: { url: item.data } });
          } else {
            blocks.push({ type: "file", file: { file_data: item.data } });
          }
        });
        content = blocks;
      }
      messageHistory.push({ role: "user", content });
      trimMessageHistory();
      if (promptInput) promptInput.value = "";
      clearAttachment();
      syncCurrentSession();
      syncSessionModel();
      updateSessionTitle(getActiveSession());
      saveSessions();
      renderSessionList();
      const sendSessionId = sessionsData ? sessionsData.activeId : null;
      const assistantEntry = createMessage("assistant", "");
      if (sendSessionId) {
        persistAssistantDraft(assistantEntry, sendSessionId, true);
      }
      setSendingState(true);
      setStatus("connecting", "\u53D1\u9001\u4E2D");
      followStreamScroll = true;
      userLockedStreamScroll = false;
      fixedViewportAnchor = null;
      abortController = new AbortController();
      const payload = buildPayload();
      let headers = { "Content-Type": "application/json" };
      try {
        const authHeader = await ensurePublicKey();
        headers = { ...headers, ...buildAuthHeaders(authHeader) };
      } catch (e) {
      }
      try {
        const res = await fetch("/v1/public/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: abortController.signal
        });
        if (!res.ok) {
          throw await parseApiError(res);
        }
        await handleStream(res, assistantEntry, sendSessionId);
        setStatus("connected", "\u5B8C\u6210");
      } catch (e) {
        if (e && e.name === "AbortError") {
          updateMessage(assistantEntry, assistantEntry.raw || "\u5DF2\u4E2D\u6B62", true);
          if (assistantEntry.hasThink) {
            const elapsed = assistantEntry.thinkElapsed || Math.max(1, Math.round((Date.now() - assistantEntry.startedAt) / 1e3));
            updateThinkSummary(assistantEntry, elapsed);
          }
          setStatus("error", "\u5DF2\u4E2D\u6B62");
          if (!assistantEntry.committed) {
            assistantEntry.committed = true;
            if (sendSessionId) {
              commitToSession(sendSessionId, assistantEntry.raw || "", assistantEntry.sources, assistantEntry.rendering, assistantEntry.messageId);
            } else {
              messageHistory.push({ id: assistantEntry.messageId, role: "assistant", content: assistantEntry.raw || "", sources: assistantEntry.sources || null, rendering: assistantEntry.rendering || null, committed: true, draftState: null });
            }
          }
        } else {
          updateMessage(assistantEntry, `\u8BF7\u6C42\u5931\u8D25: ${e.message || e}`, true);
          setStatus("error", "\u5931\u8D25");
          toast(e.message || "\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u670D\u52A1\u72B6\u6001", "error");
        }
      } finally {
        setSendingState(false);
        abortController = null;
        scrollToBottom();
      }
    }
    function commitToSession(sessionId, assistantText, assistantSources = null, assistantRendering = null, messageId = null) {
      upsertAssistantMessage(
        sessionId,
        messageId || generateId(),
        assistantText,
        assistantSources,
        assistantRendering,
        true,
        null
      );
    }
    async function handleStream(res, assistantEntry, targetSessionId = null) {
      activeStreamInfo = { sessionId: targetSessionId, entry: assistantEntry };
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let assistantText = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const lines = part.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload) continue;
              if (payload === "[DONE]") {
                updateMessage(assistantEntry, assistantText, true);
                if (assistantEntry.hasThink) {
                  const elapsed = assistantEntry.thinkElapsed || Math.max(1, Math.round((Date.now() - assistantEntry.startedAt) / 1e3));
                  updateThinkSummary(assistantEntry, elapsed);
                }
                assistantEntry.committed = true;
                if (targetSessionId) {
                  commitToSession(targetSessionId, assistantText, assistantEntry.sources, assistantEntry.rendering, assistantEntry.messageId);
                } else {
                  messageHistory.push({ id: assistantEntry.messageId, role: "assistant", content: assistantText, sources: assistantEntry.sources || null, rendering: assistantEntry.rendering || null, committed: true, draftState: null });
                }
                return;
              }
              try {
                const json = JSON.parse(payload);
                if (json && json.sources && typeof json.sources === "object") {
                  assistantEntry.sources = json.sources;
                  if (assistantEntry.row && assistantEntry.row.querySelector(".message-actions")) {
                    attachAssistantActions(assistantEntry);
                  }
                }
                if (json && json.rendering && typeof json.rendering === "object") {
                  assistantEntry.rendering = json.rendering;
                  if (!targetSessionId || sessionsData && sessionsData.activeId === targetSessionId) {
                    updateMessage(assistantEntry, assistantText, false);
                  }
                  persistAssistantDraft(assistantEntry, targetSessionId, false);
                }
                const delta = json && json.choices && json.choices[0] && json.choices[0].delta ? json.choices[0].delta.content : "";
                if (delta) {
                  assistantText += delta;
                  if (!assistantEntry.firstTokenAt) {
                    assistantEntry.firstTokenAt = Date.now();
                  }
                  if (!assistantEntry.hasThink && assistantText.includes("<think>")) {
                    assistantEntry.hasThink = true;
                    assistantEntry.thinkingActive = true;
                    assistantEntry.thinkElapsed = null;
                    updateThinkSummary(assistantEntry, null);
                  }
                  if (!targetSessionId || sessionsData && sessionsData.activeId === targetSessionId) {
                    updateMessage(assistantEntry, assistantText, false);
                  }
                  persistAssistantDraft(assistantEntry, targetSessionId, false);
                }
              } catch (e) {
              }
            }
          }
        }
        updateMessage(assistantEntry, assistantText, true);
        if (assistantEntry.hasThink) {
          const elapsed = assistantEntry.thinkElapsed || Math.max(1, Math.round((Date.now() - assistantEntry.startedAt) / 1e3));
          updateThinkSummary(assistantEntry, elapsed);
        }
        assistantEntry.committed = true;
        if (targetSessionId) {
          commitToSession(targetSessionId, assistantText, assistantEntry.sources, assistantEntry.rendering, assistantEntry.messageId);
        } else {
          messageHistory.push({ id: assistantEntry.messageId, role: "assistant", content: assistantText, sources: assistantEntry.sources || null, rendering: assistantEntry.rendering || null, committed: true, draftState: null });
        }
      } finally {
        activeStreamInfo = null;
      }
    }
    function toggleSettings(show) {
      if (!settingsPanel) return;
      if (typeof show === "boolean") {
        settingsPanel.classList.toggle("hidden", !show);
        return;
      }
      settingsPanel.classList.toggle("hidden");
    }
    function bindEvents() {
      if (tempRange) tempRange.addEventListener("input", updateRangeValues);
      if (topPRange) topPRange.addEventListener("input", updateRangeValues);
      if (sendBtn) {
        sendBtn.addEventListener("click", () => {
          if (isSending) {
            abortCurrentRequest();
            return;
          }
          sendMessage();
        });
      }
      if (modelPickerBtn) {
        modelPickerBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (modelPicker && modelPicker.classList.contains("open")) {
            closeModelPicker();
          } else {
            openModelPicker();
          }
        });
      }
      if (settingsToggle) {
        settingsToggle.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleSettings();
        });
      }
      document.addEventListener("click", (event) => {
        if (modelPicker && !modelPicker.contains(event.target)) {
          closeModelPicker();
        }
        if (!settingsPanel || settingsPanel.classList.contains("hidden")) return;
        if (settingsPanel.contains(event.target) || settingsToggle && settingsToggle.contains(event.target)) {
          return;
        }
        toggleSettings(false);
      });
      if (promptInput) {
        let composing = false;
        promptInput.addEventListener("compositionstart", () => {
          composing = true;
        });
        promptInput.addEventListener("compositionend", () => {
          composing = false;
        });
        promptInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            if (composing || event.isComposing) return;
            event.preventDefault();
            sendMessage();
          }
        });
        promptInput.addEventListener("paste", async (event) => {
          const files = extractFiles(event.clipboardData);
          if (!files.length) return;
          event.preventDefault();
          let okCount = 0;
          for (const file of files) {
            if (await handleFileSelect(file)) okCount += 1;
          }
          if (okCount > 0) {
            toast(`\u5DF2\u7C98\u8D34 ${okCount} \u4E2A\u6587\u4EF6`, "success");
          }
          if (okCount < files.length) {
            toast("\u90E8\u5206\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25", "error");
          }
        });
      }
      if (attachBtn && fileInput) {
        attachBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", async () => {
          const files = Array.from(fileInput.files || []);
          if (!files.length) return;
          let okCount = 0;
          for (const file of files) {
            if (await handleFileSelect(file)) okCount += 1;
          }
          if (okCount > 0) {
            toast(`\u5DF2\u9009\u62E9 ${okCount} \u4E2A\u6587\u4EF6`, "success");
          }
          if (okCount < files.length) {
            toast("\u90E8\u5206\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25", "error");
          }
          fileInput.value = "";
        });
      }
      if (fileBadge) {
        fileBadge.addEventListener("click", (event) => {
          const removeBtn = event.target.closest(".file-remove");
          if (removeBtn) {
            event.stopPropagation();
            const index2 = Number(removeBtn.dataset.index);
            if (Number.isInteger(index2)) {
              removeAttachmentAt(index2);
            }
            return;
          }
          const tag = event.target.closest(".file-badge-item");
          if (!tag) return;
          const index = Number(tag.dataset.index);
          if (!Number.isInteger(index) || index < 0 || index >= attachments.length) return;
          const item = attachments[index];
          const isImage = String(item.mime || "").startsWith("image/");
          if (!isImage || !item.data) return;
          const opened = document.getElementById("attachmentPreviewOverlay");
          if (opened) {
            closeAttachmentPreview();
            return;
          }
          openAttachmentPreview(item.data, item.name);
        });
      }
      if (newChatBtn) {
        newChatBtn.addEventListener("click", createSession);
      }
      if (collapseSidebarBtn) {
        collapseSidebarBtn.addEventListener("click", toggleSidebar);
      }
      if (sidebarExpandBtn) {
        sidebarExpandBtn.addEventListener("click", openSidebar);
      }
      if (sidebarToggle) {
        sidebarToggle.addEventListener("click", toggleSidebar);
      }
      if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", closeSidebar);
      }
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeModelPicker();
          closeAttachmentPreview();
          closeChatImagePreview();
        }
      });
      window.addEventListener("resize", () => {
        document.querySelectorAll(".message-content .img-grid").forEach((grid) => {
          updateImageGridLayout(grid);
        });
        syncImageGridControls(document);
        activeAssistantEntries.forEach((entry) => {
          if (!entry || !entry.streamRenderer) return;
          entry.streamRenderer.resize();
          if (entry.assistantRoots && entry.assistantRoots.mediaRoot) {
            syncImageGridLayouts(entry.assistantRoots.mediaRoot);
            syncImageGridControls(entry.assistantRoots.mediaRoot);
          }
        });
      });
      const composerInput = document.querySelector(".composer-input");
      if (composerInput) {
        let dragDepth = 0;
        const setDragState = (active) => {
          composerInput.classList.toggle("drag-over", Boolean(active));
        };
        composerInput.addEventListener("dragenter", (event) => {
          if (!dataTransferHasFiles(event.dataTransfer)) return;
          event.preventDefault();
          dragDepth += 1;
          setDragState(true);
        });
        composerInput.addEventListener("dragover", (event) => {
          if (!dataTransferHasFiles(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        });
        composerInput.addEventListener("dragleave", (event) => {
          if (!dataTransferHasFiles(event.dataTransfer)) return;
          event.preventDefault();
          dragDepth = Math.max(0, dragDepth - 1);
          if (dragDepth === 0) {
            setDragState(false);
          }
        });
        composerInput.addEventListener("drop", async (event) => {
          if (!dataTransferHasFiles(event.dataTransfer)) return;
          event.preventDefault();
          dragDepth = 0;
          setDragState(false);
          const files = extractFiles(event.dataTransfer);
          if (!files.length) return;
          let okCount = 0;
          for (const file of files) {
            if (await handleFileSelect(file)) okCount += 1;
          }
          if (okCount > 0) {
            toast(`\u5DF2\u6DFB\u52A0 ${okCount} \u4E2A\u6587\u4EF6`, "success");
          }
          if (okCount < files.length) {
            toast("\u90E8\u5206\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25", "error");
          }
        });
        document.addEventListener("dragover", (event) => {
          if (!dataTransferHasFiles(event.dataTransfer)) return;
          event.preventDefault();
        });
        document.addEventListener("drop", (event) => {
          if (!dataTransferHasFiles(event.dataTransfer)) return;
          if (composerInput.contains(event.target)) return;
          event.preventDefault();
        });
      }
      const handleScrollTracking = () => {
        if (suppressScrollTracking) return;
        if (isSending) {
          lockStreamScrollFollow();
          return;
        }
        updateFollowStreamScroll();
      };
      const handleUserScrollIntent = () => {
        lockStreamScrollFollow();
      };
      if (chatLog) {
        chatLog.addEventListener("scroll", handleScrollTracking, { passive: true });
        chatLog.addEventListener("wheel", handleUserScrollIntent, { passive: true });
        chatLog.addEventListener("touchmove", handleUserScrollIntent, { passive: true });
        chatLog.addEventListener("pointerdown", handleUserScrollIntent, { passive: true });
      }
      window.addEventListener("scroll", handleScrollTracking, { passive: true });
      window.addEventListener("wheel", handleUserScrollIntent, { passive: true });
      window.addEventListener("touchmove", handleUserScrollIntent, { passive: true });
    }
    updateRangeValues();
    setSendingState(false);
    bindEvents();
    restoreSidebarState();
    loadSessions();
    loadModels();
  })();
})();
