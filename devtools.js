// devtools.js - 在 F12 開發者工具中建立 WebSocket Sniffer 面板
chrome.devtools.panels.create(
  'WebSocket Sniffer',
  null,
  'panel.html'
);
