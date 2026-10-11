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
const openEl = document.getElementById("open");
const watchEl = document.getElementById("watch");
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
  const code = (navigator.language || "en-US").split("-").pop().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "US";
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
  if (site && title) prompt.textContent = `Open ${title} on ${site}`;
  else if (site) prompt.textContent = `${site} selected`;
  else prompt.textContent = "";
}

function applyTheme(theme) {
  const name = theme || "blue";
  body.className = name;
  const darkInk = name === "light" || name === "yellow";
  defaultLogo.classList.toggle("hiddenLogo", darkInk);
  defaultLogo.classList.toggle("visibleLogo", !darkInk);
  lightLogo.classList.toggle("hiddenLogo", !darkInk);
  lightLogo.classList.toggle("visibleLogo", darkInk);
  document.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.setAttribute("aria-pressed", swatch.dataset.theme === name ? "true" : "false");
  });
}

function selectSource(source) {
  selectedSource = SOURCE_LABELS[source] ? source : "";
  icons.forEach((icon) => {
    const on = icon.dataset.source === selectedSource;
    icon.classList.toggle("selected", on);
    icon.setAttribute("aria-pressed", on ? "true" : "false");
  });
  updatePrompt();
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
  const picked = Boolean(selectedMovie);
  selectionEl.hidden = !picked;
  openEl.hidden = !picked;
  watchEl.hidden = !picked;
  if (!picked) return;
  const src = posterUrl(selectedMovie.poster_path, "w92");
  selectionPoster.hidden = !src;
  if (src) selectionPoster.src = src;
  selectionTitle.textContent = selectedMovie.title;
  selectionYear.textContent = yearOf(selectedMovie);
}

function showWatchLink(link) {
  watchLinkUrl = link || "";
  watchLink.disabled = !watchLinkUrl;
  watchLink.textContent = watchLinkUrl ? "Where to watch" : "Nothing listed here";
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
  const region = defaultRegion();
  watchLink.disabled = true;
  watchLink.textContent = "Where to watch";
  watchLinkUrl = "";
  try {
    const data = await tmdb(`/movie/${movie.id}/watch/providers`);
    if (selectedMovie !== movie) return;
    showWatchLink(data.results?.[region]?.link);
  } catch (error) {
    if (selectedMovie !== movie) return;
    showWatchLink("");
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
  selectSource("");
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

async function init() {
  const playingPromise = detectPlaying();
  if (!hasKey()) setupNote.hidden = false;

  const saved = await storageGet(["theme"]);
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

  document.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const next = swatch.dataset.theme || "blue";
      applyTheme(next);
      storageSet({ theme: next });
      localStorage.setItem("theme", next === "blue" ? "" : next);
    });
  });

  icons.forEach((icon) => {
    icon.addEventListener("click", () => {
      selectSource(icon.dataset.source);
      if (selectedMovie) openMovie(icon.dataset.source).catch((error) => showError(error.message));
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

  watchLink.addEventListener("click", () => {
    if (watchLinkUrl) openTab(watchLinkUrl);
  });

  const playing = await playingPromise;
  applyPlaying(playing);
}

init();
