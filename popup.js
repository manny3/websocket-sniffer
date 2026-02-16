// popup.js - Popup 面板邏輯

(function () {
  // ========== 資料儲存 ==========
  const messages = [];
  let currentFilter = 'ALL';
  let searchText = '';
  let selectedIndex = -1;
  let currentTab = 'formatted';
  let currentMsg = null;
  let currentParsed = null;

  // ========== DOM ==========
  const messageList = document.getElementById('message-list');
  const emptyState = document.getElementById('empty-state');
  const detailPanel = document.getElementById('detail-panel');
  const detailLabel = document.getElementById('detail-label');
  const detailContent = document.getElementById('detail-content');
  const msgCount = document.getElementById('msg-count');
  const searchInput = document.getElementById('search-input');

  // ========== 工具函式 ==========

  function parsePayload(payload) {
    if (typeof payload !== 'string') {
      return { format: 'TEXT', parsed: String(payload), raw: String(payload) };
    }

    // JSON
    try {
      const obj = JSON.parse(payload);
      return { format: 'JSON', parsed: obj, raw: payload };
    } catch (e) {}

    // XML
    const trimmed = payload.trim();
    if (trimmed.startsWith('<')) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(payload, 'text/xml');
        if (!doc.querySelector('parsererror')) {
          return { format: 'XML', parsed: doc, raw: payload };
        }
      } catch (e) {}
    }

    return { format: 'TEXT', parsed: payload, raw: payload };
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

  // ===== JSON 語法高亮 =====
  function highlightJson(obj, indent) {
    indent = indent || 0;
    const sp = '  '.repeat(indent);
    const sp1 = '  '.repeat(indent + 1);

    if (obj === null) return '<span class="json-null">null</span>';
    if (typeof obj === 'boolean') return '<span class="json-boolean">' + obj + '</span>';
    if (typeof obj === 'number') return '<span class="json-number">' + obj + '</span>';
    if (typeof obj === 'string') return '<span class="json-string">"' + escapeHtml(obj) + '"</span>';

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      const items = obj.map(function (item) {
        return sp1 + highlightJson(item, indent + 1);
      });
      return '[\n' + items.join(',\n') + '\n' + sp + ']';
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      const entries = keys.map(function (key) {
        return sp1 + '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' +
          highlightJson(obj[key], indent + 1);
      });
      return '{\n' + entries.join(',\n') + '\n' + sp + '}';
    }

    return escapeHtml(String(obj));
  }

  // ===== XML 語法高亮（遞迴遍歷 DOM）=====
  function highlightXmlNode(node, indent) {
    const sp = '  '.repeat(indent);
    let html = '';

    if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
      html += sp + '<span class="xml-decl">&lt;?' + escapeHtml(node.target) + ' ' +
        escapeHtml(node.data) + '?&gt;</span>\n';
      return html;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        html += '<span class="xml-text">' + escapeHtml(text) + '</span>';
      }
      return html;
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      html += sp + '<span class="xml-decl">&lt;!-- ' + escapeHtml(node.textContent) + ' --&gt;</span>\n';
      return html;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tagName = node.tagName;
    const attrs = node.attributes;
    const children = node.childNodes;

    // 開標籤
    html += sp + '&lt;<span class="xml-tag">' + escapeHtml(tagName) + '</span>';

    for (let i = 0; i < attrs.length; i++) {
      html += ' <span class="xml-attr-name">' + escapeHtml(attrs[i].name) + '</span>' +
        '=<span class="xml-attr-value">"' + escapeHtml(attrs[i].value) + '"</span>';
    }

    // 無子元素
    if (children.length === 0) {
      html += '/&gt;\n';
      return html;
    }

    // 只有一個文字子節點 → 單行顯示
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
      const text = children[0].textContent.trim();
      html += '&gt;<span class="xml-text">' + escapeHtml(text) + '</span>';
      html += '&lt;/<span class="xml-tag">' + escapeHtml(tagName) + '</span>&gt;\n';
      return html;
    }

    // 多個子元素
    html += '&gt;\n';
    for (let i = 0; i < children.length; i++) {
      html += highlightXmlNode(children[i], indent + 1);
    }
    html += sp + '&lt;/<span class="xml-tag">' + escapeHtml(tagName) + '</span>&gt;\n';

    return html;
  }

  function highlightXmlDoc(doc) {
    let html = '';
    // 如果有 xml declaration（DOMParser 不保留，手動檢查 raw）
    for (let i = 0; i < doc.childNodes.length; i++) {
      html += highlightXmlNode(doc.childNodes[i], 0);
    }
    return html.trimEnd();
  }

  // ========== 複製功能 ==========

  function getFormattedText(msg, parsed) {
    if (!msg.payload) return '';
    if (parsed.format === 'JSON') {
      return JSON.stringify(parsed.parsed, null, 2);
    }
    if (parsed.format === 'XML') {
      // 用 formatted raw
      return formatXmlRaw(parsed.raw);
    }
    return parsed.raw;
  }

  function formatXmlRaw(xml) {
    let formatted = '';
    let indentLevel = 0;
    // 先把 >< 之間加換行
    const parts = xml.replace(/(>)\s*(<)/g, '$1\n$2').split('\n');
    parts.forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('</')) indentLevel--;
      formatted += '  '.repeat(Math.max(0, indentLevel)) + trimmed + '\n';
      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.startsWith('<?') &&
          !trimmed.endsWith('/>') && trimmed.endsWith('>')) {
        // 檢查是不是自閉合或單行含文字
        if (!/<\/\w/.test(trimmed)) {
          indentLevel++;
        }
      }
    });
    return formatted.trimEnd();
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(function () {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }, 1200);
    });
  }

  // ========== 渲染 ==========

  function shouldShow(msg) {
    if (currentFilter !== 'ALL' && msg.type !== currentFilter) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      return (msg.url || '').toLowerCase().includes(s) ||
        (msg.payload || '').toLowerCase().includes(s);
    }
    return true;
  }

  function createMessageElement(msg, index) {
    const div = document.createElement('div');
    div.className = 'message-item';
    div.dataset.index = index;

    const dirDiv = document.createElement('div');
    dirDiv.className = 'direction ' + msg.type.toLowerCase();
    const labels = { SEND: 'SEND', RECEIVE: 'RECV', CONNECT: 'OPEN', CLOSE: 'CLOSE', ERROR: 'ERR' };
    dirDiv.textContent = labels[msg.type] || msg.type;
    div.appendChild(dirDiv);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.textContent = formatTime(msg.timestamp);
    div.appendChild(timeDiv);

    const badgeDiv = document.createElement('div');
    badgeDiv.className = 'format-badge';
    if (msg.payload) {
      const p = parsePayload(msg.payload);
      const badge = document.createElement('span');
      badge.className = 'badge-' + p.format.toLowerCase();
      badge.textContent = p.format;
      badgeDiv.appendChild(badge);
    }
    div.appendChild(badgeDiv);

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

    div.addEventListener('click', function () { selectMessage(index); });
    return div;
  }

  function renderMessages() {
    messageList.querySelectorAll('.message-item').forEach(function (el) { el.remove(); });

    let count = 0;
    messages.forEach(function (msg, i) {
      if (shouldShow(msg)) {
        messageList.appendChild(createMessageElement(msg, i));
        count++;
      }
    });

    emptyState.style.display = count === 0 ? 'flex' : 'none';
    msgCount.textContent = count + ' / ' + messages.length;
  }

  function addMessage(msg) {
    messages.push(msg);
    emptyState.style.display = 'none';

    if (shouldShow(msg)) {
      messageList.appendChild(createMessageElement(msg, messages.length - 1));
      messageList.scrollTop = messageList.scrollHeight;
    }

    const count = messageList.querySelectorAll('.message-item').length;
    msgCount.textContent = count + ' / ' + messages.length;
  }

  // ========== 詳細面板 ==========

  function renderDetail() {
    if (!currentMsg) return;

    const msg = currentMsg;
    const parsed = currentParsed;

    if (currentTab === 'formatted') {
      if (msg.type === 'CONNECT') {
        detailContent.innerHTML = '<span class="json-key">URL</span>: ' + escapeHtml(msg.url);
      } else if (!msg.payload) {
        detailContent.textContent = msg.type === 'CLOSE'
          ? 'Code: ' + msg.code + '\nReason: ' + (msg.reason || '(none)')
          : 'No payload';
      } else if (parsed.format === 'JSON') {
        detailContent.innerHTML = highlightJson(parsed.parsed);
      } else if (parsed.format === 'XML') {
        detailContent.innerHTML = highlightXmlDoc(parsed.parsed);
      } else {
        detailContent.textContent = parsed.raw;
      }
    } else if (currentTab === 'raw') {
      detailContent.textContent = msg.payload || '(no data)';
    } else if (currentTab === 'meta') {
      const rows = [
        ['Direction', msg.type],
        ['URL', msg.url || '-'],
        ['Format', parsed ? parsed.format : '-'],
        ['Time', formatTime(msg.timestamp)],
        ['Size', msg.payload ? msg.payload.length + ' chars' : '-'],
        ['Frame', msg.frameUrl || '-'],
        ['Connection', '#' + (msg.id || '-')]
      ];
      if (msg.type === 'CLOSE') {
        rows.push(['Close Code', String(msg.code)]);
        rows.push(['Reason', msg.reason || '(none)']);
      }
      let tableHtml = '<table class="meta-table">';
      rows.forEach(function (r) {
        tableHtml += '<tr><td class="meta-key">' + escapeHtml(r[0]) +
          '</td><td class="meta-value">' + escapeHtml(r[1]) + '</td></tr>';
      });
      tableHtml += '</table>';
      detailContent.innerHTML = tableHtml;
    }
  }

  function selectMessage(index) {
    selectedIndex = index;
    currentMsg = messages[index];
    currentParsed = currentMsg.payload ? parsePayload(currentMsg.payload) : null;
    currentTab = 'formatted';

    messageList.querySelectorAll('.message-item').forEach(function (el) {
      el.classList.toggle('selected', parseInt(el.dataset.index) === index);
    });

    // 更新 tab active
    document.querySelectorAll('#detail-tabs button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === 'formatted');
    });

    const typeLabels = { SEND: 'SEND', RECEIVE: 'RECV', CONNECT: 'OPEN', CLOSE: 'CLOSE', ERROR: 'ERR' };
    const fmtLabel = currentParsed ? ' [' + currentParsed.format + ']' : '';
    detailLabel.textContent = (typeLabels[currentMsg.type] || currentMsg.type) + fmtLabel;

    renderDetail();
    detailPanel.classList.add('visible');
  }

  // ========== 事件綁定 ==========

  // Clear
  document.getElementById('btn-clear').addEventListener('click', function () {
    messages.length = 0;
    selectedIndex = -1;
    currentMsg = null;
    currentParsed = null;
    detailPanel.classList.remove('visible');
    renderMessages();
  });

  // Filter buttons
  document.querySelectorAll('[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderMessages();
    });
  });

  // Search
  searchInput.addEventListener('input', function () {
    searchText = this.value;
    renderMessages();
  });

  // Detail tabs
  document.querySelectorAll('#detail-tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#detail-tabs button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderDetail();
    });
  });

  // Copy formatted
  document.getElementById('btn-copy').addEventListener('click', function () {
    if (!currentMsg) return;
    const text = currentParsed ? getFormattedText(currentMsg, currentParsed) : '';
    copyToClipboard(text, this);
  });

  // Copy raw
  document.getElementById('btn-copy-raw').addEventListener('click', function () {
    if (!currentMsg || !currentMsg.payload) return;
    copyToClipboard(currentMsg.payload, this);
  });

  // Close detail
  document.getElementById('btn-close-detail').addEventListener('click', function () {
    detailPanel.classList.remove('visible');
    selectedIndex = -1;
    currentMsg = null;
    messageList.querySelectorAll('.message-item').forEach(function (el) { el.classList.remove('selected'); });
  });

  // ========== 建立連線 ==========

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;

    const port = chrome.runtime.connect({ name: 'popup' });
    port.postMessage({ name: 'init', tabId: tabId });

    port.onMessage.addListener(function (message) {
      addMessage(message);
    });
  });
})();
