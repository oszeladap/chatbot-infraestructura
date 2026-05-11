import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey:            "AIzaSyCteU0NzqHKfJI8a4IZL_OC9YV_Paw7Pvs",
  authDomain:        "chatboot-infraestructura.firebaseapp.com",
  projectId:         "chatboot-infraestructura",
  storageBucket:     "chatboot-infraestructura.firebasestorage.app",
  messagingSenderId: "9738095222",
  appId:             "1:9738095222:web:a5ac492abbb4165321ed57",
};

// Use explicit IPv4 — on Windows 11, "localhost" resolves to ::1 (IPv6)
// but uvicorn listens on 127.0.0.1 (IPv4).
// Empty string = same origin. Frontend is served by FastAPI on port 8000.
// Avoids all CORS and IPv4/IPv6 issues.
const API_URL = "";

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const messagesEl     = document.getElementById("messages");
const emptyState     = document.getElementById("empty-state");
const typingEl       = document.getElementById("typing-indicator");
const chatForm       = document.getElementById("chat-form");
const chatInput      = document.getElementById("chat-input");
const btnSend        = document.getElementById("btn-send");
const btnClear       = document.getElementById("btn-clear");
const btnLogout      = document.getElementById("btn-logout");
const btnToggle      = document.getElementById("btn-toggle-sidebar");
const sidebar        = document.getElementById("sidebar");
const sidebarHistory = document.getElementById("sidebar-history");
const userNameEl     = document.getElementById("user-name");
const roleBadgeEl    = document.getElementById("role-badge");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentFirebaseUser = null;
let appReady = false;   // true once onAuthStateChanged resolves

// Disable input until auth state confirmed
chatInput.disabled = true;
btnSend.disabled   = true;

// ---------------------------------------------------------------------------
// Fast redirect (avoids UI flash before Firebase auth resolves)
// ---------------------------------------------------------------------------
if (!sessionStorage.getItem("firebase_token")) {
  window.location.href = "index.html";
}

// ---------------------------------------------------------------------------
// JWT decode — extracts custom claims from the token payload
// ---------------------------------------------------------------------------
function decodeJwt(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    sessionStorage.removeItem("firebase_token");
    window.location.href = "index.html";
    return;
  }

  currentFirebaseUser = user;

  const token  = await user.getIdToken(true);   // force-refresh on load
  const claims = decodeJwt(token);
  const role   = claims.role ?? null;
  const email  = user.email ?? user.displayName ?? "Usuario";

  sessionStorage.setItem("firebase_token", token);

  userNameEl.textContent  = email;
  roleBadgeEl.textContent = role ?? "sin rol";

  if (role === "assistant_user") btnClear.classList.add("visible");

  // Enable UI now that we have a confirmed user
  chatInput.disabled = false;
  btnSend.disabled   = false;
  appReady           = true;

  await loadHistory(user.uid, role);
});

