import browser from './browser.js';


if(browser ==="safari"){
  window.addEventListener("message", function(event) {
    if (event.source != window) return;
    if (event.data.selectFirstResult) {
      setTimeout(function () {
        const firstResultLink = document.querySelector(".g h3 a");
        if (firstResultLink) {
          firstResultLink.click();
        }
      }, 2000);
    }
  }, false);
  window.postMessage({ selectFirstResult: true }, "*");
} else {
  browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.selectFirstResult) {
      setTimeout(function () {
        const firstResultLink = document.querySelector(".g h3 a");
        if (firstResultLink) {
          firstResultLink.click();
        }
      }, 2000);
    }
  });
  browser.runtime.sendMessage({ selectFirstResult: true });
}
