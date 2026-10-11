![LoggdCover (1)](https://github.com/McMeans/loggd/assets/121998941/2a42e457-ae11-4aaf-ac94-7afd77e9f5c3)
# _Loggd_

This is a web extension that skips searching steps and directly brings you to the page of a movie on one of various rating websites. We currently support Letterboxd, IMDb, TMDB, Rotten Tomatoes, and Metacritic. This program was built in collaboration with GPT 3.5, which constructed the intial backend as I (Luke McMeans) constructed the frontend.

Search for a movie and select it. Then open it on Letterboxd, IMDb, TMDB, Rotten Tomatoes, or Metacritic. Where to watch opens the movie's streaming page. If a streaming tab is already playing, the popup can fill in that title.

**_Add to Chrome_**: https://chromewebstore.google.com/detail/loggd/ecbepjhmbpkgmdejfekkmpoeijkcophm

**_Add to Firefox_**: https://addons.mozilla.org/en-US/firefox/addon/loggd/

**[ ! ] NOTE:** Movie search uses a TMDB API key. Copy `keys.example.js` to `keys.js` and paste your key there. `keys.js` is gitignored. Do not commit it.