// ---------------------------------------------------------------------------
// Token helper — always gets a fresh token from Firebase
// ---------------------------------------------------------------------------
async function getFreshToken() {
  if (!currentFirebaseUser) {
    throw new Error("AUTH_NULL: Firebase user no disponible aún. Recarga la página.");
  }
  try {
    return await currentFirebaseUser.getIdToken(false);
  } catch (e) {
    throw new Error(`AUTH_TOKEN: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// API fetch wrapper
// ---------------------------------------------------------------------------
async function apiFetch(path, options = {}) {
  const token = await getFreshToken();

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });
  } catch (networkErr) {
    // fetch() itself threw — server unreachable or CORS hard-blocked
    throw new Error(`NETWORK: No se pudo contactar ${API_URL}${path} — ${networkErr.message}`);
  }

  if (res.status === 401) {
    sessionStorage.removeItem("firebase_token");
    window.location.href = "index.html";
    throw new Error("AUTH_401: Token rechazado por el servidor.");
  }

  return res;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function removeEmptyState() { emptyState?.remove(); }

function timestamp() {
  return new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function appendBubble(role, text, { usedSearch = false, isError = false } = {}) {
  removeEmptyState();

  const row    = document.createElement("div");
  row.className = `bubble-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble" + (isError ? " bubble-error" : "");
  bubble.textContent = text;

  const meta = document.createElement("div");
  meta.className = "bubble-meta";
  meta.textContent = timestamp();

  if (usedSearch) {
    const badge = document.createElement("span");
    badge.className = "badge-search";
    badge.textContent = "🔍 Búsqueda web usada";
    meta.appendChild(badge);
  }

  row.appendChild(bubble);
  row.appendChild(meta);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function setTyping(on) {
  typingEl.classList.toggle("visible", on);
  btnSend.disabled   = on;
  chatInput.disabled = on;
  if (on) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function renderSidebar(messages) {
  sidebarHistory.innerHTML = "";

  if (!messages.length) {
    const el = document.createElement("div");
    el.className   = "sidebar-item";
    el.textContent = "Sin mensajes aún";
    sidebarHistory.appendChild(el);
    return;
  }

  messages.forEach((msg) => {
    const item = document.createElement("div");
    item.className   = "sidebar-item";
    item.textContent = (msg.content ?? "").slice(0, 60) +
                       ((msg.content ?? "").length > 60 ? "…" : "");

    const tag = document.createElement("span");
    tag.className   = "si-role";
    tag.textContent = msg.role === "user" ? "Tú" : "Asistente";
    item.appendChild(tag);

    sidebarHistory.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// Load history on init
// ---------------------------------------------------------------------------
async function loadHistory(uid, role) {
  try {
    const query = role === "viewer" ? `?uid=${uid}` : "";
    const res   = await apiFetch(`/history${query}`);
    if (!res.ok) return;

    const data     = await res.json();
    const messages = data.messages ?? [];

    renderSidebar(messages);
    messages.forEach((msg) =>
      appendBubble(msg.role === "user" ? "user" : "assistant", msg.content ?? "")
    );
  } catch (err) {
    console.warn("loadHistory falló:", err.message);
  }
}

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------
async function sendMessage(text) {
  appendBubble("user", text);
  chatInput.value = "";
  chatInput.style.height = "42px";
  setTyping(true);

  try {
    const res = await apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify({ message: text, session_id: null }),
    });

    setTyping(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = body.detail ?? `HTTP ${res.status} ${res.statusText}`;
      appendBubble("assistant", `Error del servidor: ${detail}`, { isError: true });
      return;
    }

    const data = await res.json();
    appendBubble("assistant", data.reply, { usedSearch: data.used_search });

    // Refresh sidebar
    try {
      const hr = await apiFetch("/history");
      if (hr.ok) renderSidebar((await hr.json()).messages ?? []);
    } catch { /* sidebar refresh is non-critical */ }

  } catch (err) {
    setTyping(false);
    // Show the REAL error so the user can report it
    appendBubble("assistant", `Error: ${err.message}`, { isError: true });
    console.error("[sendMessage]", err);
  }
}

// ---------------------------------------------------------------------------
// clearHistory
// ---------------------------------------------------------------------------
async function clearHistory() {
  if (!confirm("¿Borrar todo el historial de esta sesión?")) return;
  try {
    const res = await apiFetch("/history", { method: "DELETE" });
    if (res.ok) {
      messagesEl.innerHTML = "";
      renderSidebar([]);
    }
  } catch (err) {
    alert(`No se pudo borrar el historial: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
async function logout() {
  await signOut(auth);
  sessionStorage.removeItem("firebase_token");
  window.location.href = "index.html";
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !appReady) return;
  sendMessage(text);
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "42px";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event("submit"));
  }
});

btnClear.addEventListener("click",  clearHistory);
btnLogout.addEventListener("click", logout);
btnToggle.addEventListener("click", () => sidebar.classList.toggle("collapsed"));
