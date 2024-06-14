import { hiddenAPI, hiddenCX } from './keys.js';
import browser from './browser.js';

document.addEventListener("DOMContentLoaded", function () {
  const movieTitleInput = document.getElementById("movieTitle");
  const icons = document.querySelectorAll(".icon-wrapper");
  const selectedSourceText = document.getElementById("selectedSource");

  movieTitleInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      searchOnSourceSelection();
    }
  });

  icons.forEach(function (icon, index) {
    icon.addEventListener("click", function () {
      icons.forEach(function (otherIcon) {
        otherIcon.classList.remove("selected");
      });
      icon.classList.add("selected");

      if (icon.dataset.source === "letterboxd") {
        selectedSourceText.textContent = "Letterboxd";
      } else if (icon.dataset.source === "imdb") {
        selectedSourceText.textContent = "IMDb";
      } else if (icon.dataset.source === "tmdb") {
        selectedSourceText.textContent = "TMDB";
      } else if (icon.dataset.source === "rottenTomatoes") {
        selectedSourceText.textContent = "Rotten Tomatoes";
      } else if (icon.dataset.source === "metacritic") {
        selectedSourceText.textContent = "Metacritic";
      }
    });
  });
});

function searchOnSourceSelection() {
  const movieTitle = document.getElementById("movieTitle").value.trim();
  const selectedSource = getSelectedSource();
  const errorMessage = document.getElementById("errorMessage");

  if (movieTitle === "" || selectedSource === "") {
    errorMessage.className = "errorVisible";
    errorMessage.textContent = "Please enter a movie title and select a source.";
    return;
  }

  const searchQuery = `${movieTitle} "${selectedSource}"`;
  const apiKey = hiddenAPI; // API Key
  const cx = hiddenCX; // CX Key

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(searchQuery)}`;
  fetch(url)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      if (data.items && data.items.length > 0 && data.items[0].link) {
        errorMessage.className = "";
        if(browser === "safari"){
          const newTab = safari.application.activeBrowserWindow.openTab();
          newTab.url = data.items[0].link;
        } else {
          browser.tabs.create({ url: data.items[0].link });
        }
      } else {
        errorMessage.className = "errorVisible";
        errorMessage.textContent = "No Search Results Found.";
        return;
      }
    })
    .catch(function (error) {
      console.error("Error:", error);
    });
}

function getSelectedSource() {
  const sources = document.querySelectorAll(".icon-wrapper.selected");
  if (sources.length > 0) {
    return sources[0].getAttribute("data-source");
  }
  return "";
}

document.getElementById("themeImage").addEventListener('click', function(event) {
  const dimensions = document.querySelector(".themeImage").getBoundingClientRect();
  const height = dimensions.height;
  const width = dimensions.width;
  const x = event.clientX - dimensions.left;
  const y = event.clientY - dimensions.top;
  
  const blueRegion = { x1: 0, y1: 0, x2: width / 3, y2: height / 2 };
  const greenRegion = { x1: width / 3, y1: 0, x2: (2 / 3) * width, y2: height / 2 };
  const yellowRegion = { x1: (2 / 3) * width, y1: 0, x2: width, y2: height / 2 };
  const purpleRegion = { x1: 0, y1: height / 2, x2: width / 3, y2: height };
  const darkRegion = { x1: width / 3, y1: height / 2, x2: (2 / 3) * width, y2: height };
  const lightRegion = { x1: (2 / 3) * width, y1: height / 2, x2: width, y2: height };
  
  var theme = "";
  if(inRegion(x, y, blueRegion)){
    theme = "";
  } else if(inRegion(x, y, greenRegion)){
    theme = "green";
  } else if(inRegion(x, y, yellowRegion)){
    theme = "yellow";
  } else if(inRegion(x, y, purpleRegion)){
    theme = "purple";
  } else if(inRegion(x, y, darkRegion)){
    theme = "dark";
  } else if(inRegion(x, y, lightRegion)){
    theme = "light";
  }
  setTheme(theme);
  localStorage.setItem('theme', theme);
});

function setTheme(theme){
  const body = document.getElementById('body');
  const prevTheme = body.className;
  body.className = theme;

  const defaultLogo = document.getElementById('defaultLogo');
  const lightLogo = document.getElementById('lightLogo');
  const iconWrappers = document.querySelectorAll(".icon-wrapper");
  const sourceText = document.querySelector(".source-text");
  const searchIcon = document.querySelector(".search-icon");
  const movieTitle = document.querySelector(".movie-title");
  const footer = document.querySelector("footer");
  const sub = document.querySelector("sub");
  if(theme === "light"){
    defaultLogo.className = "hiddenLogo";
    lightLogo.className = "visibleLogo";
    iconWrappers.forEach(icon => {
      icon.classList.add('icon-wrapper-light')
      icon.classList.remove('icon-wrapper-dark')
    });
    sourceText.classList.add('source-text-light');
    sourceText.classList.remove('source-text-dark');
    searchIcon.classList.add('search-icon-light');
    searchIcon.classList.remove('search-icon-dark');
    movieTitle.classList.add('movie-title-light');
    movieTitle.classList.remove('movie-title-dark');
    footer.classList.add('footer-light');
    footer.classList.remove('footer-dark');
    sub.classList.add('sub-light');
    sub.classList.remove('sub-dark');
  } else if (prevTheme === "light") {
    defaultLogo.className = "visibleLogo";
    lightLogo.className = "hiddenLogo";
    iconWrappers.forEach(icon => {
      icon.classList.add('icon-wrapper-dark')
      icon.classList.remove('icon-wrapper-light')
    });
    sourceText.classList.add('source-text-dark');
    sourceText.classList.remove('source-text-light');
    searchIcon.classList.add('search-icon-dark');
    searchIcon.classList.remove('search-icon-light');
    movieTitle.classList.add('movie-title-dark');
    movieTitle.classList.remove('movie-title-light');
    footer.classList.add('footer-dark');
    footer.classList.remove('footer-light');
    sub.classList.add('sub-dark');
    sub.classList.remove('sub-light');
  }
}

function inRegion(x, y, region){
  return (x >= region.x1 && x <= region.x2 && y >= region.y1 && y <= region.y2);
}

window.onload = function() {
  try{
    setTheme(localStorage.getItem('theme'));
  } catch(Exception) {
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches){
      setTheme("light")
    } else {
      setTheme("dark")
    }
  }
};