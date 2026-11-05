// Tab Navigation
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.getAttribute('data-tab');
    navItems.forEach(n => n.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(target).classList.add('active');

    if (target === 'history') loadHistory();
    if (target === 'dictionary') loadDictionary();
    if (target === 'snippets') loadSnippets();
  });
});

// Settings Elements
const providerRadios = document.querySelectorAll('input[name="ai_provider"]');
const geminiKeyInput = document.getElementById('geminiKeyInput');
const groqKeyInput = document.getElementById('groqKeyInput');
const openaiKeyInput = document.getElementById('openaiKeyInput');
const hotkeyInput = document.getElementById('hotkeyInput');
const toneSelect = document.getElementById('toneSelect');
const autoPasteToggle = document.getElementById('autoPasteToggle');

// Load initial settings
async function loadSettings() {
  const settings = await window.veoflow.getSettings();

  // Active Provider
  const activeProvider = settings.ai_provider || 'gemini';
  providerRadios.forEach(r => {
    if (r.value === activeProvider) r.checked = true;
  });

  // Keys
  geminiKeyInput.value = settings.gemini_api_key || '';
  groqKeyInput.value = settings.groq_api_key || '';
  openaiKeyInput.value = settings.openai_api_key || '';

  // Preferences
  hotkeyInput.value = settings.hotkey || 'Ctrl+Alt+Space';
  toneSelect.value = settings.tone_preference || 'contextual';
  autoPasteToggle.checked = settings.auto_paste !== 'false';
}

// Provider radio change
providerRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    await window.veoflow.saveSetting('ai_provider', e.target.value);
    showNotice('AI provider updated');
  });
});

// Save Keys
document.getElementById('saveGeminiKey').addEventListener('click', async () => {
  await window.veoflow.saveSetting('gemini_api_key', geminiKeyInput.value.trim());
  showNotice('Gemini API key saved');
});

document.getElementById('saveGroqKey').addEventListener('click', async () => {
  await window.veoflow.saveSetting('groq_api_key', groqKeyInput.value.trim());
  showNotice('Groq API key saved');
});

document.getElementById('saveOpenaiKey').addEventListener('click', async () => {
  await window.veoflow.saveSetting('openai_api_key', openaiKeyInput.value.trim());
  showNotice('OpenAI API key saved');
});

// Save Hotkey
document.getElementById('saveHotkeyBtn').addEventListener('click', async () => {
  const val = hotkeyInput.value.trim();
  if (val) {
    await window.veoflow.saveSetting('hotkey', val);
    showNotice(`Hotkey updated to ${val}`);
  }
});

// Tone preference change
toneSelect.addEventListener('change', async () => {
  await window.veoflow.saveSetting('tone_preference', toneSelect.value);
  showNotice('Tone preference updated');
});

// Auto paste toggle
autoPasteToggle.addEventListener('change', async () => {
  await window.veoflow.saveSetting('auto_paste', String(autoPasteToggle.checked));
});

// HISTORY TAB
async function loadHistory() {
  const history = await window.veoflow.getHistory();
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';

  if (!history || history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No dictations recorded yet.</td></tr>';
    return;
  }

  history.forEach(item => {
    const tr = document.createElement('tr');
    const d = new Date(item.timestamp);
    const timeStr = `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const appStr = item.app_name ? item.app_name.replace('.exe', '') : 'Desktop';

    tr.innerHTML = `
      <td style="color:#94a3b8; font-size:11px;">${timeStr}</td>
      <td><strong>${escapeHtml(appStr)}</strong></td>
      <td style="color:#f8fafc; font-weight:500;">${escapeHtml(item.formatted_text)}</td>
      <td style="color:#64748b; font-size:12px;">${escapeHtml(item.raw_asr)}</td>
      <td style="color:#38bdf8; font-size:11px;">${item.latency_ms}ms</td>
      <td>
        <button class="btn-secondary btn-copy" style="padding:4px 8px; font-size:11px;">Copy</button>
      </td>
    `;
    const copyBtn = tr.querySelector('.btn-copy');
    copyBtn.addEventListener('click', () => copyText(item.formatted_text));
    tbody.appendChild(tr);
  });
}

document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear your dictation history?')) {
    await window.veoflow.clearHistory();
    loadHistory();
  }
});

// DICTIONARY TAB
async function loadDictionary() {
  const dict = await window.veoflow.getDictionary();
  const tbody = document.getElementById('dictionaryBody');
  tbody.innerHTML = '';

  if (!dict || dict.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No custom vocabulary added yet.</td></tr>';
    return;
  }

  dict.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(item.trigger_word)}</code></td>
      <td><strong>${escapeHtml(item.replacement)}</strong></td>
      <td>
        <button class="btn-sm-del" data-id="${item.id}">Delete</button>
      </td>
    `;
    const delBtn = tr.querySelector('.btn-sm-del');
    delBtn.addEventListener('click', () => deleteDictItem(item.id));
    tbody.appendChild(tr);
  });
}

