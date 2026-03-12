const captureBtn = document.getElementById('captureBtn');
const clearAllImagesBtn = document.getElementById('clearAllImagesBtn');
const runBtn = document.getElementById('runBtn');
const imageGallery = document.getElementById('imageGallery');
const promptInput = document.getElementById('prompt');
const expectedInput = document.getElementById('expected');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const apiKeyInput = document.getElementById('apiKey');
const toggleKeyBtn = document.getElementById('toggleKey');
const saveSettingsBtn = document.getElementById('saveSettings');
const settingsSaved = document.getElementById('settingsSaved');
const modelSelect = document.getElementById('model');
const runsList = document.getElementById('runsList');

let images = []; // { id, dataUrl, label }
let selectedImageId = null;
let imageCounter = 0;
let runs = [];
let activeRunId = null;

function getSelectedImage() {
  const img = images.find(i => i.id === selectedImageId);
  return img ? img.dataUrl : null;
}

// Settings
const serverUrlInput = document.getElementById('serverUrl');
const serverPasswordInput = document.getElementById('serverPassword');

settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
toggleKeyBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});
saveSettingsBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({
    serverUrl: serverUrlInput.value.trim().replace(/\/$/, ''),
    serverPassword: serverPasswordInput.value.trim(),
    geminiApiKey: apiKeyInput.value.trim(),
    geminiModel: modelSelect.value
  });
  settingsSaved.classList.remove('hidden');
  setTimeout(() => settingsSaved.classList.add('hidden'), 2000);
});

// Welcome screen
const welcome = document.getElementById('welcome');
const mainUI = document.getElementById('mainUI');
const welcomeServerUrl = document.getElementById('welcomeServerUrl');
const welcomeServerPassword = document.getElementById('welcomeServerPassword');
const welcomeApiKey = document.getElementById('welcomeApiKey');
const welcomeModel = document.getElementById('welcomeModel');
const welcomeSave = document.getElementById('welcomeSave');

welcomeSave.addEventListener('click', async () => {
  const serverUrl = welcomeServerUrl.value.trim().replace(/\/$/, '');
  const key = welcomeApiKey.value.trim();
  if (!serverUrl && !key) { welcomeServerUrl.focus(); return; }
  await chrome.storage.local.set({
    serverUrl: serverUrl,
    serverPassword: welcomeServerPassword.value.trim(),
    geminiApiKey: key,
    geminiModel: welcomeModel.value
  });
  serverUrlInput.value = serverUrl;
  serverPasswordInput.value = welcomeServerPassword.value.trim();
  apiKeyInput.value = key;
  modelSelect.value = welcomeModel.value;
  welcome.classList.add('hidden');
  mainUI.classList.remove('hidden');
});

// Load saved state
async function init() {
  const data = await chrome.storage.local.get([
    'serverUrl', 'serverPassword', 'geminiApiKey', 'geminiModel',
    'capturedImages', 'captureError',
    'savedPrompt', 'savedExpected'
  ]);

  // Show welcome screen if not configured
  if (!data.geminiApiKey && !data.serverUrl) {
    welcome.classList.remove('hidden');
    mainUI.classList.add('hidden');
  } else {
    welcome.classList.add('hidden');
    mainUI.classList.remove('hidden');
  }

  if (data.serverUrl) serverUrlInput.value = data.serverUrl;
  if (data.serverPassword) serverPasswordInput.value = data.serverPassword;

  if (data.geminiApiKey) apiKeyInput.value = data.geminiApiKey;
  if (data.geminiModel) modelSelect.value = data.geminiModel;
  if (data.savedPrompt) promptInput.value = data.savedPrompt;
  if (data.savedExpected) expectedInput.value = data.savedExpected;
  if (data.capturedImages && data.capturedImages.length > 0) {
    images = data.capturedImages;
    imageCounter = Math.max(...images.map(i => i.id)) + 1;
    selectedImageId = images[images.length - 1].id;
    renderGallery();
  }
  if (data.captureError) {
    await chrome.storage.local.remove(['captureError']);
  }
  updateRunButton();
}
init();

