# Privacy Policy - agBookmarkManager

**Last Updated: April 2026**

Your privacy is our priority. agBookmarkManager is designed to be as private as possible by processing your data locally whenever possible.

## 1. Data Collection
- **Bookmarks**: We access your Chrome bookmarks to provide the management and indexing features.
- **Page Content**: We temporarily extract text from your bookmarked pages to generate AI embeddings and summaries.

## 2. Data Storage
- **Local Storage**: All embeddings (AI vectors), extracted text, and indexing metadata are stored locally on your machine using Chrome's `IndexedDB` and `chrome.storage.local`.
- **No Cloud Storage**: We do not host or store your bookmarks or data on our servers.

## 3. AI Processing
- **Browser Mode (Default)**: AI embeddings are generated entirely within your browser using `Transformers.js`. No data is sent to external servers.
- **Local LLM Mode (Ollama)**: If configured, data is sent to your local Ollama instance (typically `localhost:11434`). This data stays on your machine.
- **Cloud LLM Mode (Optional)**: If you explicitly configure an external provider (like OpenAI), your bookmark content will be sent to that provider for processing according to their respective privacy policies.

## 4. Permissions
- **`<all_urls>`**: Required to fetch and index the content of your bookmarks.
- **`bookmarks`**: Required to read and organize your bookmarks.
- **`storage`**: Required to save your settings and local index.
- **`offscreen`**: Required to run AI models in a background tab.

## 5. Third-Party Services
We do not sell, trade, or otherwise transfer your information to outside parties.

## 6. Contact
If you have any questions about this Privacy Policy, please contact the developer via the GitHub repository.
