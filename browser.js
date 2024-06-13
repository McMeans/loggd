let browser;
const userAgent = navigator.userAgent;
if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
    browser = safari;
} else if (/Firefox/.test(userAgent)  && !/Chrome/.test(userAgent)) {
    browser = browser || browserExtension;
} else {
    browser = chrome;
}

export default browser;