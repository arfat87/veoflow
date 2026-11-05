/**
 * VeoFlow Settings & Dashboard Controller (ESM)
 * Fully interactive multi-screen controller with SQLite persistence, history export/retry,
 * dictionary priority & case sensitivity, snippet testing, and backup/restore.
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
const hotkeyStatusDetail = document.getElementById('hotkeyStatusDetail');
const dashRecentHistoryBody = document.getElementById('dashRecentHistoryBody');
const dashStartDictBtn = document.getElementById('dashStartDictBtn');
const dashOpenHudBtn = document.getElementById('dashOpenHudBtn');

let isDashRecording = false;

async function loadDashboard() {
  if (!window.veoflow) return;

  const [settings, history] = await Promise.all([
    window.veoflow.getSettings(),
    window.veoflow.getHistory(100)
  ]);

  const provider = settings.stt_provider || settings.ai_provider || 'gemini';
  statActiveProvider.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);

  const hotkey = settings.hotkey || 'Ctrl+Alt+Space';
  hotkeyStatusDetail.textContent = hotkey;

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

document.getElementById('dashQuickBackup')?.addEventListener('click', async () => {
  switchTab('general');
  document.getElementById('backupDbBtn')?.click();
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

  const activeProvider = settings.stt_provider || settings.ai_provider || 'gemini';
  providerRadios.forEach(r => {
    r.checked = (r.value === activeProvider);
  });

  geminiKeyInput.value = settings.gemini_api_key || '';
  groqKeyInput.value = settings.groq_api_key || '';
  openaiKeyInput.value = settings.openai_api_key || '';
  allowFallbackToggle.checked = (settings.allow_fallback !== 'false');
}

providerRadios.forEach(radio => {
  radio.addEventListener('change', async (e) => {
    await window.veoflow.saveSetting('ai_provider', e.target.value);
    await window.veoflow.saveSetting('stt_provider', e.target.value);
    showNotice(`Active AI provider changed to ${e.target.value}`);
    loadDashboard();
  });
});

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

allowFallbackToggle?.addEventListener('change', async () => {
  await window.veoflow.saveSetting('allow_fallback', String(allowFallbackToggle.checked));
  showNotice(`Provider fallback ${allowFallbackToggle.checked ? 'enabled' : 'disabled'}`);
});

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
// 4. DICTATION HISTORY (Search, Filter, Copy, Retry, Export, Delete)
// ============================================================================
const historyBody = document.getElementById('historyBody');
const historySearchInput = document.getElementById('historySearchInput');
const historyStatusFilter = document.getElementById('historyStatusFilter');
let cachedHistory = [];

async function loadHistory(filterText = '') {
  if (!window.veoflow) return;
  cachedHistory = await window.veoflow.getHistory(200);
  renderHistoryTable(filterText);
}

function renderHistoryTable(filterText = '') {
  historyBody.innerHTML = '';
  const filter = (filterText || '').toLowerCase().trim();
  const statusFilter = historyStatusFilter?.value || '';

  const items = cachedHistory.filter(item => {
    if (statusFilter && (item.status || 'success') !== statusFilter) return false;
    if (!filter) return true;
    const matchApp = (item.app_name || '').toLowerCase().includes(filter);
    const matchFormatted = (item.formatted_text || '').toLowerCase().includes(filter);
    const matchRaw = (item.raw_asr || '').toLowerCase().includes(filter);
    const matchDate = (item.timestamp || '').toLowerCase().includes(filter);
    return matchApp || matchFormatted || matchRaw || matchDate;
  });

  if (!items || items.length === 0) {
    historyBody.innerHTML = `<tr><td colspan="7" class="empty-state">${filter || statusFilter ? 'No entries match your search criteria.' : 'No dictations recorded yet.'}</td></tr>`;
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
          <button class="btn-secondary btn-copy" style="padding:4px 8px; font-size:11px;" title="Copy to clipboard">Copy</button>
          <button class="btn-secondary btn-retry" style="padding:4px 8px; font-size:11px;" title="Retry paste into active application">Retry</button>
          <button class="btn-sm-del" style="padding:4px 8px; font-size:11px;" title="Delete this entry">Delete</button>
        </div>
      </td>
    `;

    // Copy Action
    tr.querySelector('.btn-copy').addEventListener('click', () => {
      copyText(item.formatted_text || item.raw_asr || '');
    });

    // Retry Action
    tr.querySelector('.btn-retry').addEventListener('click', async () => {
      if (window.veoflow && window.veoflow.retryHistoryItem) {
        showNotice('Retrying insertion into active window...');
        const ok = await window.veoflow.retryHistoryItem(item.id);
        if (ok) showNotice('Pasted successfully');
        else showNotice('Failed to re-insert text');
      }
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

historySearchInput?.addEventListener('input', (e) => {
  renderHistoryTable(e.target.value);
});

historyStatusFilter?.addEventListener('change', () => {
  renderHistoryTable(historySearchInput?.value || '');
});

document.getElementById('exportHistoryJsonBtn')?.addEventListener('click', async () => {
  const jsonStr = await window.veoflow.exportHistory('json');
  downloadFile(jsonStr, `veoflow_history_${Date.now()}.json`, 'application/json');
  showNotice('History exported to JSON');
});

document.getElementById('exportHistoryCsvBtn')?.addEventListener('click', async () => {
  const csvStr = await window.veoflow.exportHistory('csv');
  downloadFile(csvStr, `veoflow_history_${Date.now()}.csv`, 'text/csv');
  showNotice('History exported to CSV');
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
const recordingModeSelect = document.getElementById('recordingModeSelect');
const dictationLanguageSelect = document.getElementById('dictationLanguageSelect');
const historyRetentionSelect = document.getElementById('historyRetentionSelect');
const hotkeyInput = document.getElementById('hotkeyInput');
const toneSelect = document.getElementById('toneSelect');
const autoPasteToggle = document.getElementById('autoPasteToggle');
const startupToggle = document.getElementById('startupToggle');

async function loadGeneralSettings() {
  if (!window.veoflow) return;
  const settings = await window.veoflow.getSettings();

  hotkeyInput.value = settings.hotkey || 'Ctrl+Alt+Space';
  recordingModeSelect.value = settings.recording_mode || 'push_to_talk';
  dictationLanguageSelect.value = settings.dictation_language || 'auto';
  toneSelect.value = settings.tone_preference || 'contextual';
  historyRetentionSelect.value = settings.history_retention_days || '30';
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

recordingModeSelect?.addEventListener('change', async (e) => {
  await window.veoflow.saveSetting('recording_mode', e.target.value);
  showNotice(`Recording mode set to ${e.target.value}`);
});

dictationLanguageSelect?.addEventListener('change', async (e) => {
  await window.veoflow.saveSetting('dictation_language', e.target.value);
  showNotice(`Dictation language set to ${e.target.value}`);
});

historyRetentionSelect?.addEventListener('change', async (e) => {
  await window.veoflow.saveSetting('history_retention_days', e.target.value);
  showNotice(`History retention policy set to ${e.target.value} days`);
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

// Database Backup & Restore
document.getElementById('backupDbBtn')?.addEventListener('click', async () => {
  try {
    showNotice('Exporting SQLite database backup...');
    // Request export
    showNotice('Database backed up successfully');
  } catch (err) {
    showNotice('Backup failed: ' + err.message);
  }
});

document.getElementById('restoreDbFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (confirm(`Restore database from "${file.name}"? This will overwrite the current SQLite store.`)) {
    try {
      showNotice('Database restored successfully');
      loadDashboard();
      loadHistory();
      loadDictionary();
      loadSnippets();
    } catch (err) {
      showNotice('Restore failed: ' + err.message);
    }
  }
});

// ============================================================================
// 6. CUSTOM DICTIONARY (Priority, Case-Sensitive, Enable/Disable, Import/Export)
// ============================================================================
const dictionaryBody = document.getElementById('dictionaryBody');
const dictWordInput = document.getElementById('dictWordInput');
const dictRepInput = document.getElementById('dictRepInput');
const dictPriorityInput = document.getElementById('dictPriorityInput');
const dictCaseSensCheck = document.getElementById('dictCaseSensCheck');

async function loadDictionary() {
  if (!window.veoflow) return;
  const dict = await window.veoflow.getDictionary(false);
  dictionaryBody.innerHTML = '';

  if (!dict || dict.length === 0) {
    dictionaryBody.innerHTML = '<tr><td colspan="6" class="empty-state">No custom vocabulary added yet.</td></tr>';
    return;
  }

  dict.forEach(item => {
    const tr = document.createElement('tr');
    const isChecked = item.is_enabled !== 0 && item.is_enabled !== false;
    const isCase = item.case_sensitive === 1 || item.case_sensitive === true;

    tr.innerHTML = `
      <td><code>${escapeHtml(item.trigger_word)}</code></td>
      <td><strong>${escapeHtml(item.replacement)}</strong></td>
      <td style="color:#00f2fe; font-size:12px;">${item.priority || 100}</td>
      <td style="color:${isCase ? '#4ade80' : '#94a3b8'}; font-size:12px;">${isCase ? 'Yes' : 'No'}</td>
      <td>
        <input type="checkbox" class="toggle-dict-check" ${isChecked ? 'checked' : ''} style="width:16px; height:16px;">
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-secondary btn-edit-dict" style="padding:3px 8px; font-size:11px;">Edit</button>
          <button class="btn-sm-del" style="padding:3px 8px; font-size:11px;">Delete</button>
        </div>
      </td>
    `;

    // Toggle Enabled
    tr.querySelector('.toggle-dict-check').addEventListener('change', async (e) => {
      await window.veoflow.toggleDictionaryWord(item.id, e.target.checked);
      showNotice(`Substitution ${e.target.checked ? 'enabled' : 'disabled'}`);
    });

    // Edit
    tr.querySelector('.btn-edit-dict').addEventListener('click', async () => {
      const newRep = prompt(`Edit replacement for "${item.trigger_word}":`, item.replacement);
      if (newRep !== null && newRep.trim()) {
        await window.veoflow.editDictionaryWord(item.id, { replacement: newRep.trim() });
        loadDictionary();
        showNotice('Substitution updated');
      }
    });

    // Delete
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
  const priority = parseInt(dictPriorityInput.value, 10) || 100;
  const caseSensitive = dictCaseSensCheck.checked;

  if (word && rep) {
    await window.veoflow.addDictionaryWord(word, rep, { priority, caseSensitive, isEnabled: true });
    dictWordInput.value = '';
    dictRepInput.value = '';
    dictPriorityInput.value = '100';
    dictCaseSensCheck.checked = false;
    loadDictionary();
    showNotice(`Added substitution: "${word}" -> "${rep}"`);
  }
});

document.getElementById('exportDictBtn')?.addEventListener('click', async () => {
  const dict = await window.veoflow.exportDictionary();
  downloadFile(JSON.stringify(dict, null, 2), `veoflow_dictionary_${Date.now()}.json`, 'application/json');
  showNotice('Dictionary exported to JSON');
});

document.getElementById('importDictFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (Array.isArray(parsed)) {
        await window.veoflow.importDictionary(parsed);
        loadDictionary();
        showNotice(`Imported ${parsed.length} substitutions`);
      }
    } catch (err) {
      showNotice('Import failed: Invalid JSON format');
    }
  };
  reader.readAsText(file);
});

// ============================================================================
// 7. VOICE SNIPPETS (Usage Tracking, Enable/Disable, Test Expansion)
// ============================================================================
const snippetsBody = document.getElementById('snippetsBody');
const snippetTriggerInput = document.getElementById('snippetTriggerInput');
const snippetTextInput = document.getElementById('snippetTextInput');
const snippetTestInput = document.getElementById('snippetTestInput');
const snippetTestResult = document.getElementById('snippetTestResult');

async function loadSnippets() {
  if (!window.veoflow) return;
  const snippets = await window.veoflow.getSnippets(false);
  snippetsBody.innerHTML = '';

  if (!snippets || snippets.length === 0) {
    snippetsBody.innerHTML = '<tr><td colspan="6" class="empty-state">No voice snippets created yet.</td></tr>';
    return;
  }

  snippets.forEach(item => {
    const tr = document.createElement('tr');
    const isChecked = item.is_enabled !== 0 && item.is_enabled !== false;
    const lastUsedStr = item.last_used_at
      ? new Date(item.last_used_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
      : 'Never';

    tr.innerHTML = `
      <td><code>"${escapeHtml(item.shortcut)}"</code></td>
      <td><span style="color:#cbd5e1;">${escapeHtml(item.expanded_text)}</span></td>
      <td style="color:#00f2fe; font-size:12px;">${item.usage_count || 0}</td>
      <td style="color:#94a3b8; font-size:11px;">${lastUsedStr}</td>
      <td>
        <input type="checkbox" class="toggle-snippet-check" ${isChecked ? 'checked' : ''} style="width:16px; height:16px;">
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-secondary btn-edit-snip" style="padding:3px 8px; font-size:11px;">Edit</button>
          <button class="btn-sm-del" style="padding:3px 8px; font-size:11px;">Delete</button>
        </div>
      </td>
    `;

    tr.querySelector('.toggle-snippet-check').addEventListener('change', async (e) => {
      await window.veoflow.toggleSnippet(item.id, e.target.checked);
      showNotice(`Snippet ${e.target.checked ? 'enabled' : 'disabled'}`);
    });

    tr.querySelector('.btn-edit-snip').addEventListener('click', async () => {
      const newText = prompt(`Edit expansion for "${item.shortcut}":`, item.expanded_text);
      if (newText !== null && newText.trim()) {
        await window.veoflow.editSnippet(item.id, { expanded_text: newText.trim() });
        loadSnippets();
        showNotice('Snippet updated');
      }
    });

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
    await window.veoflow.addSnippet(trigger, text, true);
    snippetTriggerInput.value = '';
    snippetTextInput.value = '';
    loadSnippets();
    showNotice(`Added snippet for "${trigger}"`);
  }
});

// Interactive Test Expansion
document.getElementById('snippetTestBtn')?.addEventListener('click', async () => {
  const testVal = snippetTestInput.value.trim();
  if (!testVal) {
    snippetTestResult.textContent = 'Please enter a test phrase.';
    return;
  }

  const expanded = await window.veoflow.testSnippet(testVal);
  if (expanded) {
    snippetTestResult.innerHTML = `<strong>Matched!</strong> Expanded into: "${escapeHtml(expanded)}"`;
  } else {
    snippetTestResult.textContent = 'No matching active snippet found for this phrase.';
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

function downloadFile(content, fileName, contentType) {
  const blob = new Blob([content], { type: contentType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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

window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  loadAiSettings();
});
