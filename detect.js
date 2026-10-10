// Injected into the open tab on popup click. It has to be self-contained:
// Chrome serializes this function alone, so helpers live inside it.
export function readNowPlaying(doc, loc, root) {
  const pageDoc = doc || document;
  const pageLoc = loc || location;
  const service = serviceFor(pageLoc.hostname || "", pageLoc.pathname || "");
  if (!service) return null;
  if (service === "Netflix") return readNetflix(pageDoc, pageLoc, root, service);
  return readGeneric(pageDoc, service);

  function serviceFor(hostname, pathname) {
    const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
    const path = pathname || "/";
    if (host === "netflix.com" || host.endsWith(".netflix.com")) return "Netflix";
    if (host === "primevideo.com" || host.endsWith(".primevideo.com")) return "Prime Video";
    if (isAmazonHost(host) && /\/(?:gp\/video|amazon-video)\b|\/video\//.test(path)) return "Prime Video";
    if (host === "disneyplus.com" || host.endsWith(".disneyplus.com")) return "Disney+";
    if (host === "hulu.com" || host.endsWith(".hulu.com")) return "Hulu";
    if (host === "max.com" || host.endsWith(".max.com") || host.endsWith("hbomax.com")) return "Max";
    if (host === "tv.apple.com") return "Apple TV";
    if (host.endsWith("peacocktv.com")) return "Peacock";
    if (host.endsWith("paramountplus.com")) return "Paramount+";
    return "";
  }

  function isAmazonHost(host) {
    return /(^|\.)amazon\./.test(host);
  }

  function readNetflix(pageDoc, pageLoc, root, service) {
    const id = netflixVideoId(pageDoc, pageLoc);
    let title = plausibleTitle(textOf(pageDoc.querySelector("[data-uia='video-title']")));
    let year = "";
    let via = title ? "dom" : "";

    const state = root === undefined ? globalThis.netflix?.reactContext : root;
    if (state && id) {
      const fromMemory = titleFromState(state, id);
      if (!title && fromMemory.title) {
        title = fromMemory.title;
        via = "memory";
      }
      if (!year && fromMemory.year) year = fromMemory.year;
    }

    if (id && (!title || !year)) {
      const fromScript = titleFromScripts(pageDoc, id);
      if (!title && fromScript.title) {
        title = fromScript.title;
        via = "script";
      }
      if (!year && fromScript.year) year = fromScript.year;
    }

    if (!title) {
      const fromPage = titleFromPage(pageDoc.title, service);
      title = fromPage.title;
      year = year || fromPage.year;
      via = title ? "page" : "";
    }

    if (!title) return null;
    return { title, year, service, via };
  }

  function readGeneric(pageDoc, service) {
    const selectors = {
      "Prime Video": [".atvwebplayersdk-title-text", "[data-automation-id='title']"],
      "Disney+": ["[data-testid='playback-title']"],
      Max: ["[data-testid='player-ux-asset-title']"],
      Hulu: [".PlayerMetadata__title"],
    };
    for (const selector of selectors[service] || []) {
      const found = splitYear(plausibleTitle(textOf(pageDoc.querySelector(selector))));
      if (found.title) return { title: found.title, year: found.year, service, via: "dom" };
    }

    const og = pageDoc.querySelector("meta[property='og:title']")?.getAttribute("content")
      || pageDoc.querySelector("meta[name='twitter:title']")?.getAttribute("content")
      || "";
    const fromMeta = titleFromPage(og, service);
    if (fromMeta.title) return { title: fromMeta.title, year: fromMeta.year, service, via: "page" };

    const fromPage = titleFromPage(pageDoc.title, service);
    if (fromPage.title) return { title: fromPage.title, year: fromPage.year, service, via: "page" };

    const fromHeading = splitYear(plausibleTitle(textOf(pageDoc.querySelector("h1"))));
    if (fromHeading.title) return { title: fromHeading.title, year: fromHeading.year, service, via: "dom" };
    return null;
  }

  function netflixVideoId(pageDoc, pageLoc) {
    const fromPlayer = pageDoc.querySelector("[data-uia='player']")?.getAttribute("data-videoid") || "";
    if (/^\d{5,}$/.test(fromPlayer)) return fromPlayer;
    const fromPath = String(pageLoc.pathname || "").match(/\/(?:watch|title)\/(\d{5,})/);
    return fromPath ? fromPath[1] : "";
  }

  function titleFromState(state, id) {
    const seen = new WeakSet();
    let title = "";
    let year = "";
    let nodes = 0;

    function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 10 || nodes > 12000 || (title && year)) return;
      if (seen.has(node)) return;
      seen.add(node);
      nodes += 1;

      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }

      if (node.videoId != null && String(node.videoId) === id) {
        title = title || fieldTitle(node);
        year = year || fieldYear(node);
      } else if (!title && singleVideoRef(node, id)) {
        title = fieldTitle(node);
      }

      for (const [key, value] of Object.entries(node)) {
        if (title && year) return;
        if (skipKey(key) || !value || typeof value !== "object") continue;
        walk(value, depth + 1);
      }
    }

    walk(state, 0);
    return { title, year };
  }

  function singleVideoRef(node, id) {
    let refs = 0;
    let hit = false;
    for (const [key, value] of Object.entries(node)) {
      if (skipKey(key)) continue;
      const ref = typeof value === "string" ? value : value?.__ref;
      if (typeof ref !== "string" || !/videoId|watch\/|Movie:|Show:|Video:/i.test(ref)) continue;
      refs += 1;
      if (ref.includes(id)) hit = true;
    }
    return hit && refs === 1;
  }

  function fieldTitle(node) {
    return plausibleTitle(node.displayString)
      || plausibleTitle(node.title)
      || plausibleTitle(node.originalTitle)
      || plausibleTitle(node.name)
      || "";
  }

  function fieldYear(node) {
    const year = node.releaseYear ?? node.year;
    return plausibleYear(year) ? String(year) : "";
  }

  function titleFromScripts(pageDoc, id) {
    const titles = [];
    const releaseYears = [];
    const otherYears = [];
    for (const script of pageDoc.querySelectorAll("script")) {
      const text = script.textContent || "";
      if (!text.includes(id)) continue;
      for (const slice of windowsAround(text, id)) {
        collectFields(loosen(slice), id, titles, releaseYears, otherYears);
      }
    }
    const titlePool = preferSameObject(titles);
    const releasePool = preferSameObject(releaseYears);
    const otherPool = preferSameObject(otherYears);
    titlePool.sort((a, b) => a.score - b.score);
    releasePool.sort((a, b) => a.dist - b.dist);
    otherPool.sort((a, b) => a.dist - b.dist);
    return {
      title: titlePool[0]?.value || "",
      year: releasePool[0]?.value || otherPool[0]?.value || "",
    };
  }

  function windowsAround(text, id) {
    const windows = [];
    const re = new RegExp(`(?<!\\d)${id}(?!\\d)`, "g");
    let match;
    while ((match = re.exec(text)) && windows.length < 20) {
      const at = match.index;
      windows.push(text.slice(Math.max(0, at - 1200), Math.min(text.length, at + 1800)));
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
    return windows;
  }

  function loosen(text) {
    let out = text;
    for (let pass = 0; pass < 4; pass += 1) {
      const next = out.replace(/\\"/g, '"');
      if (next === out) break;
      out = next;
    }
    return out;
  }

  function collectFields(text, id, titles, releaseYears, otherYears) {
    const fields = [
      ["displayString", 0],
      ["title", 1],
      ["originalTitle", 2],
      ["name", 3],
    ];
    for (const [field, rank] of fields) {
      const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,120})"`, "g");
      let match;
      while ((match = re.exec(text))) {
        const value = plausibleTitle(decodeJsString(match[1]));
        if (!value) continue;
        const dist = distanceToId(text, id, match.index);
        const closes = closesBetween(text, match.index, nearestIdIndex(text, id, match.index));
        if (closes > 1) continue;
        titles.push({ value, closes, score: dist + closes * 800 + rank * 250 });
      }
    }
    collectYears(text, id, "releaseYear", releaseYears);
    collectYears(text, id, "year", otherYears);
  }

  function collectYears(text, id, field, into) {
    const re = new RegExp(`"${field}"\\s*:\\s*"?(\\d{4})"?`, "g");
    let match;
    while ((match = re.exec(text))) {
      if (!plausibleYear(match[1])) continue;
      const closes = closesBetween(text, match.index, nearestIdIndex(text, id, match.index));
      if (closes > 1) continue;
      into.push({ value: match[1], closes, dist: distanceToId(text, id, match.index) });
    }
  }

  function preferSameObject(items) {
    const same = items.filter((item) => item.closes === 0);
    return same.length ? same : items;
  }

  function nearestIdIndex(text, id, index) {
    let best = index;
    let bestDist = 100000;
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(id, from);
      if (at < 0) break;
      const before = at > 0 ? text[at - 1] : "";
      const after = text[at + id.length] || "";
      if (!/\d/.test(before) && !/\d/.test(after)) {
        const dist = Math.abs(index - at);
        if (dist < bestDist) {
          bestDist = dist;
          best = at;
        }
      }
      from = at + id.length;
    }
    return best;
  }

  function closesBetween(text, a, b) {
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    let closes = 0;
    for (let i = start; i < end; i += 1) if (text[i] === "}") closes += 1;
    return closes;
  }

  function distanceToId(text, id, index) {
    let best = 100000;
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(id, from);
      if (at < 0) break;
      const before = at > 0 ? text[at - 1] : "";
      const after = text[at + id.length] || "";
      if (!/\d/.test(before) && !/\d/.test(after)) best = Math.min(best, Math.abs(index - at));
      from = at + id.length;
    }
    return best;
  }

  function decodeJsString(value) {
    return String(value)
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\n/g, " ")
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
  }

  function titleFromPage(raw, serviceName) {
    let text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text) return { title: "", year: "" };
    const escaped = serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`^watch\\s+(.+?)(?:\\s+online)?(?:\\s+streaming(?:\\s+online)?)?\\s*[|\\-–—:]\\s*${escaped}\\s*$`, "i"),
      new RegExp(`^(.+?)\\s*[|\\-–—:]\\s*${escaped}\\s*$`, "i"),
      new RegExp(`^${escaped}\\s*[|\\-–—:]\\s*(.+)$`, "i"),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        text = match[1].trim();
        break;
      }
    }
    return splitYear(plausibleTitle(text));
  }

  function splitYear(title) {
    const match = String(title || "").match(/^(.*\S)\s+\((\d{4})\)$/);
    if (match && plausibleYear(match[2]) && plausibleTitle(match[1])) {
      return { title: match[1].trim(), year: match[2] };
    }
    return { title: title || "", year: "" };
  }

  function textOf(node) {
    return (node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function plausibleYear(value) {
    const year = Number(value);
    return year >= 1888 && year <= 2030;
  }

  function skipKey(key) {
    return /auth|token|esn|credential|password|email|guid|cookie|session|profile/i.test(key);
  }

  function plausibleTitle(value) {
    const blocked = new Set([
      "netflix", "prime video", "hulu", "disney+", "disney plus", "max", "hbo max",
      "apple tv", "apple tv+", "peacock", "paramount+", "paramount plus", "amazon",
      "home", "browse", "search", "play", "pause", "watch", "movies", "tv shows",
      "continue watching", "my list", "trending now", "popular", "new releases",
      "more info", "episodes", "trailers", "trailer", "similar", "because you watched",
      "audio and subtitles", "next episode", "skip intro", "watch credits", "top 10",
      "everyone's watching", "only on netflix", "sign in",
    ]);
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length < 1 || text.length > 100) return "";
    if (blocked.has(text.toLowerCase())) return "";
    if (/^https?:/i.test(text) || /^\d+$/.test(text) || /[<>{}]/.test(text)) return "";
    if (/watch tv shows|browse movies|sign in to|who's watching/i.test(text)) return "";
    return text;
  }
}

export function mergePlaying(primary, extra) {
  const title = primary?.title || extra?.title || "";
  if (!title) return null;
  const preferExtra = primary?.via === "script" && extra?.title && extra.via !== "script";
  return {
    title: preferExtra ? extra.title : title,
    year: (preferExtra ? extra.year : primary?.year) || extra?.year || primary?.year || "",
    service: (preferExtra ? extra.service : primary?.service) || extra?.service || "",
    via: preferExtra ? extra.via : primary?.via || extra?.via || "",
  };
}

export function hostCanDetect(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname || "/";
    if (host === "netflix.com" || host.endsWith(".netflix.com")) return true;
    if (host === "primevideo.com" || host.endsWith(".primevideo.com")) return true;
    if (/(^|\.)amazon\./.test(host) && /\/(?:gp\/video|amazon-video)\b|\/video\//.test(path)) return true;
    if (host === "disneyplus.com" || host.endsWith(".disneyplus.com")) return true;
    if (host === "hulu.com" || host.endsWith(".hulu.com")) return true;
    if (host === "max.com" || host.endsWith(".max.com") || host.endsWith("hbomax.com")) return true;
    if (host === "tv.apple.com") return true;
    if (host.endsWith("peacocktv.com")) return true;
    if (host.endsWith("paramountplus.com")) return true;
    return false;
  } catch {
    return false;
  }
}
