# agBookmarkManager ✨

> [!WARNING]
> **Disclaimer:** This project was built via "vibe coding" using the AntiGravity AI agent. The code is provided as-is, and users should audit and use this extension entirely at their own discretion.

> [!IMPORTANT]
> **AI Mode is enabled by default.** Upon installation, the extension will automatically begin indexing your bookmarks locally to enable Semantic Search.

A premium, high-performance Chrome Extension that transforms your cluttered bookmarks into an intelligent, searchable knowledge base. Built for speed, privacy, and power users.

---

## 🚀 Key Features

### 🔍 Semantic Search (Natural Language)
Stop struggling to remember the exact title of a page. Search by *intent* or *concept*.
- **Example:** Searching for "modern css layouts" will find bookmarks about Flexbox, Grid, and Container Queries, even if those words aren't in the title.
- **Powered by:** Vector embeddings stored in your local IndexedDB.

### 🧠 AI-Powered Insights (Local LLM Mode)
When connected to a local LLM (like Ollama), the manager transcends simple storage:
- **Auto-Summarization:** Get a 1-2 sentence summary of any bookmarked page.
- **Smart Tagging:** AI suggests relevant tags based on the actual content of the page.
- **Intent Detection:** Automatically categorizes bookmarks into "Read Later", "Reference", or "Archive".

### 🛡️ Privacy First
- **Zero-Cloud:** In Browser Mode, your data never leaves your machine. Processing happens in a secure Offscreen Document.
- **Incremental Indexing:** Only new or changed bookmarks are processed, saving CPU and battery.

---

## 🧠 AI Intelligence Modes

Choose the mode that best fits your needs:

| Feature | **Browser Mode** (Default) | **Local LLM Mode** (Power) |
| :--- | :--- | :--- |
| **Setup** | Zero-Configuration | Requires Ollama/OpenAI |
| **Privacy** | 100% Local (WASM) | 100% Local (via Ollama) |
| **Semantic Search** | ✅ Yes (Title/URL) | ✅ Yes (Full Page Content) |
| **Summarization** | ❌ No | ✅ Yes |
| **Smart Tagging** | ❌ No | ✅ Yes |
| **Model** | `all-MiniLM-L6-v2` | `nomic-embed-text` / `llama3` |

---

## 🤖 Deep Dive: AI Models

agBookmarkManager uses a "Dual-Model" approach to provide both speed and intelligence.

### 1. The Embedding Model (The "Search Brain")
*   **Role**: Converts text content into high-dimensional mathematical vectors (embeddings).
*   **Usage**: Powering **Semantic Search**. It allows you to search by meaning rather than keywords.
*   **Default (Browser)**: `all-MiniLM-L6-v2` — Small, fast, and runs 100% locally in your browser.
*   **Advanced (Ollama)**: `nomic-embed-text` — High-performance model that indexes the *full body text* of your bookmarks.

### 2. The Chat Model (The "Summarizer Brain")
*   **Role**: Reads and understands the actual language of the page.
*   **Usage**: Powering **Summaries**, **Smart Tags**, and **Intent Detection**.
*   **Default (Browser)**: Basic extraction (uses meta-descriptions and top sentences).
*   **Advanced (Ollama)**: `llama3`, `mistral`, or `phi3`. These models "read" the page and write concise summaries for you.
*   **Note**: This requires a Local LLM setup (like Ollama) for the best results.

---

## 🛠️ Setup Guide

### 1. Installation
1. Download/Clone this repository.
2. Go to `chrome://extensions/`.
3. Enable **Developer Mode**.
4. Click **Load Unpacked** and select this folder.

### 2. (Optional) Local LLM Setup (Ollama)
To unlock full-page indexing, summaries, and smart tags, connect to [Ollama](https://ollama.com/):

#### Bridge the Connection (CORS)
By default, browsers block extensions from talking to local servers. You must set `OLLAMA_ORIGINS`.

**macOS:**
```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
# Restart Ollama after running this
```

**Windows:**
1. Search for "Environment Variables" in Start.
2. Add `OLLAMA_ORIGINS` = `chrome-extension://*`.
3. Restart Ollama.

#### Configure Extension
1. Open the Bookmark Manager.
2. Click the **AI Settings** (gear icon).
3. Change Provider to **Local**.
4. Enter your endpoint (default: `http://localhost:11434/v1/embeddings`).
5. Click **Save & Re-index**.

---

## 🔧 Troubleshooting

- **"Connection Refused"**: Ensure Ollama is running and `OLLAMA_ORIGINS` is set correctly.
- **Slow Indexing**: Initial indexing can take time depending on the number of bookmarks. Check the progress bar in the sidebar.
- **Browser Mode Errors**: Ensure you are on a modern version of Chrome (116+) as this extension uses modern Offscreen APIs.

---

## 📜 License
MIT License. Built with ❤️ and AI.
