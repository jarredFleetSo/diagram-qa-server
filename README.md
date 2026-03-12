# Diagram Q&A - Getting Started

This tool lets you take screenshots of anything on your screen, ask questions about what you see, and check if an AI can answer correctly.

---

## What You Need

- **Google Chrome** browser
- **A Gemini API key** (free) — you'll get this in Step 1

---

## Step 1: Get Your Free API Key

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. Click **"Create API key"**
4. Copy the key (it looks like `AIzaSy...`) — you'll paste it later

---

## Step 2: Install the Extension

1. Open Chrome
2. Type `chrome://extensions` in the address bar and press Enter
3. Turn on **"Developer mode"** — it's the toggle switch in the top-right corner
4. Click the **"Load unpacked"** button (top-left area)
5. Find and select the **`chrome-extension-diagram-maker`** folder you were given
6. You should see **"Diagram Q&A with Gemini"** appear in the list

---

## Step 3: Set Up

1. Click the **puzzle piece icon** in Chrome's toolbar (top right, next to the address bar)
2. Find **"Diagram Q&A with Gemini"** and click the **pin icon** to keep it visible
3. Click the **extension icon** — a side panel opens on the right
4. The **Welcome screen** appears. Fill in:
   - **Server URL:** `https://diagram-qa-api.onrender.com`
   - **Server Password:** `diagram-qa-2024`
   - **Gemini API Key:** paste the key from Step 1
   - **Model:** leave the default or pick one
5. Click **"Get Started"**

That's it — you're ready to go!

---

## How to Use

### Take a Screenshot

1. Click **"+ Capture"** in the side panel
2. Your cursor turns into a crosshair
3. **Click and drag** to draw a box around what you want to screenshot
4. Let go — the screenshot appears in the panel
5. You can take multiple screenshots from different pages!

### Ask a Question

1. Click on a screenshot thumbnail to select it (blue border = selected)
2. In the **"Question / Prompt"** box, type what you want to ask about the image
   - Example: *"What does this diagram show?"*
3. In the **"Expected Answer"** box, type what you think the correct answer should be
   - Example: *"A login flow with three steps: enter email, verify password, redirect to dashboard"*
4. Click **Run**

### Read the Results

A card appears showing:
- **Running** — the AI is thinking (you can watch it type)
- **Evaluating** — comparing the AI's answer to yours
- **Done** — finished! You'll see a score (green = good match, yellow = partial, red = poor match)

Click the card to expand/collapse it and see full details.

### Edit and Try Again

Open any completed card to:
- **Edit** the question or expected answer
- Click **Rerun** to try again with changes
- Click **Delete** to remove it

### Save Your Work

- Click **Export** on any card to download that question as a zip file
- Click **Export All Runs** to download everything at once

Each export contains:
- `prompt.txt` — your question
- `answer.txt` — your expected answer
- `artifacts/image.jpg` — the screenshot
- `gemini_response.txt` — the AI's response
- `evaluation.json` — the scores

---

## Common Issues

**"I don't see the side panel when I click the icon"**
> Try right-clicking the extension icon and choosing "Open side panel". If that doesn't work, go to `chrome://extensions`, find the extension, and click the reload button.

**"No server URL configured"**
> Click the gear icon (top right of the panel) and make sure the Server URL is filled in: `https://diagram-qa-api.onrender.com`

**"Server error 401 / 403"**
> Check that the Server Password is correct in settings.

**"The AI gives an error about the API key"**
> Click the gear icon and make sure your Gemini API key is pasted correctly. You can get a new key at https://aistudio.google.com/apikey

**"Nothing happens when I click + Capture"**
> Make sure you have a regular webpage open (not chrome:// pages or the new tab page). Try it on any website like google.com.

---

## Need Help?

Contact your project lead with:
1. What you were trying to do
2. The error message (if any)
3. A screenshot of the issue
