# agBookmarkManager ✨

> [!WARNING]
> **Disclaimer:** This project was built via "vibe coding" using the AntiGravity AI agent. The code is provided as-is, and users should audit and use this extension entirely at their own discretion.

A modern, fast, and uncluttered Chrome Extension for bookmark management, supercharged with AI-powered Semantic Search natively within the browser.

## Features

- **Blazing Fast Native UI**: Replaces the clunky default Chrome bookmark manager with a refined, customizable dashboard.
- **Intent Tags & Collections**: Categorize bookmarks with visual badges (e.g. `Read Later`, `Reference`, `Archive`).
- **In-Browser Semantic Intelligence**: Built-in AI runs `@xenova/transformers` natively using WebAssembly with the **`Xenova/all-MiniLM-L6-v2`** model. It generates embeddings locally using the bookmark's **Title and URL** to find similarity, allowing natural language search queries (e.g., "javascript graphing libraries") without relying on exact keyword matches.
- **Privacy First Offline Processing**: All embedding modeling runs entirely locally on your device within an Offscreen Document and stores data incrementally in IndexedDB. Your browsing data never leaves your browser!
- **Local API Support** (To Be Done): Easily toggle processing loads over to Ollama or standard OpenAI compatible `/v1/embeddings` models (e.g., using **`nomic-embed-text`**) if you'd prefer to integrate a localized or self-hosted backend. In this mode, the extension is designed to support full-page text extraction for even more accurate semantic matching.

## Installation

1. Clone or download this repository.
2. Navigate to `chrome://extensions/` in your Chrome or Chromium browser.
3. Toggle on **Developer mode** in the top right.
4. Click **Load unpacked** and select the directory that contains this extension's `manifest.json`.
5. Enjoy managing your bookmarks!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
