# Bookmark Manager — Requirements

> **Project:** agBookmarkManager
> **Last Updated:** 2026-03-30
> **Status:** 🟡 In Progress

---

## Overview

A Chrome Extension that serves as a full-featured bookmark manager. Users can view, add, and delete their Chrome bookmarks directly from the extension — available via a quick-access popup and a full-featured options page.

---

## Phases

| Phase | Title | Status |
|-------|-------|--------|
| Phase 1 | Chrome Extension — Core Bookmark Manager | ✅ Completed |
| Phase 2 | Tags, Intent Tags, and Collections | ✅ Completed |
| Phase 3 | AI-Powered Search and Intelligence | ✅ Completed |
| Phase 4 | Deep Content Intelligence | ✅ Completed |
| Phase 5 | Knowledge Synthesis & Visualization | 🟡 In Progress |

## Phase 5 — Knowledge Synthesis & Visualization

### Goal
Shift from individual bookmark management to holistic organization through automated clustering, enabling users to visualize their interests and quickly restructure their bookmark hierarchy.

### Features
1. **Topic Clustering**: Automatically group bookmarks into "Knowledge Maps" or clusters based on semantic similarity (using embeddings from Phase 4), helping users identify thematic overlap across their library.
2. **Bulk Grouping to Folders**: Provide a one-click option to move all bookmarks within a detected cluster into a new or existing Chrome Bookmark Folder, streamlining reorganization.
3. **Cluster Visualization**: A dedicated "Map View" (e.g., force-directed graph or bubble chart) that shows how bookmarks relate to each other, with the ability to click any cluster to see the included links.
4. **Side Panel Interface**: Port the management UI to the Chrome Side Panel API to allow persistent access to clustering and organizational tools while browsing.
5. **Maintenance & Health**: Automated background verification for broken links (404s) and semantic deduplication of redundant saves.

### Technical Considerations
- **Clustering Algorithms**: Implementation of client-side clustering (e.g., K-Means or DBSCAN) on vector embeddings.
- **Chrome Bookmarks API**: Use `chrome.bookmarks.move` and `chrome.bookmarks.create` for the bulk grouping feature.
- **Visualization**: Use a lightweight charting library (e.g., D3.js or simple Canvas) to render the Knowledge Map without performance lag.
- **Batch Processing**: Ensure bulk moving of hundreds of bookmarks is handled gracefully to avoid browser UI freezes.

---

## Phase 4 — Deep Content Intelligence

### Goal
Enhance semantic search by indexing the full-page text of bookmarked URLs, enabling discovery beyond just Title and URL matching.

### Features
1. **Full-Page Text Extraction**: Implement background fetching and DOM parsing (via Offscreen document) to extract primary article text (cleaning out nav, scripts, and footers).
2. **Content-Based Semantic Search**: Generate embeddings based on the combination of Title, Meta Description, and extracted page content (truncated to fit model token limits, e.g., ~2000 chars).
3. **Local/Remote LLM Hybrid**: Support using Local Ollama or OpenAI APIs for generating embeddings and intelligence from larger text blocks while keeping all resulting data in the browser's IndexedDB.
4. **Auto-Summarization**: Generate a brief AI summary of the bookmarked page content to be displayed in the UI (e.g. on hover or in a detail view).
5. **AI Tag Suggestions**: Analyze extracted page content to automatically suggest relevant tags for the bookmark, streamlining user organization.
6. **Secure API Authentication**: Provision for API keys (e.g. OpenAI) in settings, used securely for generation requests without leaking to external storage.
7. **Model Migration & Data Integrity**: Detection of LLM provider or endpoint changes with a user-facing warning and automated "Rebuild Index" process to prevent vector dimension mismatch.
8. **Auth & Paywall Handling**: Implement a Content Script strategy to prioritize "Clean Text" extraction from active user sessions, bypassing background fetch limitations for authenticated or paywalled pages.
9. **User Consent & Transparency**: Provide a clear notification (Toast/Banner) when active extraction occurs. Allow users to grant one-time consent or permanent opt-in for background indexing of active tabs.
10. **Content Cache**: Store the extracted text locally to support these intelligence features without re-fetching.

### Technical Considerations
- **Permissions**: Requires `<all_urls>` host permission for background fetching and active content script extraction.
- **Transparency**: Content scripts must provide an in-page UI (Toast/Notification) to inform the user when their active context is being indexed, ensuring privacy awareness.
- **Consent**: Implement a "Permission Priming" workflow where the user can opt-in to automatic background indexing.
- **Auth**: Implement an "API Key" field in settings to support authenticated requests to OpenAI or custom LLM endpoints.
- **Data Integrity**: Implement logic to detect when the underlying embedding model has changed and prompt the user to purge/re-index to ensure search accuracy.
- **Token Management**: Standard models like `all-MiniLM-L6-v2` have a 512-token limit; intelligent truncation will be needed to capture the most relevant parts of the page.