function updateRunButton() {
  runBtn.disabled = !(getSelectedImage() && promptInput.value.trim() && expectedInput.value.trim());
}

promptInput.addEventListener('input', () => {
  chrome.storage.local.set({ savedPrompt: promptInput.value });
  updateRunButton();
});
expectedInput.addEventListener('input', () => {
  chrome.storage.local.set({ savedExpected: expectedInput.value });
  updateRunButton();
});

// Image management
function addImage(dataUrl) {
  const id = imageCounter++;
  images.push({ id, dataUrl, label: `#${id + 1}` });
  selectedImageId = id;
  saveImages();
  renderGallery();
  updateRunButton();
}

function removeImage(id) {
  images = images.filter(i => i.id !== id);
  if (selectedImageId === id) {
    selectedImageId = images.length > 0 ? images[images.length - 1].id : null;
  }
  saveImages();
  renderGallery();
  updateRunButton();
}

function selectImage(id) {
  selectedImageId = id;
  renderGallery();
  updateRunButton();
}

function saveImages() {
  chrome.storage.local.set({ capturedImages: images });
}

function renderGallery() {
  if (images.length === 0) {
    imageGallery.classList.add('hidden');
    clearAllImagesBtn.classList.add('hidden');
    return;
  }
  imageGallery.classList.remove('hidden');
  clearAllImagesBtn.classList.remove('hidden');

  imageGallery.innerHTML = '';
  images.forEach(img => {
    const item = document.createElement('div');
    item.className = 'gallery-item' + (img.id === selectedImageId ? ' selected' : '');
    item.innerHTML = `
      <img src="${img.dataUrl}" alt="Capture ${img.label}">
      <button class="gallery-item-remove" data-img-id="${img.id}">&times;</button>
      <div class="gallery-item-label">${img.label}</div>`;
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('gallery-item-remove')) return;
      selectImage(img.id);
    });
    const removeBtn = item.querySelector('.gallery-item-remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(img.id);
    });
    imageGallery.appendChild(item);
  });
}

clearAllImagesBtn.addEventListener('click', () => {
  images = [];
  selectedImageId = null;
  saveImages();
  renderGallery();
  updateRunButton();
});

// Messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'regionCaptured') {
    addImage(message.imageData);
  } else if (message.action === 'geminiChunk') {
    if (activeRunId !== null) {
      appendRunOutput(activeRunId, message.text);
    }
  } else if (message.action === 'geminiDone') {
    if (activeRunId !== null) {
      const run = getRun(activeRunId);
      run.result = message.result;
      run.status = 'evaluating';
      removeCursorFromRun(activeRunId);
      renderRunCard(activeRunId);
      runEvaluation(activeRunId);
    }
  } else if (message.action === 'geminiError') {
    if (activeRunId !== null) {
      const run = getRun(activeRunId);
      run.status = 'error';
      removeCursorFromRun(activeRunId);
      appendRunOutput(activeRunId, `\nError: ${message.error}`, true);
      renderRunCard(activeRunId);
      activeRunId = null;
      updateRunButton();
    }
  } else if (message.action === 'evalResult') {
    if (message.runId !== undefined) {
      const run = getRun(message.runId);
      if (run) {
        run.evalData = message.evaluation;
        run.status = 'done';
        renderRunCard(message.runId);
        updateRunButton();
      }
    }
  } else if (message.action === 'evalError') {
    if (message.runId !== undefined) {
      const run = getRun(message.runId);
      if (run) {
        run.evalError = message.error;
        run.status = 'done';
        renderRunCard(message.runId);
        updateRunButton();
      }
    }
  }
});

// Capture
captureBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['captureError']);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ action: 'startCapture', tabId: tab.id });
});

