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
| Phase 2 | Tags, Intent Tags, and Collections | 🟡 In Progress |
| Phase 3 | AI-Powered Search and Intelligence | ⏳ Planned |
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
