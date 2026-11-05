/**
 * VeoFlow Settings & Dashboard Controller (ESM)
 * Fully interactive multi-screen controller for all 7 application sections.
 */

// ============================================================================
// 1. TAB NAVIGATION
// ============================================================================
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.getAttribute('data-tab');
    switchTab(target);
  });
});

function switchTab(tabId) {
  navItems.forEach(n => {
    const isTarget = n.getAttribute('data-tab') === tabId;
    n.classList.toggle('active', isTarget);
    n.setAttribute('aria-selected', String(isTarget));
  });

  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'history') loadHistory();
  if (tabId === 'general') loadGeneralSettings();
  if (tabId === 'dictionary') loadDictionary();
  if (tabId === 'snippets') loadSnippets();
  if (tabId === 'privacy') loadPrivacy();
}

// ============================================================================
// 2. DASHBOARD
// ============================================================================
const statTotalDictations = document.getElementById('statTotalDictations');
const statAvgLatency = document.getElementById('statAvgLatency');
const statSuccessRate = document.getElementById('statSuccessRate');
const statActiveProvider = document.getElementById('statActiveProvider');
const helperStatusDetail = document.getElementById('helperStatusDetail');
const audioStatusDetail = document.getElementById('audioStatusDetail');
const hotkeyStatusDetail = document.getElementById('hotkeyStatusDetail');
const dashRecentHistoryBody = document.getElementById('dashRecentHistoryBody');
const dashStartDictBtn = document.getElementById('dashStartDictBtn');
const dashOpenHudBtn = document.getElementById('dashOpenHudBtn');

let isDashRecording = false;

async function loadDashboard() {
  if (!window.veoflow) return;

  const [settings, history] = await Promise.all([
    window.veoflow.getSettings(),
    window.veoflow.getHistory()
  ]);

  // Provider
  const provider = settings.ai_provider || 'gemini';
  statActiveProvider.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);

  // Hotkey
  const hotkey = settings.hotkey || 'Ctrl+Alt+Space';
  hotkeyStatusDetail.textContent = hotkey;

  // Stats calculation
  const total = history ? history.length : 0;
  statTotalDictations.textContent = total;

  if (total > 0) {
    const totalLatency = history.reduce((acc, cur) => acc + (cur.latency_ms || 0), 0);
    const avg = Math.round(totalLatency / total);
    statAvgLatency.textContent = `${avg} ms`;

    const successCount = history.filter(h => h.status === 'success').length;
    const rate = Math.round((successCount / total) * 100);
    statSuccessRate.textContent = `${rate}%`;
  } else {
    statAvgLatency.textContent = '0 ms';
    statSuccessRate.textContent = '100%';
  }

  // Recent 5 entries
  dashRecentHistoryBody.innerHTML = '';
  if (!history || history.length === 0) {
    dashRecentHistoryBody.innerHTML = '<tr><td colspan="5" class="empty-state">No dictation sessions recorded yet. Press Ctrl+Alt+Space to dictate!</td></tr>';
  } else {
    history.slice(0, 5).forEach(item => {
      const tr = document.createElement('tr');
      const d = new Date(item.timestamp);
      const timeStr = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const appStr = item.app_name ? item.app_name.replace('.exe', '') : 'Desktop';
      const textPreview = item.formatted_text || item.raw_asr || '';

      tr.innerHTML = `
        <td style="color:#94a3b8; font-size:11px;">${timeStr}</td>
        <td><strong>${escapeHtml(appStr)}</strong></td>
        <td style="color:#f8fafc; font-weight:500;">${escapeHtml(textPreview.slice(0, 45))}${textPreview.length > 45 ? '...' : ''}</td>
        <td style="color:#00f2fe; font-size:11px;">${item.latency_ms || 0}ms</td>
        <td><span class="badge-status ${item.status === 'error' ? 'error' : 'success'}">${item.status || 'success'}</span></td>
      `;
      dashRecentHistoryBody.appendChild(tr);
    });
  }
}

