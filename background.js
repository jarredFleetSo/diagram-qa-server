// Diagram Q&A - Background Service Worker
// Calls remote API server running Gemini CLI

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    handleStartCapture(message.tabId);
    return false;
  }
  if (message.action === 'captureRegion') {
    handleCapture(message, sender);
    return false;
  }
  if (message.action === 'runGemini') {
    handleGeminiServer(message);
    return false;
  }
  if (message.action === 'evaluate') {
    handleEvalServer(message);
    return false;
  }
});

// ---- Capture ----

async function handleStartCapture(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

async function handleCapture(message, sender) {
  try {
    const { rect, devicePixelRatio } = message;
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    const croppedImage = await cropImage(dataUrl, rect, devicePixelRatio);

    await chrome.storage.local.set({
      capturedImage: croppedImage,
      captureTimestamp: Date.now()
    });

    chrome.runtime.sendMessage({ action: 'regionCaptured', imageData: croppedImage }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({ action: 'captureError', error: err.message }).catch(() => {});
  }
}

async function cropImage(dataUrl, rect, dpr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(
    Math.round(rect.width * dpr),
    Math.round(rect.height * dpr)
  );
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    bitmap,
    Math.round(rect.x * dpr), Math.round(rect.y * dpr),
    Math.round(rect.width * dpr), Math.round(rect.height * dpr),
    0, 0, canvas.width, canvas.height
  );

  const croppedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  return blobToDataUrl(croppedBlob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8Array(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

// ---- Server ----

async function getSettings() {
  return chrome.storage.local.get(['serverUrl', 'serverPassword']);
}

async function handleGeminiServer(message) {
  const { imageData, prompt, apiKey, model } = message;
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
  const imageBytes = base64ToUint8Array(base64);

  const settings = await getSettings();
  const serverUrl = settings.serverUrl || '';

  if (!serverUrl) {
    chrome.runtime.sendMessage({ action: 'geminiError', error: 'No server URL configured. Open settings and enter your server URL.' }).catch(() => {});
    return;
  }

  try {
    const headers = {
      'Content-Type': 'application/octet-stream',
      'x-prompt': prompt,
      'x-gemini-api-key': apiKey || '',
      'x-gemini-model': model || ''
    };
    if (settings.serverPassword) {
      headers['Authorization'] = `Bearer ${settings.serverPassword}`;
    }

    const response = await fetch(`${serverUrl}/run`, {
      method: 'POST',
      headers,
      body: imageBytes
    });

    if (!response.ok) {
      const err = await response.text();
      chrome.runtime.sendMessage({ action: 'geminiError', error: `Server error ${response.status}: ${err}` }).catch(() => {});
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResult = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'chunk') {
              fullResult += msg.text;
              chrome.runtime.sendMessage({ action: 'geminiChunk', text: msg.text }).catch(() => {});
            } else if (msg.type === 'done') {
              chrome.runtime.sendMessage({ action: 'geminiDone', result: fullResult }).catch(() => {});
            } else if (msg.type === 'error') {
              chrome.runtime.sendMessage({ action: 'geminiError', error: msg.error }).catch(() => {});
            }
          } catch (e) {
            // Skip malformed events
          }
        }
      }
    }
  } catch (err) {
    chrome.runtime.sendMessage({ action: 'geminiError', error: `Server request failed: ${err.message}` }).catch(() => {});
  }
}

async function handleEvalServer(message) {
  const { runId, prompt, expected, actual, apiKey, model } = message;
  const evalPrompt = buildEvalPrompt(prompt, expected, actual);

  const settings = await getSettings();
  const serverUrl = settings.serverUrl || '';

  if (!serverUrl) {
    chrome.runtime.sendMessage({ action: 'evalError', runId, error: 'No server URL configured.' }).catch(() => {});
    return;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (settings.serverPassword) {
      headers['Authorization'] = `Bearer ${settings.serverPassword}`;
    }

    const response = await fetch(`${serverUrl}/eval`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt: evalPrompt, apiKey: apiKey || '', model: model || '' })
    });

    const data = await response.json();

    if (data.error) {
      chrome.runtime.sendMessage({ action: 'evalError', runId, error: data.error }).catch(() => {});
      return;
    }

    let cleaned = data.result.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const evalData = JSON.parse(cleaned);
    chrome.runtime.sendMessage({ action: 'evalResult', runId, evaluation: evalData }).catch(() => {});
  } catch (e) {
    chrome.runtime.sendMessage({ action: 'evalError', runId, error: `Eval failed: ${e.message}` }).catch(() => {});
  }
}

function buildEvalPrompt(prompt, expected, actual) {
  return `You are an RL reward model evaluating an agent's answer against an expected answer.

QUESTION: ${prompt}

EXPECTED ANSWER: ${expected}

AGENT'S ANSWER: ${actual}

Score the agent's answer on these dimensions (0-100 each):
1. semantic_match: How semantically similar is the agent's answer to the expected answer?
2. key_facts: What percentage of the key facts from the expected answer appear in the agent's answer?
3. completeness: How complete is the agent's answer relative to what was expected?

Also compute an overall score (weighted average: semantic 40%, key_facts 35%, completeness 25%).

Respond ONLY with valid JSON, no markdown, no code fences:
{"overall": <int>, "semantic_match": <int>, "key_facts": <int>, "completeness": <int>, "reasoning": "<brief 1-2 sentence explanation>"}`;
}