// Run
runBtn.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  const expected = expectedInput.value.trim();
  const currentImage = getSelectedImage();
  if (!currentImage || !prompt || !expected) return;

  const runId = runs.length;
  const run = {
    id: runId,
    question: prompt,
    expected: expected,
    imageData: currentImage,
    status: 'running',
    output: '',
    result: '',
    evalData: null,
    evalError: null
  };
  runs.push(run);
  activeRunId = runId;

  runBtn.disabled = true;
  createRunCard(run);

  const settings = await chrome.storage.local.get(['geminiApiKey', 'geminiModel']);
  chrome.runtime.sendMessage({
    action: 'runGemini',
    imageData: currentImage,
    prompt: prompt,
    apiKey: settings.geminiApiKey || '',
    model: settings.geminiModel || ''
  });

  promptInput.value = '';
  expectedInput.value = '';
  chrome.storage.local.remove(['savedPrompt', 'savedExpected']);
});

async function runEvaluation(runId) {
  const run = getRun(runId);
  const settings = await chrome.storage.local.get(['geminiApiKey', 'geminiModel']);

  chrome.runtime.sendMessage({
    action: 'evaluate',
    runId: runId,
    prompt: run.question,
    expected: run.expected,
    actual: run.result,
    apiKey: settings.geminiApiKey || '',
    model: settings.geminiModel || ''
  });
}

function getRun(id) {
  return runs.find(r => r && r.id === id);
}

function deleteRun(runId) {
  const idx = runs.findIndex(r => r && r.id === runId);
  if (idx !== -1) runs[idx] = null;
  const card = document.getElementById(`run-${runId}`);
  if (card) {
    card.style.transition = 'opacity 0.2s, max-height 0.3s';
    card.style.opacity = '0';
    card.style.maxHeight = card.scrollHeight + 'px';
    requestAnimationFrame(() => { card.style.maxHeight = '0'; });
    setTimeout(() => card.remove(), 300);
  }
}

// ---- DOM ----

function createRunCard(run) {
  const card = document.createElement('div');
  card.className = 'run-card open';
  card.id = `run-${run.id}`;
  card.innerHTML = buildCardHTML(run);
  runsList.prepend(card);

  runsList.querySelectorAll('.run-card').forEach(c => {
    if (c !== card) c.classList.remove('open');
  });

  attachCardHandlers(card);
  addCursorToExec(run.id);

  const execEl = card.querySelector('.run-exec');
  const q = run.question;
  const cmdSpan = document.createElement('span');
  cmdSpan.className = 'chunk';
  cmdSpan.textContent = '$ gemini -p "@image.jpg ' + q.substring(0, 40) + (q.length > 40 ? '...' : '') + '"\n\n';
  execEl.insertBefore(cmdSpan, execEl.querySelector('.cursor'));
}

