// Remove previous session
chrome.runtime.onStartup.addListener(function() {
  chrome.storage.local.get(null, function(data) {
    if (data.gpwUser && data.gpwUser.created) {
      chrome.storage.local.remove('gpwUser');
    }
  });
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  if (changeInfo.status === "complete" || changeInfo.url) {
    chrome.tabs.sendMessage(tabId, { message: 'URL_CHANGED' });
  }
})
