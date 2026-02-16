// content.js - 橋接 inject.js (Main World) 與擴充功能 (Isolated World)

// 1. 將 inject.js 注入到網頁的 Main World
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

// 2. 監聽從 inject.js 傳來的 postMessage，轉發給 background
window.addEventListener('message', function (event) {
  if (event.source !== window || !event.data || event.data.source !== 'WS_SNIFFER') {
    return;
  }

  try {
    chrome.runtime.sendMessage({
      action: 'ws_message',
      data: event.data
    });
  } catch (e) {
    // 擴充功能可能尚未準備好，忽略錯誤
  }
});