// Quick action buttons
if (dashStartDictBtn) {
  dashStartDictBtn.addEventListener('click', async () => {
    if (!window.veoflow) return;
    if (!isDashRecording) {
      isDashRecording = true;
      dashStartDictBtn.textContent = '⏹️ Stop & Insert';
      dashStartDictBtn.style.background = '#ef4444';
      dashStartDictBtn.style.color = '#fff';
      await window.veoflow.startRecording();
    } else {
      isDashRecording = false;
      dashStartDictBtn.textContent = '🎙️ Start Voice Dictation';
      dashStartDictBtn.style.background = '';
      dashStartDictBtn.style.color = '';
      await window.veoflow.stopRecording();
    }
  });

  if (window.veoflow && window.veoflow.onStateChange) {
    window.veoflow.onStateChange((data) => {
      if (data.state === 'idle' || data.state === 'success' || data.state === 'error') {
        isDashRecording = false;
        dashStartDictBtn.textContent = '🎙️ Start Voice Dictation';
        dashStartDictBtn.style.background = '';
        dashStartDictBtn.style.color = '';
        loadDashboard();
      }
    });
  }
}

if (dashOpenHudBtn) {
  dashOpenHudBtn.addEventListener('click', () => {
    if (window.veoflow && window.veoflow.openHud) {
      window.veoflow.openHud();
      showNotice('Floating HUD opened');
    }
  });
}

document.getElementById('dashQuickTestAi')?.addEventListener('click', () => {
  switchTab('ai-settings');
  const activeRadio = document.querySelector('input[name="ai_provider"]:checked');
  const provider = activeRadio ? activeRadio.value : 'gemini';
  runConnectionTest(provider);
});

document.getElementById('dashQuickViewHistory')?.addEventListener('click', () => {
  switchTab('history');
});

document.getElementById('dashQuickClearHistory')?.addEventListener('click', async () => {
  if (confirm('Clear all dictation history?')) {
    await window.veoflow.clearHistory();
    loadDashboard();
    showNotice('History cleared');
  }
});

// ============================================================================
// 3. AI PROVIDER SETTINGS
// ============================================================================
const providerRadios = document.querySelectorAll('input[name="ai_provider"]');
const geminiKeyInput = document.getElementById('geminiKeyInput');
const groqKeyInput = document.getElementById('groqKeyInput');
const openaiKeyInput = document.getElementById('openaiKeyInput');
const allowFallbackToggle = document.getElementById('allowFallbackToggle');

async function loadAiSettings() {
  if (!window.veoflow) return;
  const settings = await window.veoflow.getSettings();

  const activeProvider = settings.ai_provider || 'gemini';
  providerRadios.forEach(r => {
    r.checked = (r.value === activeProvider);
  });

  geminiKeyInput.value = settings.gemini_api_key || '';
  groqKeyInput.value = settings.groq_api_key || '';
  openaiKeyInput.value = settings.openai_api_key || '';
  allowFallbackToggle.checked = (settings.allow_fallback !== 'false');
}

// Provider radio changes
providerRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    await window.veoflow.saveSetting('ai_provider', e.target.value);
    showNotice(`Active AI provider changed to ${e.target.value}`);
    loadDashboard();
  });
});

// Save Keys
document.getElementById('saveGeminiKey')?.addEventListener('click', async () => {
  await window.veoflow.saveSetting('gemini_api_key', geminiKeyInput.value.trim());
  showNotice('Gemini API key saved');
});

document.getElementById('saveGroqKey')?.addEventListener('click', async () => {
  await window.veoflow.saveSetting('groq_api_key', groqKeyInput.value.trim());
  showNotice('Groq API key saved');
});

document.getElementById('saveOpenaiKey')?.addEventListener('click', async () => {
  await window.veoflow.saveSetting('openai_api_key', openaiKeyInput.value.trim());
  showNotice('OpenAI API key saved');
});

// Fallback toggle
allowFallbackToggle?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('allow_fallback', String(allowFallbackToggle.checked));
  showNotice(`Provider fallback ${allowFallbackToggle.checked ? 'enabled' : 'disabled'}`);
});

// Connection Tests
async function runConnectionTest(provider) {
  const feedbackEl = document.getElementById(`${provider}TestFeedback`);
  if (!feedbackEl) return;

  feedbackEl.className = 'test-feedback testing';
  feedbackEl.textContent = `Testing ${provider} connection...`;

  try {
    const result = await window.veoflow.testAiConnection(provider);
    if (result && result.success) {
      feedbackEl.className = 'test-feedback success';
      feedbackEl.textContent = `✓ ${result.message} (${result.latencyMs || 0}ms)`;
    } else {
      feedbackEl.className = 'test-feedback error';
      feedbackEl.textContent = `✗ ${result?.message || 'Connection failed'}`;
    }
  } catch (err) {
    feedbackEl.className = 'test-feedback error';
    feedbackEl.textContent = `✗ Test error: ${err.message}`;
  }
}

