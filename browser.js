let browser;
const userAgent = navigator.userAgent;
if (isSafari && /Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
    browser = "safari";
} else if (typeof InstallTrigger !== 'undefined' && /Firefox/.test(userAgent) && !/Chrome/.test(userAgent)) {
    browser = browser;
} else {
    browser = chrome;
}

function isSafari() {
    return (/constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification)));
}

export default browser;