document.getElementById('addDictBtn').addEventListener('click', async () => {
  const word = document.getElementById('dictWordInput').value.trim();
  const rep = document.getElementById('dictRepInput').value.trim();
  if (word && rep) {
    await window.veoflow.addDictionaryWord(word, rep);
    document.getElementById('dictWordInput').value = '';
    document.getElementById('dictRepInput').value = '';
    loadDictionary();
  }
});

async function deleteDictItem(id) {
  await window.veoflow.deleteDictionaryWord(id);
  loadDictionary();
}

// SNIPPETS TAB
async function loadSnippets() {
  const snippets = await window.veoflow.getSnippets();
  const tbody = document.getElementById('snippetsBody');
  tbody.innerHTML = '';

  if (!snippets || snippets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No voice snippets created yet.</td></tr>';
    return;
  }

  snippets.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>"${escapeHtml(item.shortcut)}"</code></td>
      <td><span style="color:#cbd5e1;">${escapeHtml(item.expanded_text)}</span></td>
      <td>
        <button class="btn-sm-del" data-id="${item.id}">Delete</button>
      </td>
    `;
    const delBtn = tr.querySelector('.btn-sm-del');
    delBtn.addEventListener('click', () => deleteSnippetItem(item.id));
    tbody.appendChild(tr);
  });
}

document.getElementById('addSnippetBtn').addEventListener('click', async () => {
  const trigger = document.getElementById('snippetTriggerInput').value.trim();
  const text = document.getElementById('snippetTextInput').value.trim();
  if (trigger && text) {
    await window.veoflow.addSnippet(trigger, text);
    document.getElementById('snippetTriggerInput').value = '';
    document.getElementById('snippetTextInput').value = '';
    loadSnippets();
  }
});

async function deleteSnippetItem(id) {
  await window.veoflow.deleteSnippet(id);
  loadSnippets();
}

// Helper utilities
function copyText(text) {
  navigator.clipboard.writeText(text);
  showNotice('Copied to clipboard');
}

function showNotice(msg) {
  // Simple toast
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #0ea5e9;
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    z-index: 9999;
    animation: fadeIn 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Test Dictation Button
const testDictationBtn = document.getElementById('testDictationBtn');
let isTestRecording = false;

if (testDictationBtn) {
  testDictationBtn.addEventListener('click', async () => {
    if (!isTestRecording) {
      isTestRecording = true;
      testDictationBtn.textContent = '⏹️ Stop & Paste';
      testDictationBtn.style.background = '#ef4444';
      testDictationBtn.style.color = '#fff';
      await window.veoflow.startRecording();
    } else {
      isTestRecording = false;
      testDictationBtn.textContent = '🎙️ Start Voice Test';
      testDictationBtn.style.background = '';
      testDictationBtn.style.color = '';
      await window.veoflow.stopRecording();
    }
  });

  window.veoflow.onStateChange((data) => {
    if (data.state === 'idle' || data.state === 'success' || data.state === 'error') {
      isTestRecording = false;
      testDictationBtn.textContent = '🎙️ Start Voice Test';
      testDictationBtn.style.background = '';
      testDictationBtn.style.color = '';
    }
  });
}

// On load
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
});