document.querySelectorAll('.btn-test-conn').forEach(btn => {
  btn.addEventListener('click', () => {
    const provider = btn.getAttribute('data-provider');
    if (provider) runConnectionTest(provider);
  });
});

// ============================================================================
// 4. DICTATION HISTORY
// ============================================================================
const historyBody = document.getElementById('historyBody');
const historySearchInput = document.getElementById('historySearchInput');
let cachedHistory = [];

async function loadHistory(filterText = '') {
  if (!window.veoflow) return;
  cachedHistory = await window.veoflow.getHistory();
  renderHistoryTable(filterText);
}

function renderHistoryTable(filterText = '') {
  historyBody.innerHTML = '';
  const filter = (filterText || '').toLowerCase().trim();

  const items = cachedHistory.filter(item => {
    if (!filter) return true;
    const matchApp = (item.app_name || '').toLowerCase().includes(filter);
    const matchFormatted = (item.formatted_text || '').toLowerCase().includes(filter);
    const matchRaw = (item.raw_asr || '').toLowerCase().includes(filter);
    const matchDate = (item.timestamp || '').toLowerCase().includes(filter);
    return matchApp || matchFormatted || matchRaw || matchDate;
  });

  if (!items || items.length === 0) {
    historyBody.innerHTML = `<tr><td colspan="7" class="empty-state">${filter ? 'No entries match your search.' : 'No dictations recorded yet.'}</td></tr>`;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    const d = new Date(item.timestamp);
    const timeStr = `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const appStr = item.app_name ? item.app_name.replace('.exe', '') : 'Desktop';
    const status = item.status || 'success';

    tr.innerHTML = `
      <td style="color:#94a3b8; font-size:11px;">${timeStr}</td>
      <td><strong>${escapeHtml(appStr)}</strong></td>
      <td style="color:#f8fafc; font-weight:500;">${escapeHtml(item.formatted_text)}</td>
      <td style="color:#64748b; font-size:12px;">${escapeHtml(item.raw_asr)}</td>
      <td style="color:#00f2fe; font-size:11px;">${item.latency_ms || 0}ms</td>
      <td><span class="badge-status ${status === 'error' ? 'error' : 'success'}">${status}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-secondary btn-copy" style="padding:4px 8px; font-size:11px;">Copy</button>
          <button class="btn-sm-del" style="padding:4px 8px; font-size:11px;">Delete</button>
        </div>
      </td>
    `;

    // Copy Action
    tr.querySelector('.btn-copy').addEventListener('click', () => {
      copyText(item.formatted_text || item.raw_asr || '');
    });

    // Delete Action
    tr.querySelector('.btn-sm-del').addEventListener('click', async () => {
      await window.veoflow.deleteHistoryItem(item.id);
      cachedHistory = cachedHistory.filter(h => h.id !== item.id);
      renderHistoryTable(historySearchInput?.value || '');
      loadDashboard();
      showNotice('Item removed from history');
    });

    historyBody.appendChild(tr);
  });
}

// Live search listener
historySearchInput?.addEventListener('input', (e) => {
  renderHistoryTable(e.target.value);
});

document.getElementById('clearHistoryBtn')?.addEventListener('click', async () => {
  if (confirm('Are you sure you want to delete ALL dictation history?')) {
    await window.veoflow.clearHistory();
    cachedHistory = [];
    renderHistoryTable();
    loadDashboard();
    showNotice('All history cleared');
  }
});

// ============================================================================
// 5. GENERAL SETTINGS & AUDIO
// ============================================================================
const audioDeviceSelect = document.getElementById('audioDeviceSelect');
const hotkeyInput = document.getElementById('hotkeyInput');
const toneSelect = document.getElementById('toneSelect');
const autoPasteToggle = document.getElementById('autoPasteToggle');
const startupToggle = document.getElementById('startupToggle');

async function loadGeneralSettings() {
  if (!window.veoflow) return;
  const settings = await window.veoflow.getSettings();

  hotkeyInput.value = settings.hotkey || 'Ctrl+Alt+Space';
  toneSelect.value = settings.tone_preference || 'contextual';
  autoPasteToggle.checked = (settings.auto_paste !== 'false');
  startupToggle.checked = (settings.launch_at_startup === 'true');

  await populateAudioDevices(settings.audio_device_id || 'default');
}

async function populateAudioDevices(selectedId = 'default') {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    audioDeviceSelect.innerHTML = '<option value="default">Default System Audio</option>';
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');

    audioDeviceSelect.innerHTML = '';
    const defOption = document.createElement('option');
    defOption.value = 'default';
    defOption.textContent = 'Default System Microphone';
    audioDeviceSelect.appendChild(defOption);

    audioInputs.forEach((device, idx) => {
      if (device.deviceId && device.deviceId !== 'default') {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.textContent = device.label || `Microphone ${idx + 1}`;
        if (device.deviceId === selectedId) opt.selected = true;
        audioDeviceSelect.appendChild(opt);
      }
    });

    if (selectedId === 'default') {
      defOption.selected = true;
    }
  } catch (err) {
    console.warn('[Settings] Failed to enumerate audio devices:', err);
  }
}

audioDeviceSelect?.addEventListener('change', async (e) => {
  await window.veoflow.saveSetting('audio_device_id', e.target.value);
  showNotice('Audio input device saved');
});

document.getElementById('refreshAudioDevicesBtn')?.addEventListener('click', async () => {
  const settings = await window.veoflow.getSettings();
  await populateAudioDevices(settings.audio_device_id || 'default');
  showNotice('Audio devices refreshed');
});

document.getElementById('saveHotkeyBtn')?.addEventListener('click', async () => {
  const val = hotkeyInput.value.trim();
  if (val) {
    await window.veoflow.saveSetting('hotkey', val);
    showNotice(`Global shortcut updated to ${val}`);
    loadDashboard();
  }
});

toneSelect?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('tone_preference', toneSelect.value);
  showNotice(`Tone preference updated to ${toneSelect.value}`);
});

autoPasteToggle?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('auto_paste', String(autoPasteToggle.checked));
  showNotice(`Auto-paste ${autoPasteToggle.checked ? 'enabled' : 'disabled'}`);
});

startupToggle?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('launch_at_startup', String(startupToggle.checked));
  showNotice(`Launch at startup ${startupToggle.checked ? 'enabled' : 'disabled'}`);
});

// ============================================================================
// 6. CUSTOM DICTIONARY
// ============================================================================
const dictionaryBody = document.getElementById('dictionaryBody');
const dictWordInput = document.getElementById('dictWordInput');
const dictRepInput = document.getElementById('dictRepInput');

async function loadDictionary() {
  if (!window.veoflow) return;
  const dict = await window.veoflow.getDictionary();
  dictionaryBody.innerHTML = '';

  if (!dict || dict.length === 0) {
    dictionaryBody.innerHTML = '<tr><td colspan="3" class="empty-state">No custom vocabulary added yet.</td></tr>';
    return;
  }

  dict.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(item.trigger_word)}</code></td>
      <td><strong>${escapeHtml(item.replacement)}</strong></td>
      <td>
        <button class="btn-sm-del">Delete</button>
      </td>
    `;
    tr.querySelector('.btn-sm-del').addEventListener('click', async () => {
      await window.veoflow.deleteDictionaryWord(item.id);
      loadDictionary();
      showNotice('Substitution removed');
    });
    dictionaryBody.appendChild(tr);
  });
}

