const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3210;

// ========== HTTP Server（提供測試頁面）==========
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// ========== WebSocket Server ==========
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('[WS] 新連線');

  // 連線後立即發送一筆 JSON
  ws.send(JSON.stringify({
    type: 'welcome',
    message: '歡迎連線！這是 JSON 格式的測試訊息',
    timestamp: new Date().toISOString()
  }));

  // 每 3 秒推送不同格式的資料
  let count = 0;
  const interval = setInterval(() => {
    count++;

    if (count % 3 === 1) {
      // JSON 格式
      ws.send(JSON.stringify({
        type: 'update',
        data: {
          price: (Math.random() * 1000).toFixed(2),
          volume: Math.floor(Math.random() * 10000),
          symbol: 'AAPL'
        },
        seq: count,
        timestamp: new Date().toISOString()
      }));
    } else if (count % 3 === 2) {
      // XML 格式
      ws.send(
        `<?xml version="1.0" encoding="UTF-8"?>
<notification>
  <id>${count}</id>
  <type>alert</type>
  <message>這是 XML 格式的第 ${count} 筆推送</message>
  <priority>high</priority>
  <timestamp>${new Date().toISOString()}</timestamp>
</notification>`
      );
    } else {
      // 純文字
      ws.send(`[TEXT] 這是純文字訊息 #${count} - ${new Date().toLocaleTimeString()}`);
    }
  }, 3000);

  // 收到客戶端訊息時回應
  ws.on('message', (data) => {
    const msg = data.toString();
    console.log('[WS] 收到:', msg);

    // Echo 回去並加上 server 資訊
    try {
      const parsed = JSON.parse(msg);
      ws.send(JSON.stringify({
        type: 'echo',
        original: parsed,
        serverTime: new Date().toISOString()
      }));
    } catch {
      ws.send(JSON.stringify({
        type: 'echo',
        original: msg,
        serverTime: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] 連線關閉');
    clearInterval(interval);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ 測試伺服器已啟動`);
  console.log(`📄 測試頁面: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket:  ws://localhost:${PORT}`);
  console.log(`\n按 Ctrl+C 停止\n`);
});
