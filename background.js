// background.js - Service Worker，負責轉發訊息到 DevTools 面板

// 記錄每個 tab 對應的 DevTools 連線
const connections = {};

// 暫存訊息：當 DevTools 尚未連線時，先存起來
const pendingMessages = {};
const MAX_PENDING = 200;

chrome.runtime.onConnect.addListener(function (port) {
  const listener = function (message) {
    if (message.name === 'init') {
      const tabId = message.tabId;
      connections[tabId] = port;

      // 發送暫存的訊息
      if (pendingMessages[tabId]) {
        pendingMessages[tabId].forEach(function (msg) {
          port.postMessage(msg);
        });
        delete pendingMessages[tabId];
      }
    }
  };

  port.onMessage.addListener(listener);

  port.onDisconnect.addListener(function () {
    port.onMessage.removeListener(listener);
    // 清除斷開的連線
    for (const tabId in connections) {
      if (connections[tabId] === port) {
        delete connections[tabId];
        break;
      }
    }
  });
});

// 接收來自 content.js 的 WebSocket 資料
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (!sender.tab || request.action !== 'ws_message') {
    return;
  }

  const tabId = sender.tab.id;

  if (tabId in connections) {
    connections[tabId].postMessage(request.data);
  } else {
    // DevTools 尚未連線，暫存訊息
    if (!pendingMessages[tabId]) {
      pendingMessages[tabId] = [];
    }
    if (pendingMessages[tabId].length < MAX_PENDING) {
      pendingMessages[tabId].push(request.data);
    }
  }
});