document.getElementById('addDictBtn')?.addEventListener('click', async () => {
  const word = dictWordInput.value.trim();
  const rep = dictRepInput.value.trim();
  if (word && rep) {
    await window.veoflow.addDictionaryWord(word, rep);
    dictWordInput.value = '';
    dictRepInput.value = '';
    loadDictionary();
    showNotice(`Added substitution: "${word}" -> "${rep}"`);
  }
});

// ============================================================================
// 7. VOICE SNIPPETS
// ============================================================================
const snippetsBody = document.getElementById('snippetsBody');
const snippetTriggerInput = document.getElementById('snippetTriggerInput');
const snippetTextInput = document.getElementById('snippetTextInput');

async function loadSnippets() {
  if (!window.veoflow) return;
  const snippets = await window.veoflow.getSnippets();
  snippetsBody.innerHTML = '';

  if (!snippets || snippets.length === 0) {
    snippetsBody.innerHTML = '<tr><td colspan="3" class="empty-state">No voice snippets created yet.</td></tr>';
    return;
  }

  snippets.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>"${escapeHtml(item.shortcut)}"</code></td>
      <td><span style="color:#cbd5e1;">${escapeHtml(item.expanded_text)}</span></td>
      <td>
        <button class="btn-sm-del">Delete</button>
      </td>
    `;
    tr.querySelector('.btn-sm-del').addEventListener('click', async () => {
      await window.veoflow.deleteSnippet(item.id);
      loadSnippets();
      showNotice('Snippet removed');
    });
    snippetsBody.appendChild(tr);
  });
}

document.getElementById('addSnippetBtn')?.addEventListener('click', async () => {
  const trigger = snippetTriggerInput.value.trim();
  const text = snippetTextInput.value.trim();
  if (trigger && text) {
    await window.veoflow.addSnippet(trigger, text);
    snippetTriggerInput.value = '';
    snippetTextInput.value = '';
    loadSnippets();
    showNotice(`Added snippet for "${trigger}"`);
  }
});

// ============================================================================
// 8. PRIVACY CONTROLS & APPLICATION RULES
// ============================================================================
const privacyAllowWindowTitle = document.getElementById('privacyAllowWindowTitle');
const privacyAllowBrowserUrl = document.getElementById('privacyAllowBrowserUrl');
const privacyAllowSelectedText = document.getElementById('privacyAllowSelectedText');
const privacyAllowSurroundingText = document.getElementById('privacyAllowSurroundingText');
const appRulesBody = document.getElementById('appRulesBody');
const appRuleProcess = document.getElementById('appRuleProcess');
const appRuleCategory = document.getElementById('appRuleCategory');
const appRuleTone = document.getElementById('appRuleTone');

async function loadPrivacy() {
  if (!window.veoflow) return;
  const [settings, rules] = await Promise.all([
    window.veoflow.getSettings(),
    window.veoflow.getAppRules()
  ]);

  privacyAllowWindowTitle.checked = (settings.privacy_allow_window_title !== 'false');
  privacyAllowBrowserUrl.checked = (settings.privacy_allow_browser_url !== 'false');
  privacyAllowSelectedText.checked = (settings.privacy_allow_selected_text === 'true');
  privacyAllowSurroundingText.checked = (settings.privacy_allow_surrounding_text === 'true');

  renderAppRulesTable(rules || []);
}

function renderAppRulesTable(rules) {
  appRulesBody.innerHTML = '';
  if (!rules || rules.length === 0) {
    appRulesBody.innerHTML = '<tr><td colspan="4" class="empty-state">No custom application rules configured yet.</td></tr>';
    return;
  }

  rules.forEach(rule => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(rule.process_name)}</code></td>
      <td><strong>${escapeHtml(rule.category)}</strong></td>
      <td><span style="color:#00f2fe;">${escapeHtml(rule.tone || 'contextual')}</span></td>
      <td>
        <button class="btn-sm-del">Delete</button>
      </td>
    `;
    tr.querySelector('.btn-sm-del').addEventListener('click', async () => {
      await window.veoflow.deleteAppRule(rule.id);
      loadPrivacy();
      showNotice('Application rule removed');
    });
    appRulesBody.appendChild(tr);
  });
}

