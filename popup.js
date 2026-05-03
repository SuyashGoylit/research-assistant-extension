const { api_base_local, api_base_prod } = await fetch(chrome.runtime.getURL("config.json")).then(r => r.json());
const API_BASE = await fetch(`${api_base_local}/health/`, { signal: AbortSignal.timeout(1000) })
  .then(r => r.ok ? api_base_local : api_base_prod)
  .catch(() => api_base_prod);

// ── DOM refs ──────────────────────────────────────────────────────────────────

const loginScreen   = document.getElementById("login-screen");
const mainUI        = document.getElementById("main-ui");
const inputUsername = document.getElementById("input-username");
const inputPassword = document.getElementById("input-password");
const btnLogin      = document.getElementById("btn-login");
const loginError    = document.getElementById("login-error");

const btnSummarize = document.getElementById("btn-summarize");
const btnNotes     = document.getElementById("btn-notes");
const statusEl     = document.getElementById("status");
const errorEl      = document.getElementById("error");

const summaryBlock = document.getElementById("summary-block");
const summaryText  = document.getElementById("summary-text");
const copySummary  = document.getElementById("copy-summary");

const notesBlock   = document.getElementById("notes-block");
const notesList    = document.getElementById("notes-list");
const copyNotes    = document.getElementById("copy-notes");

// ── Auth helpers ──────────────────────────────────────────────────────────────

function showLoginScreen(msg = "") {
  loginScreen.style.display = "flex";
  mainUI.style.display      = "none";
  loginError.textContent    = msg;
}

function showMainUI() {
  loginScreen.style.display = "none";
  mainUI.style.display      = "flex";
}

// On load: check for stored token
chrome.storage.local.get("authToken", ({ authToken }) => {
  if (authToken) showMainUI();
  else showLoginScreen();
});

// Login button
btnLogin.addEventListener("click", async () => {
  const username = inputUsername.value.trim();
  const password = inputPassword.value;
  if (!username || !password) {
    loginError.textContent = "Please enter username and password.";
    return;
  }

  btnLogin.disabled      = true;
  loginError.textContent = "";

  const token = btoa(`${username}:${password}`);
  try {
    const res = await fetch(`${API_BASE}/summary/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${token}` },
      body: JSON.stringify({ text: "test" }),
    });
    if (res.status === 401) {
      loginError.textContent = "Invalid username or password.";
      return;
    }
    chrome.storage.local.set({ authToken: token });
    showMainUI();
  } catch {
    loginError.textContent = "Could not reach server.";
  } finally {
    btnLogin.disabled = false;
  }
});

// Allow Enter key to submit login
inputPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnLogin.click();
});

// ── State helpers ─────────────────────────────────────────────────────────────

function setLoading(msg) {
  statusEl.innerHTML = `<span class="spinner"></span>${msg}`;
  statusEl.classList.add("visible");
  errorEl.classList.remove("visible");
  summaryBlock.classList.remove("visible");
  notesBlock.classList.remove("visible");
  btnSummarize.disabled = true;
  btnNotes.disabled = true;
}

function setError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add("visible");
  statusEl.classList.remove("visible");
  btnSummarize.disabled = false;
  btnNotes.disabled = false;
}

function clearLoading() {
  statusEl.classList.remove("visible");
  btnSummarize.disabled = false;
  btnNotes.disabled = false;
}

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { action: "extractText" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Could not connect to page. Try refreshing."));
        return;
      }
      resolve(response?.text ?? "");
    });
  });
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function callApi(endpoint, text) {
  const { authToken } = await chrome.storage.local.get("authToken");
  const res = await fetch(`${API_BASE}/${endpoint}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${authToken}`,
    },
    body: JSON.stringify({ text }),
  });
  if (res.status === 401) {
    chrome.storage.local.remove("authToken");
    showLoginScreen("Session expired. Please sign in again.");
    throw new Error("Session expired.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  return res.json();
}

// ── Buttons ───────────────────────────────────────────────────────────────────

btnSummarize.addEventListener("click", async () => {
  try {
    setLoading("Extracting page text…");
    const text = await extractText();
    if (!text) { setError("No text found on this page."); return; }


    setLoading("Summarizing…");
    const data = await callApi("summary", text);

    summaryText.textContent = data.summary;
    summaryBlock.classList.add("visible");
    clearLoading();
  } catch (err) {
    if (err.message !== "Session expired.") setError(err.message);
  }
});

btnNotes.addEventListener("click", async () => {
  try {
    setLoading("Extracting page text…");
    const text = await extractText();
    if (!text) { setError("No text found on this page."); return; }


    setLoading("Generating notes…");
    const data = await callApi("notes", text);

    notesList.innerHTML = "";
    (data.notes || []).forEach((note) => {
      const li = document.createElement("li");
      li.textContent = note;
      notesList.appendChild(li);
    });
    notesBlock.classList.add("visible");
    clearLoading();
  } catch (err) {
    if (err.message !== "Session expired.") setError(err.message);
  }
});

// ── Copy buttons ──────────────────────────────────────────────────────────────

copySummary.addEventListener("click", () => {
  navigator.clipboard.writeText(summaryText.textContent).then(() => {
    copySummary.textContent = "Copied!";
    setTimeout(() => (copySummary.textContent = "Copy"), 1500);
  });
});

copyNotes.addEventListener("click", () => {
  const text = [...notesList.querySelectorAll("li")]
    .map((li) => `• ${li.textContent}`)
    .join("\n");
  navigator.clipboard.writeText(text).then(() => {
    copyNotes.textContent = "Copied!";
    setTimeout(() => (copyNotes.textContent = "Copy"), 1500);
  });
});
