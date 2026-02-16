// inject.js - 注入到網頁 Main World，攔截 WebSocket 收發資料
(function () {
  const OriginalWebSocket = window.WebSocket;

  // 用來追蹤每個 WebSocket 連線的唯一 ID
  let connectionId = 0;

  function notify(detail) {
    // 使用 CustomEvent 確保同 frame 內 content.js 能收到
    window.dispatchEvent(new CustomEvent('__WS_SNIFFER__', {
      detail: JSON.parse(JSON.stringify(detail))
    }));
  }

  window.WebSocket = function (url, protocols) {
    const ws = protocols
      ? new OriginalWebSocket(url, protocols)
      : new OriginalWebSocket(url);

    const id = ++connectionId;

    // 通知：新連線建立
    notify({
      source: 'WS_SNIFFER',
      type: 'CONNECT',
      id: id,
      url: url,
      timestamp: Date.now()
    });

    // 攔截 send
    const originalSend = ws.send.bind(ws);
    ws.send = function (data) {
      let payload = data;
      if (data instanceof ArrayBuffer) {
        payload = '[ArrayBuffer] length=' + data.byteLength;
      } else if (data instanceof Blob) {
        payload = '[Blob] size=' + data.size;
      }

      notify({
        source: 'WS_SNIFFER',
        type: 'SEND',
        id: id,
        url: url,
        payload: payload,
        timestamp: Date.now()
      });
      return originalSend(data);
    };

    // 攔截 receive
    ws.addEventListener('message', function (event) {
      let payload = event.data;
      if (payload instanceof ArrayBuffer) {
        payload = '[ArrayBuffer] length=' + payload.byteLength;
      } else if (payload instanceof Blob) {
        payload = '[Blob] size=' + payload.size;
      }

      notify({
        source: 'WS_SNIFFER',
        type: 'RECEIVE',
        id: id,
        url: url,
        payload: payload,
        timestamp: Date.now()
      });
    });

    // 攔截 close
    ws.addEventListener('close', function (event) {
      notify({
        source: 'WS_SNIFFER',
        type: 'CLOSE',
        id: id,
        url: url,
        code: event.code,
        reason: event.reason,
        timestamp: Date.now()
      });
    });

    // 攔截 error
    ws.addEventListener('error', function () {
      notify({
        source: 'WS_SNIFFER',
        type: 'ERROR',
        id: id,
        url: url,
        timestamp: Date.now()
      });
    });

    return ws;
  };

  // 保持原型鏈和靜態屬性
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
})();
