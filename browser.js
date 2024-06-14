const userAgent = navigator.userAgent;
if (userAgent.includes('Chrome') || userAgent.includes('Chromium')) {
    browser = chrome;
} else {
    browser = browser;
}
export default browser;