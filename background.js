// background.js - Service Worker，負責注入腳本與轉發訊息

const devtoolsConnections = {};
const popupConnections = {};
const messageStore = {};
const injectedTabs = new Set(); // 記錄已注入的 tab
const MAX_STORE = 500;

// 程式化注入腳本到指定 tab
async function injectScripts(tabId) {
  if (injectedTabs.has(tabId)) return;

  try {
    // 先注入 inject.js 到 MAIN world（攔截 WebSocket）
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['inject.js'],
      world: 'MAIN',
      injectImmediately: true
    });

    // 再注入 content.js 到 ISOLATED world（橋接通訊）
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['content.js'],
      injectImmediately: true
    });

    injectedTabs.add(tabId);

    // 更新 icon 狀態表示已啟用
    chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId: tabId });
  } catch (e) {
    // 無法注入（例如 chrome:// 頁面），忽略
    console.log('Cannot inject into tab', tabId, e.message);
  }
}

// 當 tab 關閉或導航時，清理狀態
chrome.tabs.onRemoved.addListener(function (tabId) {
  injectedTabs.delete(tabId);
  delete messageStore[tabId];
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === 'loading') {
    injectedTabs.delete(tabId);
    delete messageStore[tabId];
  }
});

// 連線處理
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === 'devtools-page') {
    const listener = function (message) {
      if (message.name === 'init') {
        const tabId = message.tabId;
        devtoolsConnections[tabId] = port;

        // DevTools 開啟時自動注入
        injectScripts(tabId);

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

        // Popup 開啟時自動注入（activeTab 授權）
        injectScripts(tabId);

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
  if (!sender.tab || request.action !== 'ws_message') return;

  const tabId = sender.tab.id;
  const data = request.data;

  if (!messageStore[tabId]) messageStore[tabId] = [];
  messageStore[tabId].push(data);
  if (messageStore[tabId].length > MAX_STORE) messageStore[tabId].shift();

  // 更新 badge 計數
  const count = messageStore[tabId].length;
  chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count), tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#4caf50', tabId: tabId });

  if (tabId in devtoolsConnections) {
    devtoolsConnections[tabId].postMessage(data);
  }
  if (tabId in popupConnections) {
    popupConnections[tabId].postMessage(data);
  }
});
