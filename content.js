if (typeof browser === "undefined") {
  var browser = chrome;
}

browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.selectFirstResult) {
    setTimeout(function () {
      var firstResultLink = document.querySelector(".g h3 a");
      if (firstResultLink) {
        firstResultLink.click();
      }
    }, 2000);
  }
});

browser.runtime.sendMessage({ selectFirstResult: true });
