const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const SERVER_PASSWORD = process.env.SERVER_PASSWORD || '';

app.use(cors());

// Auth middleware
function authenticate(req, res, next) {
  if (!SERVER_PASSWORD) return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  if (auth.slice(7) !== SERVER_PASSWORD) {
    return res.status(403).json({ error: 'Invalid password' });
  }
  next();
}

app.use(authenticate);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Run Gemini with image + prompt via REST API (streaming SSE)
app.post('/run', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  const apiKey = req.headers['x-gemini-api-key'] || '';
  const model = req.headers['x-gemini-model'] || 'gemini-3.1-pro-preview';
  const prompt = req.headers['x-prompt'] || '';
  const imageData = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing x-prompt header' });
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'Missing x-gemini-api-key header' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  try {
    const base64Image = imageData && imageData.length > 0
      ? imageData.toString('base64')
      : null;

    const parts = [];

    if (base64Image) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      });
    }

    parts.push({ text: prompt });

    const requestBody = {
      systemInstruction: {
        parts: [{
          text: 'You are a visual analysis expert. When answering questions about images, charts, or diagrams, give your answer directly and concisely. Do NOT show your reasoning process, do NOT number your steps, do NOT explain how you arrived at the answer. Just state the answer clearly.'
        }]
      },
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192
      }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ type: 'error', error: `Gemini API error ${response.status}: ${errText}` })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
            }
          } catch (e) {
            // Skip malformed events
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }

  req.on('close', () => {
    // Client disconnected
  });
});

// Text-only evaluation via REST API
app.post('/eval', express.json({ limit: '1mb' }), async (req, res) => {
  const { prompt, apiKey, model } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'Missing apiKey' });
  }

  try {
    const modelName = model || 'gemini-3.1-pro-preview';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.json({ error: `Gemini API error ${response.status}: ${errText}` });
    }

    const data = await response.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ result });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Diagram Q&A server running on port ${PORT}`);
});
