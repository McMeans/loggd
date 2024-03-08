document.addEventListener("DOMContentLoaded", function () {
    var errorMessage = document.getElementById("errorMessage");
    var movieTitleInput = document.getElementById("movieTitle");
    var icons = document.querySelectorAll(".icon-wrapper");
    var selectedSourceText = document.getElementById("selectedSource");
  
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

        if(icon.dataset.source === "letterboxd"){
          selectedSourceText.textContent = "Letterboxd";
        }
        else if(icon.dataset.source === "imdb"){
          selectedSourceText.textContent = "IMDb";
        }
        else if(icon.dataset.source === "rottenTomatoes"){
          selectedSourceText.textContent = "Rotten Tomatoes";
        }
        else if(icon.dataset.source === "metacritic"){
          selectedSourceText.textContent = "Metacritic";
        }

      });
    });

  });
  
  function searchOnSourceSelection() {
    var movieTitle = document.getElementById("movieTitle").value.trim();
    var selectedSource = getSelectedSource();
  
    if (movieTitle === "" || selectedSource === "") {
      var errorMessage = document.getElementById("errorMessage");
      errorMessage.textContent = "Please enter a movie title and select a source.";
      return;
    }
  
    var searchQuery = `${movieTitle} ${selectedSource}`;
    var apiKey = keys.hiddenAPI; // API Key
    var cx = keys.hiddenCX; // CX Key
  
    var url =
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(searchQuery)}`;
  
    fetch(url)
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (data.items && data.items.length > 0 && data.items[0].link) {
          chrome.tabs.create({ url: data.items[0].link });
        } else {
          console.log("No search results found.");
        }
      })
      .catch(function (error) {
        console.error("Error:", error);
      });
  }
  
  function getSelectedSource() {
    var sources = document.querySelectorAll(".icon-wrapper.selected");
    if (sources.length > 0) {
      return sources[0].getAttribute("data-source");
    }
    return "";
  }
  
