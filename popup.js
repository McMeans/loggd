import { hostCanDetect, mergePlaying, readNowPlaying } from "./detect.js";

let tmdbApiKey = "";
try {
  ({ tmdbApiKey } = await import("./keys.js"));
} catch {
  tmdbApiKey = "";
}
tmdbApiKey = typeof tmdbApiKey === "string" ? tmdbApiKey.trim() : "";

const SOURCE_LABELS = {
  letterboxd: "Letterboxd",
  imdb: "IMDb",
  tmdb: "TMDB",
  rottenTomatoes: "Rotten Tomatoes",
  metacritic: "Metacritic",
};

const REGIONS = [
  ["AR", "Argentina"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["BE", "Belgium"],
  ["BR", "Brazil"],
  ["CA", "Canada"],
  ["DK", "Denmark"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["DE", "Germany"],
  ["HK", "Hong Kong"],
  ["IN", "India"],
  ["IE", "Ireland"],
  ["IT", "Italy"],
  ["JP", "Japan"],
  ["MX", "Mexico"],
  ["NL", "Netherlands"],
  ["NZ", "New Zealand"],
  ["NO", "Norway"],
  ["PH", "Philippines"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["SG", "Singapore"],
  ["ZA", "South Africa"],
  ["KR", "South Korea"],
  ["ES", "Spain"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["TW", "Taiwan"],
  ["TH", "Thailand"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
];

const WATCH_GROUPS = [
  ["flatrate", "Subscription"],
  ["free", "Free"],
  ["ads", "With ads"],
  ["rent", "Rent"],
  ["buy", "Buy"],
];

const ext = globalThis.chrome ?? globalThis.browser;

const body = document.getElementById("body");
const defaultLogo = document.getElementById("defaultLogo");
const lightLogo = document.getElementById("lightLogo");
const icons = document.querySelectorAll(".icon-wrapper");
const prompt = document.getElementById("prompt");
const searchForm = document.getElementById("searchForm");
const movieTitleInput = document.getElementById("movieTitle");
const suggestionsEl = document.getElementById("suggestions");
const selectionEl = document.getElementById("selection");
const selectionPoster = document.getElementById("selectionPoster");
const selectionTitle = document.getElementById("selectionTitle");
const selectionYear = document.getElementById("selectionYear");
const clearSelection = document.getElementById("clearSelection");
const watchEl = document.getElementById("watch");
const regionSelect = document.getElementById("region");
const providersEl = document.getElementById("providers");
const watchLink = document.getElementById("watchLink");
const setupNote = document.getElementById("setupNote");
const detectedNote = document.getElementById("detectedNote");
const errorMessage = document.getElementById("errorMessage");

let selectedSource = "";
let selectedMovie = null;
let suggestions = [];
let highlight = 0;
let searchTimer = 0;
let searchAbort = null;
let watchLinkUrl = "";
let detectedTitle = "";
let detectedYear = "";

function hasKey() {
  return tmdbApiKey.length > 0;
}

function storageGet(keys) {
  const area = ext?.storage?.local;
  if (!area) {
    const stored = {};
    for (const key of keys) stored[key] = localStorage.getItem(key);
    return Promise.resolve(stored);
  }
  return new Promise((resolve) => area.get(keys, (items) => resolve(items || {})));
}

function storageSet(items) {
  const area = ext?.storage?.local;
  if (!area) {
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
    return Promise.resolve();
  }
  return new Promise((resolve) => area.set(items, () => resolve()));
}

function defaultRegion() {
  const parts = (navigator.language || "en-US").split("-");
  const code = parts[parts.length - 1].toUpperCase();
  return REGIONS.some(([id]) => id === code) ? code : "US";
}

function yearOf(movie) {
  return movie.release_date ? movie.release_date.slice(0, 4) : "";
}

function posterUrl(path, size) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

function showError(message) {
  errorMessage.textContent = message || "";
  errorMessage.className = message ? "errorVisible" : "";
}

function updatePrompt() {
  const site = SOURCE_LABELS[selectedSource];
  const year = selectedMovie ? yearOf(selectedMovie) : "";
  const title = selectedMovie ? `${selectedMovie.title}${year ? ` (${year})` : ""}` : "";
  if (site && title) prompt.textContent = `Go to the ${site} page for ${title}`;
  else if (site) prompt.textContent = `Go to the ${site} page for`;
  else prompt.textContent = "Choose a site, then pick a movie";
}

function applyTheme(theme) {
  const name = theme || "blue";
  body.className = name;
  const light = name === "light";
  defaultLogo.classList.toggle("hiddenLogo", light);
  defaultLogo.classList.toggle("visibleLogo", !light);
  lightLogo.classList.toggle("hiddenLogo", !light);
  lightLogo.classList.toggle("visibleLogo", light);
}

function selectSource(source, persist = true) {
  selectedSource = SOURCE_LABELS[source] ? source : "";
  icons.forEach((icon) => {
    icon.classList.toggle("selected", icon.dataset.source === selectedSource);
  });
  updatePrompt();
  if (persist && selectedSource) storageSet({ source: selectedSource });
}

function renderSuggestions() {
  suggestionsEl.replaceChildren();
  const open = suggestions.length > 0;
  suggestionsEl.hidden = !open;
  movieTitleInput.setAttribute("aria-expanded", open ? "true" : "false");
  suggestions.forEach((movie, index) => {
    const item = document.createElement("li");
    item.id = `suggestion-${index}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `suggestion${index === highlight ? " active" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", index === highlight ? "true" : "false");
    const poster = document.createElement("img");
    poster.className = "poster";
    poster.alt = "";
    const src = posterUrl(movie.poster_path, "w92");
    if (src) poster.src = src;
    else poster.classList.add("poster-empty");
    const copy = document.createElement("span");
    const year = yearOf(movie);
    copy.textContent = year ? `${movie.title} (${year})` : movie.title;
    button.append(poster, copy);
    button.addEventListener("click", () => selectMovie(movie));
    button.addEventListener("mouseenter", () => {
      highlight = index;
      suggestionsEl.querySelectorAll(".suggestion").forEach((node, nodeIndex) => {
        node.classList.toggle("active", nodeIndex === highlight);
        node.setAttribute("aria-selected", nodeIndex === highlight ? "true" : "false");
      });
    });
    item.append(button);
    suggestionsEl.append(item);
  });
  if (open) movieTitleInput.setAttribute("aria-activedescendant", `suggestion-${highlight}`);
  else movieTitleInput.removeAttribute("aria-activedescendant");
}

function renderSelection() {
  if (!selectedMovie) {
    selectionEl.hidden = true;
    watchEl.hidden = true;
    return;
  }
  const src = posterUrl(selectedMovie.poster_path, "w92");
  selectionPoster.hidden = !src;
  if (src) selectionPoster.src = src;
  selectionTitle.textContent = selectedMovie.title;
  selectionYear.textContent = yearOf(selectedMovie);
  selectionEl.hidden = false;
  watchEl.hidden = false;
}

function renderProviders(country) {
  providersEl.replaceChildren();
  watchLinkUrl = country?.link || "";
  watchLink.hidden = !watchLinkUrl;
  if (!country) {
    providersEl.textContent = "Nothing listed in this region.";
    return;
  }
  let any = false;
  for (const [key, label] of WATCH_GROUPS) {
    const list = country[key];
    if (!list?.length) continue;
    any = true;
    const heading = document.createElement("div");
    heading.className = "provider-label";
    heading.textContent = label;
    const row = document.createElement("div");
    row.className = "provider-row";
    [...list]
      .sort((a, b) => a.display_priority - b.display_priority)
      .forEach((provider) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "provider";
        button.title = provider.provider_name;
        button.setAttribute("aria-label", provider.provider_name);
        const img = document.createElement("img");
        img.alt = "";
        img.src = posterUrl(provider.logo_path, "w45");
        button.append(img);
        button.addEventListener("click", () => {
          if (watchLinkUrl) openTab(watchLinkUrl);
        });
        row.append(button);
      });
    providersEl.append(heading, row);
  }
  if (!any) providersEl.textContent = "Nothing listed in this region.";
}

async function tmdb(path, params = {}, signal) {
  if (!hasKey()) throw new Error("Add your TMDB API key in keys.js, then reload.");
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", tmdbApiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { signal });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.status_message || "TMDB request failed.");
  return data;
}

async function runSearch() {
  const query = movieTitleInput.value.trim();
  if (query.length < 2) {
    suggestions = [];
    renderSuggestions();
    return;
  }
  if (!hasKey()) {
    showError("Add your TMDB API key in keys.js, then reload.");
    return;
  }
  searchAbort?.abort();
  searchAbort = new AbortController();
  try {
    const data = await tmdb("/search/movie", {
      query,
      include_adult: "false",
      language: "en-US",
    }, searchAbort.signal);
    if (movieTitleInput.value.trim() !== query) return;
    const ranked = rankResults(data.results || [], query);
    const useYear = detectedYear && query === detectedTitle;
    const exact = useYear
      ? ranked.filter((movie) => titlesMatch(movie.title, query) && yearOf(movie) === detectedYear)
      : [];
    if (exact.length === 1) {
      selectMovie(exact[0]);
      return;
    }
    suggestions = ranked.slice(0, 5);
    highlight = 0;
    renderSuggestions();
    showError(suggestions.length === 0 ? "No movies found." : "");
  } catch (error) {
    if (error.name === "AbortError") return;
    suggestions = [];
    renderSuggestions();
    showError(error.message || "Couldn't reach TMDB.");
  }
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 300);
}

function titlesMatch(left, right) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function rankResults(list, query) {
  if (!detectedYear || query !== detectedTitle) return list;
  return list
    .map((movie, index) => ({ movie, index }))
    .sort((a, b) => {
      const ay = yearOf(a.movie) === detectedYear ? 0 : 1;
      const by = yearOf(b.movie) === detectedYear ? 0 : 1;
      return ay - by || a.index - b.index;
    })
    .map((item) => item.movie);
}

async function readTab(tabId, world) {
  const options = {
    target: { tabId },
    func: readNowPlaying,
  };
  if (world) options.world = world;
  const [injected] = await ext.scripting.executeScript(options);
  return injected?.result || null;
}

async function detectPlaying() {
  const tabs = ext?.tabs;
  const scripting = ext?.scripting;
  if (!tabs?.query || !scripting?.executeScript) return null;
  try {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    if (tab.url && !hostCanDetect(tab.url)) return null;
    const isolated = await readTab(tab.id);
    const needsMemory = !isolated?.title || !isolated?.year || isolated.via === "script";
    const onNetflix = isolated?.service === "Netflix" || /netflix\.com/i.test(tab.url || "");
    if (!needsMemory || !onNetflix) return isolated?.title ? isolated : null;
    try {
      const mainWorld = await readTab(tab.id, "MAIN");
      return mergePlaying(isolated, mainWorld);
    } catch {
      return isolated?.title ? isolated : null;
    }
  } catch {
    return null;
  }
}

function applyPlaying(found) {
  if (!found?.title || movieTitleInput.value.trim()) return;
  detectedTitle = found.title;
  detectedYear = found.year || "";
  const yearBit = detectedYear ? ` (${detectedYear})` : "";
  detectedNote.hidden = false;
  detectedNote.textContent = `Playing on ${found.service}: ${found.title}${yearBit}`;
  movieTitleInput.value = found.title;
  if (hasKey()) runSearch();
}

async function loadWatch(movie) {
  const region = regionSelect.value;
  providersEl.textContent = "Checking streaming…";
  watchLink.hidden = true;
  watchLinkUrl = "";
  try {
    const data = await tmdb(`/movie/${movie.id}/watch/providers`);
    if (selectedMovie !== movie || regionSelect.value !== region) return;
    renderProviders(data.results?.[region]);
  } catch (error) {
    if (selectedMovie !== movie) return;
    providersEl.textContent = "";
    showError(error.message || "Couldn't load where to watch.");
  }
}

async function loadExternalIds(movie) {
  try {
    const data = await tmdb(`/movie/${movie.id}/external_ids`);
    if (selectedMovie !== movie) return;
    movie.imdbId = data.imdb_id || "";
  } catch {
    if (selectedMovie !== movie) return;
    movie.imdbId = "";
  }
  movie.imdbChecked = true;
}

function selectMovie(movie) {
  selectedMovie = {
    id: movie.id,
    title: movie.title,
    release_date: movie.release_date || "",
    poster_path: movie.poster_path || "",
    imdbId: "",
    imdbChecked: false,
  };
  movieTitleInput.value = selectedMovie.title;
  suggestions = [];
  renderSuggestions();
  renderSelection();
  updatePrompt();
  showError("");
  loadWatch(selectedMovie);
  loadExternalIds(selectedMovie);
}

function clearMovie() {
  selectedMovie = null;
  renderSelection();
  updatePrompt();
  movieTitleInput.focus();
  movieTitleInput.select();
}

function sourceUrl(source, movie) {
  if (source === "letterboxd") return `https://letterboxd.com/tmdb/${movie.id}`;
  if (source === "tmdb") return `https://www.themoviedb.org/movie/${movie.id}`;
  if (source === "imdb") {
    return movie.imdbId
      ? `https://www.imdb.com/title/${movie.imdbId}/`
      : `https://www.imdb.com/find/?q=${encodeURIComponent(movie.title)}`;
  }
  if (source === "rottenTomatoes") {
    return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`;
  }
  return `https://www.metacritic.com/search/${encodeURIComponent(movie.title)}/`;
}

function openTab(url) {
  const tabs = ext?.tabs;
  if (tabs?.create) tabs.create({ url });
  else window.open(url, "_blank", "noopener");
}

async function openMovie(source) {
  if (!selectedMovie) {
    showError("Pick a movie from the list.");
    return;
  }
  if (!source) {
    showError("Choose a site.");
    return;
  }
  if (source === "imdb" && !selectedMovie.imdbChecked) await loadExternalIds(selectedMovie);
  openTab(sourceUrl(source, selectedMovie));
}

function fillRegions(selected) {
  regionSelect.replaceChildren();
  for (const [code, label] of REGIONS) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    regionSelect.append(option);
  }
  if (selected && !REGIONS.some(([code]) => code === selected)) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = selected;
    regionSelect.append(option);
  }
  regionSelect.value = selected || defaultRegion();
}

function inRegion(x, y, region) {
  return x >= region.x1 && x <= region.x2 && y >= region.y1 && y <= region.y2;
}

async function init() {
  const playingPromise = detectPlaying();
  if (!hasKey()) setupNote.hidden = false;

  const saved = await storageGet(["theme", "source", "region"]);
  let theme = saved.theme;
  if (theme == null || theme === "") {
    const legacy = localStorage.getItem("theme");
    if (legacy !== null) theme = legacy || "blue";
    else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) theme = "light";
    else theme = "dark";
  }
  if (theme === "") theme = "blue";
  applyTheme(theme);
  if (saved.theme == null) storageSet({ theme });

  fillRegions(saved.region || defaultRegion());
  if (saved.source) selectSource(saved.source, false);

  document.getElementById("themeImage").addEventListener("click", (event) => {
    const dimensions = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - dimensions.left;
    const y = event.clientY - dimensions.top;
    const width = dimensions.width;
    const height = dimensions.height;
    const areas = [
      [{ x1: 0, y1: 0, x2: width / 3, y2: height / 2 }, "blue"],
      [{ x1: width / 3, y1: 0, x2: (2 / 3) * width, y2: height / 2 }, "green"],
      [{ x1: (2 / 3) * width, y1: 0, x2: width, y2: height / 2 }, "yellow"],
      [{ x1: 0, y1: height / 2, x2: width / 3, y2: height }, "purple"],
      [{ x1: width / 3, y1: height / 2, x2: (2 / 3) * width, y2: height }, "dark"],
      [{ x1: (2 / 3) * width, y1: height / 2, x2: width, y2: height }, "light"],
    ];
    const match = areas.find(([area]) => inRegion(x, y, area));
    const next = match ? match[1] : "blue";
    applyTheme(next);
    storageSet({ theme: next });
    localStorage.setItem("theme", next === "blue" ? "" : next);
  });

  icons.forEach((icon) => {
    const choose = () => {
      selectSource(icon.dataset.source);
      if (selectedMovie) openMovie(icon.dataset.source).catch((error) => showError(error.message));
    };
    icon.addEventListener("click", choose);
    icon.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
  });

  movieTitleInput.addEventListener("input", () => {
    if (movieTitleInput.value.trim() !== detectedTitle) {
      detectedTitle = "";
      detectedYear = "";
      detectedNote.hidden = true;
    }
    selectedMovie = null;
    renderSelection();
    updatePrompt();
    showError("");
    scheduleSearch();
  });

  movieTitleInput.addEventListener("keydown", (event) => {
    if (suggestionsEl.hidden) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight = (highlight + 1) % suggestions.length;
      renderSuggestions();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight = (highlight - 1 + suggestions.length) % suggestions.length;
      renderSuggestions();
    } else if (event.key === "Escape") {
      suggestions = [];
      renderSuggestions();
    }
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!suggestionsEl.hidden && suggestions[highlight]) {
      selectMovie(suggestions[highlight]);
      return;
    }
    if (selectedMovie && selectedSource) {
      openMovie(selectedSource).catch((error) => showError(error.message));
      return;
    }
    runSearch();
  });

  clearSelection.addEventListener("click", clearMovie);

  regionSelect.addEventListener("change", () => {
    storageSet({ region: regionSelect.value });
    if (selectedMovie) loadWatch(selectedMovie);
  });

  watchLink.addEventListener("click", () => {
    if (watchLinkUrl) openTab(watchLinkUrl);
  });

  const playing = await playingPromise;
  applyPlaying(playing);
}

init();
