// panel.js - DevTools 面板邏輯

(function () {
  // ========== 資料儲存 ==========
  const messages = [];
  let currentFilter = 'ALL';
  let searchText = '';
  let selectedIndex = -1;

  // ========== DOM 元素 ==========
  const messageList = document.getElementById('message-list');
  const emptyState = document.getElementById('empty-state');
  const detailPanel = document.getElementById('detail-panel');
  const detailLabel = document.getElementById('detail-label');
  const detailContent = document.getElementById('detail-content');
  const msgCount = document.getElementById('msg-count');
  const searchInput = document.getElementById('search-input');
  const autoScrollCheckbox = document.getElementById('auto-scroll');

  // ========== 工具函式 ==========

  function parsePayload(payload) {
    if (typeof payload !== 'string') {
      return { format: 'TEXT', parsed: String(payload) };
    }

    // 嘗試 JSON
    try {
      const obj = JSON.parse(payload);
      return { format: 'JSON', parsed: obj };
    } catch (e) {}

    // 嘗試 XML
    const trimmed = payload.trim();
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(payload, 'text/xml');
        if (!doc.querySelector('parsererror')) {
          return { format: 'XML', parsed: payload, xmlDoc: doc };
        }
      } catch (e) {}
    }

    return { format: 'TEXT', parsed: payload };
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' +
      String(d.getMilliseconds()).padStart(3, '0');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function syntaxHighlightJson(obj, indent) {
    indent = indent || 0;
    const pad = '  '.repeat(indent);
    const pad1 = '  '.repeat(indent + 1);

    if (obj === null) {
      return '<span class="json-null">null</span>';
    }
    if (typeof obj === 'boolean') {
      return '<span class="json-boolean">' + obj + '</span>';
    }
    if (typeof obj === 'number') {
      return '<span class="json-number">' + obj + '</span>';
    }
    if (typeof obj === 'string') {
      return '<span class="json-string">"' + escapeHtml(obj) + '"</span>';
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      const items = obj.map(function (item) {
        return pad1 + syntaxHighlightJson(item, indent + 1);
      });
      return '[\n' + items.join(',\n') + '\n' + pad + ']';
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      const entries = keys.map(function (key) {
        return pad1 + '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' +
          syntaxHighlightJson(obj[key], indent + 1);
      });
      return '{\n' + entries.join(',\n') + '\n' + pad + '}';
    }
    return escapeHtml(String(obj));
  }

  function syntaxHighlightXml(xmlStr) {
    return escapeHtml(xmlStr)
      .replace(/&lt;(\/?)([\w:-]+)/g,
        '&lt;$1<span class="xml-tag">$2</span>')
      .replace(/([\w:-]+)=&quot;([^&]*)&quot;/g,
        '<span class="xml-attr">$1</span>=&quot;<span class="xml-value">$2</span>&quot;');
  }

  function formatXml(xml) {
    let formatted = '';
    let indentLevel = 0;
    const parts = xml.replace(/(>)(<)(\/*)/g, '$1\n$2$3').split('\n');
    parts.forEach(function (part) {
      if (part.match(/^<\/\w/)) indentLevel--;
      formatted += '  '.repeat(Math.max(0, indentLevel)) + part + '\n';
      if (part.match(/^<\w[^>]*[^/]>.*$/)) indentLevel++;
    });
    return formatted.trim();
  }

  // ========== 渲染 ==========

  function shouldShow(msg) {
    if (currentFilter !== 'ALL' && msg.type !== currentFilter) {
      return false;
    }
    if (searchText) {
      const s = searchText.toLowerCase();
      const inUrl = (msg.url || '').toLowerCase().includes(s);
      const inPayload = (msg.payload || '').toLowerCase().includes(s);
      return inUrl || inPayload;
    }
    return true;
  }

  function createMessageElement(msg, index) {
    const div = document.createElement('div');
    div.className = 'message-item';
    div.dataset.index = index;

    // 方向
    const dirDiv = document.createElement('div');
    dirDiv.className = 'direction ' + msg.type.toLowerCase();
    const dirLabels = {
      SEND: 'SEND',
      RECEIVE: 'RECV',
      CONNECT: 'OPEN',
      CLOSE: 'CLOSE',
      ERROR: 'ERR'
    };
    dirDiv.textContent = dirLabels[msg.type] || msg.type;
    div.appendChild(dirDiv);

    // 時間
    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.textContent = formatTime(msg.timestamp);
    div.appendChild(timeDiv);

    // 格式標籤 (只有 SEND/RECEIVE 才有 payload)
    const badgeDiv = document.createElement('div');
    badgeDiv.className = 'format-badge';
    if (msg.payload) {
      const parsed = parsePayload(msg.payload);
      const badge = document.createElement('span');
      badge.className = 'badge-' + parsed.format.toLowerCase();
      badge.textContent = parsed.format;
      badgeDiv.appendChild(badge);
    }
    div.appendChild(badgeDiv);

    // 預覽
    const previewDiv = document.createElement('div');
    previewDiv.className = 'preview';
    if (msg.type === 'CONNECT') {
      previewDiv.innerHTML = '<span class="ws-url">' + escapeHtml(msg.url) + '</span>';
    } else if (msg.type === 'CLOSE') {
      previewDiv.textContent = 'Code: ' + msg.code + (msg.reason ? ' - ' + msg.reason : '');
    } else if (msg.type === 'ERROR') {
      previewDiv.textContent = 'WebSocket Error';
    } else {
      previewDiv.textContent = msg.payload ? msg.payload.substring(0, 200) : '';
    }
    div.appendChild(previewDiv);

    div.addEventListener('click', function () {
      selectMessage(index);
    });

    return div;
  }

  function renderMessages() {
    // 清除舊的（保留 empty-state）
    const items = messageList.querySelectorAll('.message-item');
    items.forEach(function (el) { el.remove(); });

    let visibleCount = 0;
    messages.forEach(function (msg, index) {
      if (shouldShow(msg)) {
        messageList.appendChild(createMessageElement(msg, index));
        visibleCount++;
      }
    });

    emptyState.style.display = visibleCount === 0 ? 'flex' : 'none';
    msgCount.textContent = visibleCount + ' / ' + messages.length + ' messages';
  }

  function addMessage(msg) {
    messages.push(msg);
    emptyState.style.display = 'none';

    if (shouldShow(msg)) {
      const el = createMessageElement(msg, messages.length - 1);
      messageList.appendChild(el);

      if (autoScrollCheckbox.checked) {
        messageList.scrollTop = messageList.scrollHeight;
      }
    }

    const visibleCount = messageList.querySelectorAll('.message-item').length;
    msgCount.textContent = visibleCount + ' / ' + messages.length + ' messages';
  }

  function selectMessage(index) {
    selectedIndex = index;
    const msg = messages[index];

    // 清除選取樣式
    messageList.querySelectorAll('.message-item').forEach(function (el) {
      el.classList.remove('selected');
      if (parseInt(el.dataset.index) === index) {
        el.classList.add('selected');
      }
    });

    // 顯示詳細
    if (!msg.payload && msg.type !== 'CONNECT') {
      detailLabel.textContent = msg.type + ' - ' + (msg.url || '');
      detailContent.textContent = msg.type === 'CLOSE'
        ? 'Code: ' + msg.code + '\nReason: ' + (msg.reason || '(none)')
        : 'No payload data';
      detailPanel.classList.add('visible');
      return;
    }

    if (msg.type === 'CONNECT') {
      detailLabel.textContent = 'CONNECT';
      detailContent.innerHTML = '<span class="json-key">URL:</span> ' + escapeHtml(msg.url);
      detailPanel.classList.add('visible');
      return;
    }

    const parsed = parsePayload(msg.payload);
    detailLabel.textContent = msg.type + ' [' + parsed.format + '] - ' + msg.url;

    if (parsed.format === 'JSON') {
      detailContent.innerHTML = syntaxHighlightJson(parsed.parsed);
    } else if (parsed.format === 'XML') {
      const formatted = formatXml(parsed.parsed);
      detailContent.innerHTML = syntaxHighlightXml(formatted);
    } else {
      detailContent.textContent = parsed.parsed;
    }

    detailPanel.classList.add('visible');
  }

  // ========== 事件綁定 ==========

  // 清除
  document.getElementById('btn-clear').addEventListener('click', function () {
    messages.length = 0;
    selectedIndex = -1;
    detailPanel.classList.remove('visible');
    renderMessages();
  });

  // 篩選按鈕
  document.querySelectorAll('[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter]').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderMessages();
    });
  });

  // 搜尋
  searchInput.addEventListener('input', function () {
    searchText = this.value;
    renderMessages();
  });

  // 關閉詳細面板
  document.getElementById('btn-close-detail').addEventListener('click', function () {
    detailPanel.classList.remove('visible');
    selectedIndex = -1;
    messageList.querySelectorAll('.message-item').forEach(function (el) {
      el.classList.remove('selected');
    });
  });

  // ========== 建立與 background 的連線 ==========

  const port = chrome.runtime.connect({ name: 'devtools-page' });
  port.postMessage({
    name: 'init',
    tabId: chrome.devtools.inspectedWindow.tabId
  });

  port.onMessage.addListener(function (message) {
    addMessage(message);
  });

})();
