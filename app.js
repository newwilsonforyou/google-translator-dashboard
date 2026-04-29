// ===== Service Worker Registration =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// ===== State =====
let cangjieDict = {};
let cangjieMode = 'roots'; // 'roots' or 'code'
let translateTimer = null;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', async () => {
  // Load theme
  const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Load saved tool
  const savedTool = localStorage.getItem('dashboard-tool') || 'translator';
  switchTool(savedTool);

  // Restore saved API key
  const savedKey = localStorage.getItem('google-api-key') || '';
  const keyInput = document.getElementById('googleApiKey');
  if (keyInput) {
    keyInput.value = savedKey;
    updateKeyStatus(savedKey);
  }

  // Load Cangjie dictionary
  try {
    const response = await fetch('cangjie_dict.json');
    cangjieDict = await response.json();
  } catch (e) {
    console.warn('Failed to load Cangjie dictionary:', e);
  }
});

// ===== Theme Toggle =====
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('dashboard-theme', next);
}

// ===== Sidebar / Tool Switching =====
function switchTool(toolName) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  // Update panels
  document.querySelectorAll('.tool-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tool-${toolName}`);
  });

  // Update header title
  const titles = {
    translator: '翻譯器',
    cangjie: '倉頡轉換器'
  };
  document.getElementById('headerTitle').textContent = titles[toolName] || toolName;

  // Save preference
  localStorage.setItem('dashboard-tool', toolName);

  // Close mobile sidebar
  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ===== API Key Management =====
function saveApiKey() {
  const key = document.getElementById('googleApiKey').value.trim();
  localStorage.setItem('google-api-key', key);
  updateKeyStatus(key);
}

function updateKeyStatus(key) {
  const el = document.getElementById('keyStatus');
  if (!el) return;
  if (key) {
    el.textContent = '✓ 已儲存';
    el.className = 'key-status ok';
  } else {
    el.textContent = '未設定';
    el.className = 'key-status none';
  }
}

// ===== Translator =====
function handleTranslateInput() {
  const text = document.getElementById('sourceText').value;
  document.getElementById('sourceCharCount').textContent = text.length;

  clearTimeout(translateTimer);
  if (text.trim()) {
    translateTimer = setTimeout(() => translateText(), 500);
  } else {
    document.getElementById('targetText').value = '';
  }
}

async function translateText() {
  const sourceText = document.getElementById('sourceText').value.trim();
  if (!sourceText) return;

  const apiKey = localStorage.getItem('google-api-key') || '';
  if (!apiKey) {
    document.getElementById('targetText').value = '請先在下方輸入框貼上您的 Google Cloud Translation API 金鑰。';
    return;
  }

  const sourceLang = document.getElementById('sourceLang').value;
  const targetLang = document.getElementById('targetLang').value;
  const targetTextarea = document.getElementById('targetText');

  targetTextarea.value = '翻譯中...';

  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: sourceText,
        source: sourceLang,
        target: targetLang,
        format: 'text'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || `HTTP ${response.status}`;
      throw new Error(msg);
    }

    targetTextarea.value = data.data?.translations?.[0]?.translatedText || '(無翻譯結果)';
  } catch (error) {
    console.warn('Translation failed:', error);
    targetTextarea.value = `翻譯失敗：${error.message}`;
  }
}

function swapLanguages() {
  const sourceLang = document.getElementById('sourceLang');
  const targetLang = document.getElementById('targetLang');
  const sourceText = document.getElementById('sourceText');
  const targetText = document.getElementById('targetText');

  // Swap language selections
  const tempLang = sourceLang.value;
  sourceLang.value = targetLang.value;
  targetLang.value = tempLang;

  // Swap text content
  const tempText = sourceText.value;
  sourceText.value = targetText.value;
  targetText.value = tempText;

  // Update char count
  document.getElementById('sourceCharCount').textContent = sourceText.value.length;

  // Re-translate if there's text
  if (sourceText.value.trim()) {
    clearTimeout(translateTimer);
    translateTimer = setTimeout(() => translateText(), 300);
  }
}

function clearSource() {
  document.getElementById('sourceText').value = '';
  document.getElementById('targetText').value = '';
  document.getElementById('sourceCharCount').textContent = '0';
}

function copyTranslation() {
  const text = document.getElementById('targetText').value;
  if (!text) return;
  copyToClipboard(text, '已複製翻譯結果');
}

// ===== Cangjie Converter =====
function setCangjieMode(mode) {
  cangjieMode = mode;
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  // Re-render if there's input
  convertCangjie();
}

function convertCangjie() {
  const input = document.getElementById('cangjieInput').value;
  const resultEl = document.getElementById('cangjieResult');
  const detailEl = document.getElementById('cangjieDetail');
  const detailBody = document.getElementById('cangjieDetailBody');

  if (!input.trim()) {
    resultEl.innerHTML = '<span class="placeholder-text">結果將顯示在這裡...</span>';
    detailEl.style.display = 'none';
    return;
  }

  let resultHTML = '';
  let detailRows = '';
  const chars = [...input];

  for (const char of chars) {
    const entry = cangjieDict[char];
    if (entry) {
      const display = cangjieMode === 'roots' ? entry.roots : entry.code;
      resultHTML += `<span class="char-group"><span class="char-original">${char}</span><span class="char-code">${display}</span></span>`;
      detailRows += `<tr><td>${char}</td><td>${entry.roots}</td><td>${entry.code}</td></tr>`;
    } else if (char === '\n') {
      resultHTML += '<br>';
    } else if (char.trim() === '') {
      resultHTML += `<span class="char-unknown">&nbsp;</span>`;
    } else {
      // Non-Chinese or unrecognized characters: keep as-is
      resultHTML += `<span class="char-unknown">${escapeHtml(char)}</span>`;
    }
  }

  resultEl.innerHTML = resultHTML;

  if (detailRows) {
    detailBody.innerHTML = detailRows;
    detailEl.style.display = 'block';
  } else {
    detailEl.style.display = 'none';
  }
}

function clearCangjieInput() {
  document.getElementById('cangjieInput').value = '';
  document.getElementById('cangjieResult').innerHTML = '<span class="placeholder-text">結果將顯示在這裡...</span>';
  document.getElementById('cangjieDetail').style.display = 'none';
}

function copyCangjie() {
  const input = document.getElementById('cangjieInput').value;
  if (!input.trim()) return;

  const chars = [...input];
  let text = '';

  for (const char of chars) {
    const entry = cangjieDict[char];
    if (entry) {
      const display = cangjieMode === 'roots' ? entry.roots : entry.code;
      text += `${char}(${display}) `;
    } else if (char === '\n') {
      text += '\n';
    } else {
      text += char;
    }
  }

  copyToClipboard(text.trim(), '已複製倉頡碼結果');
}

// ===== Utilities =====
function copyToClipboard(text, message) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(message || '已複製');
  }).catch(() => {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(message || '已複製');
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
