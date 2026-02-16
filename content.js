// content.js - 橋接 inject.js (MAIN World) 與擴充功能 (ISOLATED World)
// inject.js 已由 manifest.json 的 "world": "MAIN" 自動注入，不需手動插入 <script>

// 監聽從 inject.js 傳來的 CustomEvent，轉發給 background
window.addEventListener('__WS_SNIFFER__', function (event) {
  const data = event.detail;
  if (!data || data.source !== 'WS_SNIFFER') {
    return;
  }

  // 標記來源 frame 資訊
  data.frameUrl = location.href;

  try {
    chrome.runtime.sendMessage({
      action: 'ws_message',
      data: data
    });
  } catch (e) {
    // 擴充功能可能尚未準備好，忽略錯誤
  }
});
