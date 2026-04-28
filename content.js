chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "extractText") return;

  const text = extractText();
  sendResponse({ text });
  return true;
});

function extractText() {
  // 1. Selected text
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 50) return selection;

  // 2. Mozilla Readability (bundled in lib/)
  if (typeof Readability !== "undefined") {
    try {
      const clone = document.cloneNode(true);
      const article = new Readability(clone).parse();
      if (article?.textContent?.trim().length > 100) {
        return article.textContent.trim();
      }
    } catch (_) {}
  }

  // 3. Semantic fallback
  const candidates = ["article", "main", '[role="main"]', ".post-content", ".article-body", ".content"];
  for (const selector of candidates) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.innerText.trim();
      if (text.length > 100) return text;
    }
  }

  // 4. Full body text
  return document.body.innerText.trim();
}