function buildCardHTML(run) {
  let badgeHTML = '';
  let scoreHTML = '';

  if (run.status === 'running') {
    badgeHTML = '<span class="run-badge running">Running</span>';
  } else if (run.status === 'evaluating') {
    badgeHTML = '<span class="run-badge evaluating">Evaluating</span>';
  } else if (run.status === 'error') {
    badgeHTML = '<span class="run-badge error">Error</span>';
  } else if (run.status === 'done' && run.evalData) {
    const o = run.evalData.overall;
    const cls = o >= 70 ? 'pass' : o >= 40 ? 'partial' : 'fail';
    badgeHTML = '<span class="run-badge done">Done</span>';
    scoreHTML = `<span class="run-score ${cls}">${o}%</span>`;
  } else {
    badgeHTML = '<span class="run-badge done">Done</span>';
  }

  const editable = run.status === 'done' || run.status === 'error';

  let bodyHTML = '';

  // Image thumbnail
  if (run.imageData) {
    bodyHTML += `<div class="run-image-thumb"><img src="${run.imageData}" alt="Captured region"></div>`;
  }

  // Editable prompt/expected when done
  if (editable) {
    bodyHTML += `
      <div class="run-edit-section">
        <div class="run-edit-row">
          <label>Question</label>
          <textarea class="run-edit-prompt" rows="2">${escapeHTML(run.question)}</textarea>
        </div>
        <div class="run-edit-row">
          <label>Expected Answer</label>
          <textarea class="run-edit-expected" rows="2">${escapeHTML(run.expected)}</textarea>
        </div>
        <div class="run-edit-actions">
          <button class="btn-rerun" data-run-id="${run.id}">Rerun</button>
          <button class="btn-export" data-run-id="${run.id}">Export</button>
          <button class="btn-delete" data-run-id="${run.id}">Delete</button>
        </div>
      </div>`;
  }

  bodyHTML += `<div class="run-exec"></div>`;

  if (run.result) {
    bodyHTML += `
      <div class="run-results">
        <div class="run-results-grid">
          <div>
            <div class="run-result-label">Expected</div>
            <div class="run-result-box">${escapeHTML(run.expected)}</div>
          </div>
          <div>
            <div class="run-result-label">Gemini's Answer</div>
            <div class="run-result-box">${renderMarkdown(run.result)}</div>
          </div>
        </div>
      </div>`;
  }

  if (run.evalData) {
    const e = run.evalData;
    const cls = e.overall >= 70 ? 'pass' : e.overall >= 40 ? 'partial' : 'fail';
    bodyHTML += `
      <div class="run-eval">
        <div class="run-eval-header">
          <h3>Evaluation</h3>
          <span class="eval-score-lg ${cls}">${e.overall}%</span>
        </div>
        ${evalBarHTML('Semantic Match', e.semantic_match, `sem-${run.id}`)}
        ${evalBarHTML('Key Facts', e.key_facts, `facts-${run.id}`)}
        ${evalBarHTML('Completeness', e.completeness, `comp-${run.id}`)}
        <div class="eval-reasoning">${escapeHTML(e.reasoning || '')}</div>
      </div>`;
  } else if (run.evalError) {
    bodyHTML += `<div class="run-eval"><div class="eval-reasoning" style="color:#d93025">Eval failed: ${escapeHTML(run.evalError)}</div></div>`;
  }

  return `
    <div class="run-banner">
      <span class="run-chevron">&#9654;</span>
      <span class="run-question">${escapeHTML(run.question)}</span>
      ${scoreHTML}
      ${badgeHTML}
    </div>
    <div class="run-body">${bodyHTML}</div>`;
}

function renderRunCard(runId) {
  const run = getRun(runId);
  if (!run) return;
  const card = document.getElementById(`run-${runId}`);
  if (!card) return;

  const wasOpen = card.classList.contains('open');
  const execEl = card.querySelector('.run-exec');
  const savedExecHTML = execEl ? execEl.innerHTML : '';

  card.innerHTML = buildCardHTML(run);
  if (wasOpen) card.classList.add('open');
  attachCardHandlers(card);

  const newExecEl = card.querySelector('.run-exec');
  if (newExecEl && savedExecHTML) {
    newExecEl.innerHTML = savedExecHTML;
  }

  if (run.evalData) {
    setTimeout(() => {
      animateBar(`sem-${runId}`, run.evalData.semantic_match);
      animateBar(`facts-${runId}`, run.evalData.key_facts);
      animateBar(`comp-${runId}`, run.evalData.completeness);
    }, 50);
  }
}

function attachCardHandlers(card) {
  // Banner toggle
  const banner = card.querySelector('.run-banner');
  banner.addEventListener('click', () => card.classList.toggle('open'));

  // Rerun
  const rerunBtn = card.querySelector('.btn-rerun');
  if (rerunBtn) {
    rerunBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const oldRunId = parseInt(rerunBtn.dataset.runId);
      const oldRun = getRun(oldRunId);
      if (!oldRun) return;

      const editPrompt = card.querySelector('.run-edit-prompt');
      const editExpected = card.querySelector('.run-edit-expected');
      const newQuestion = editPrompt ? editPrompt.value.trim() : oldRun.question;
      const newExpected = editExpected ? editExpected.value.trim() : oldRun.expected;
      const img = oldRun.imageData || capturedImage;

      if (!img || !newQuestion || !newExpected) return;

      const runId = runs.length;
      const run = {
        id: runId,
        question: newQuestion,
        expected: newExpected,
        imageData: img,
        status: 'running',
        output: '',
        result: '',
        evalData: null,
        evalError: null
      };
      runs.push(run);
      activeRunId = runId;

      createRunCard(run);
      card.classList.remove('open');

      const settings = await chrome.storage.local.get(['geminiApiKey', 'geminiModel']);
      chrome.runtime.sendMessage({
        action: 'runGemini',
        imageData: img,
        prompt: newQuestion,
        apiKey: settings.geminiApiKey || '',
        model: settings.geminiModel || ''
      });
    });
  }

  // Export
  const exportBtn = card.querySelector('.btn-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportRun(parseInt(exportBtn.dataset.runId));
    });
  }

  // Delete
  const deleteBtn = card.querySelector('.btn-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRun(parseInt(deleteBtn.dataset.runId));
    });
  }
}