// Privacy Toggles listeners
privacyAllowWindowTitle?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('privacy_allow_window_title', String(privacyAllowWindowTitle.checked));
  showNotice(`Window title capture ${privacyAllowWindowTitle.checked ? 'enabled' : 'disabled'}`);
});

privacyAllowBrowserUrl?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('privacy_allow_browser_url', String(privacyAllowBrowserUrl.checked));
  showNotice(`Browser URL capture ${privacyAllowBrowserUrl.checked ? 'enabled' : 'disabled'}`);
});

privacyAllowSelectedText?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('privacy_allow_selected_text', String(privacyAllowSelectedText.checked));
  showNotice(`Selected text capture ${privacyAllowSelectedText.checked ? 'enabled' : 'disabled'}`);
});

privacyAllowSurroundingText?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('privacy_allow_surrounding_text', String(privacyAllowSurroundingText.checked));
  showNotice(`Surrounding text capture ${privacyAllowSurroundingText.checked ? 'enabled' : 'disabled'}`);
});

// Add App Rule
document.getElementById('addAppRuleBtn')?.addEventListener('click', async () => {
  const proc = appRuleProcess.value.trim();
  const cat = appRuleCategory.value;
  const tone = appRuleTone.value;

  if (proc) {
    await window.veoflow.addAppRule(proc, cat, tone);
    appRuleProcess.value = '';
    loadPrivacy();
    showNotice(`Added rule for ${proc}`);
  }
});

// ============================================================================
// 9. HELPER UTILITIES
// ============================================================================
function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  showNotice('Copied to clipboard');
}

function showNotice(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #00f2fe;
    color: #0b0f17;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 9999;
    animation: fadeIn 0.2s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  loadAiSettings();
});
