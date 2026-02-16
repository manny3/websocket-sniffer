// background.js - Service Worker，負責轉發訊息到 DevTools 面板和 Popup

// 記錄每個 tab 對應的 DevTools 連線
const devtoolsConnections = {};
// 記錄每個 tab 對應的 Popup 連線
const popupConnections = {};

// 暫存訊息：每個 tab 最多保留最近的訊息
const messageStore = {};
const MAX_STORE = 500;

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === 'devtools-page') {
    const listener = function (message) {
      if (message.name === 'init') {
        const tabId = message.tabId;
        devtoolsConnections[tabId] = port;

        // 發送暫存的訊息
        if (messageStore[tabId]) {
          messageStore[tabId].forEach(function (msg) {
            port.postMessage(msg);
          });
        }
      }
    };

    port.onMessage.addListener(listener);
    port.onDisconnect.addListener(function () {
      port.onMessage.removeListener(listener);
      for (const tabId in devtoolsConnections) {
        if (devtoolsConnections[tabId] === port) {
          delete devtoolsConnections[tabId];
          break;
        }
      }
    });
  }

  if (port.name === 'popup') {
    const listener = function (message) {
      if (message.name === 'init') {
        const tabId = message.tabId;
        popupConnections[tabId] = port;

        // 發送暫存的訊息
        if (messageStore[tabId]) {
          messageStore[tabId].forEach(function (msg) {
            port.postMessage(msg);
          });
        }
      }
    };

    port.onMessage.addListener(listener);
    port.onDisconnect.addListener(function () {
      port.onMessage.removeListener(listener);
      for (const tabId in popupConnections) {
        if (popupConnections[tabId] === port) {
          delete popupConnections[tabId];
          break;
        }
      }
    });
  }
});

// 接收來自 content.js 的 WebSocket 資料
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (!sender.tab || request.action !== 'ws_message') {
    return;
  }

  const tabId = sender.tab.id;
  const data = request.data;

  // 儲存到 messageStore
  if (!messageStore[tabId]) {
    messageStore[tabId] = [];
  }
  messageStore[tabId].push(data);
  if (messageStore[tabId].length > MAX_STORE) {
    messageStore[tabId].shift();
  }

  // 更新 badge 計數
  const count = messageStore[tabId].length;
  chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count), tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId: tabId });

  // 轉發給 DevTools
  if (tabId in devtoolsConnections) {
    devtoolsConnections[tabId].postMessage(data);
  }

  // 轉發給 Popup
  if (tabId in popupConnections) {
    popupConnections[tabId].postMessage(data);
  }
});