function appendRunOutput(runId, text, isError) {
  const card = document.getElementById(`run-${runId}`);
  if (!card) return;
  const execEl = card.querySelector('.run-exec');
  if (!execEl) return;

  const cursor = execEl.querySelector('.cursor');
  if (cursor) cursor.remove();

  const span = document.createElement('span');
  span.className = 'chunk';
  if (isError) span.style.color = '#ff6b6b';
  span.textContent = text;
  execEl.appendChild(span);

  addCursorToExec(runId);
  execEl.scrollTop = execEl.scrollHeight;

  const run = getRun(runId);
  if (run) run.output += text;
}

function addCursorToExec(runId) {
  const card = document.getElementById(`run-${runId}`);
  if (!card) return;
  const execEl = card.querySelector('.run-exec');
  if (!execEl) return;
  removeCursorFromRun(runId);
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  execEl.appendChild(cursor);
}

function removeCursorFromRun(runId) {
  const card = document.getElementById(`run-${runId}`);
  if (!card) return;
  const cursor = card.querySelector('.run-exec .cursor');
  if (cursor) cursor.remove();
}

function evalBarHTML(label, value, barId) {
  const v = Math.max(0, Math.min(100, value || 0));
  const cls = v >= 70 ? 'high' : v >= 40 ? 'mid' : 'low';
  return `
    <div class="eval-row">
      <span class="eval-label">${label}</span>
      <div class="eval-bar-container">
        <div id="bar-${barId}" class="eval-bar ${cls}" style="width:0%"></div>
      </div>
      <span class="eval-pct">${v}%</span>
    </div>`;
}

function animateBar(barId, value) {
  const bar = document.getElementById(`bar-${barId}`);
  if (bar) bar.style.width = Math.max(0, Math.min(100, value || 0)) + '%';
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(str) {
  let html = escapeHTML(str);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ---- Export ----

function base64ToUint8Array(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

function buildRunZipFolder(zip, run, prefix) {
  const folder = prefix ? zip.folder(prefix) : zip;

  folder.file('prompt.txt', run.question);
  folder.file('answer.txt', run.expected);

  if (run.imageData) {
    const ext = run.imageData.startsWith('data:image/png') ? 'png' : 'jpg';
    const artifacts = folder.folder('artifacts');
    artifacts.file(`image.${ext}`, base64ToUint8Array(run.imageData));
  }

  if (run.result) {
    folder.file('gemini_response.txt', run.result);
  }

  if (run.evalData) {
    folder.file('evaluation.json', JSON.stringify(run.evalData, null, 2));
  }
}

async function exportRun(runId) {
  const run = getRun(runId);
  if (!run) return;

  const zip = new JSZip();
  buildRunZipFolder(zip, run, null);

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `run-${runId + 1}.zip`);
}

async function exportAllRuns() {
  const validRuns = runs.filter(r => r !== null);
  if (validRuns.length === 0) return;

  const zip = new JSZip();
  validRuns.forEach((run, i) => {
    const folderName = `run-${i + 1}`;
    buildRunZipFolder(zip, run, folderName);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(blob, `diagram-qa-export-${ts}.zip`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export All button
const exportAllSection = document.getElementById('exportAllSection');
const exportAllBtn = document.getElementById('exportAllBtn');
exportAllBtn.addEventListener('click', () => exportAllRuns());

// Show/hide Export All based on runs
const origCreateRunCard = createRunCard;
createRunCard = function(run) {
  origCreateRunCard(run);
  exportAllSection.classList.remove('hidden');
};