---

## Phase 3 — AI-Powered Search and Intelligence

### Goal
Implement natural language search capabilities allowing users to find relevant bookmarks using descriptive queries (e.g., "a blog which talks about jquery") powered by an LLM.

### Features
1. **Natural Language Search**: Rank bookmark relevance based on user intent and natural language queries, moving beyond basic title/URL keyword matching.
2. **Flexible LLM Execution**: Provide two options for running the LLM to accommodate browser limitations. The interface must be flexible to support both:
   - **In-Browser Model**: Utilize a small, efficient model (e.g., via `transformers.js` or `web-llm`) running directly in the browser.
   - **Local Machine API**: Support connecting to a robust LLM running on the user's local machine (API to be developed later).
3. **Background Intelligence Processing**: An extension background process that iterates through current bookmarks one by one, generates intelligence (e.g., embeddings or semantic metadata), and stores it.
4. **Queue System**: The background processing must be queued and strictly managed to ensure it does not hog CPU and memory resources.

### Technical Considerations
- Integration with in-browser machine learning libraries like `transformers.js` or `web-llm`.
- Managing a background task queue to process the bookmarks asynchronously without causing performance regressions.
- Designing a flexible settings interface that can seamlessly toggle between the in-browser model and the future local connection.
- Persistent local storage solution for caching bookmark 'intelligence' to prevent re-processing.

---

## Phase 2 — Tags, Intent Tags, and Collections

### Goal
Introduce advanced organizational capabilities beyond standard Chrome folders by implementing Tags, Intent Tags, Collections, and dynamic Intent Views.

### Features
1. **Tag**: A user-defined label attached to a Bookmark for manual categorization.
2. **Collection**: A named group of Bookmarks created by the user for organizational purposes.
3. **Intent Tag**: A special user-defined Tag that carries a specific action or status meaning (e.g., "read later", "watch later", "reference", "archive"). These are visually and logically distinct from ordinary Tags.
4. **Intent View**: A dedicated, automatically maintained view in the UI that displays all Bookmarks carrying a specific Intent Tag. These views update in real time as Bookmarks are tagged or untagged.

### Technical Considerations
- Since Chrome Bookmarks API does natively support folders (which can act as Collections) but does *not* natively support tags or arbitrary metadata, a separate metadata storage solution (e.g., `chrome.storage.local` or `chrome.storage.sync`) will be required to maintain the mapping of Bookmark IDs to their Tags and Intent Tags.

---

## Phase 1 — Chrome Extension: Core Bookmark Manager

### Goal
Build a Chrome Extension that gives users a clean UI to manage their Chrome bookmarks without leaving the browser.

---

### Extension Pages

#### 1. Popup (`popup.html`)
- Opens when the user clicks the extension icon in the toolbar
- Shows a **compact, scrollable list** of all bookmarks
- Each bookmark displays: **favicon**, **title**, and **URL**
- Actions available per bookmark:
  - 🗑️ **Delete** — removes the bookmark from Chrome
- **Add Bookmark** button/form — lets the user add a new bookmark (title + URL)
- Organized by **bookmark folders** (tree structure collapsed/expanded)

#### 2. Options Page (`options.html`)
- Full-page, spacious view of all bookmarks
- Displays the complete **bookmark tree** (folders + nested structure)
- Actions per bookmark:
  - 🗑️ **Delete** — removes the bookmark
  - ➕ **Add** — add a new bookmark inside any folder
- Search/filter bar to quickly find bookmarks by title or URL
- Folder management: view bookmarks grouped by folder

---

### Core Features

| # | Feature | Popup | Options Page |
|---|---------|-------|--------------|
| 1 | Pull & display all Chrome bookmarks | ✅ | ✅ |
| 2 | Add a new bookmark (title + URL) | ✅ | ✅ |
| 3 | Delete a bookmark | ✅ | ✅ |
| 4 | Folder/tree structure view | ✅ (collapsed) | ✅ (full tree) |
| 5 | Search / filter bookmarks | ❌ | ✅ |
| 6 | Open bookmark in new tab | ✅ | ✅ |

---

### Chrome APIs Used

- `chrome.bookmarks.getTree()` — fetch the full bookmark tree
- `chrome.bookmarks.create()` — add a new bookmark
- `chrome.bookmarks.remove()` — delete a bookmark
- `chrome.bookmarks.search()` — search bookmarks (options page)

---

### Permissions Required (`manifest.json`)

```json
"permissions": ["bookmarks"]
```

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Extension Type | Chrome Extension (Manifest V3) |
| UI | HTML + Vanilla CSS + Vanilla JS |
| Chrome APIs | `chrome.bookmarks` |
| Styling | Custom CSS (dark mode, modern design) |

---

## Notes

- Feature development is iterative, one phase at a time.
- This document will be updated as each phase is defined and implemented.
