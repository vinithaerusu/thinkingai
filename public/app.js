const chat = document.getElementById("chat");
const hero = document.getElementById("hero");
const chatInputArea = document.getElementById("chat-input");
const newChatBtn = document.getElementById("new-chat");

// Hero input elements
const heroInput = document.getElementById("input");
const heroSend = document.getElementById("send");

// Chat input elements
const chatInput = document.getElementById("input-chat");
const chatSend = document.getElementById("send-chat");

const footer = document.getElementById("footer");
const chatFooterNote = document.getElementById("chat-footer-note");

const sessionId = crypto.randomUUID();
let messages = [];
let sending = false;
let inChat = false;

function getInput() { return inChat ? chatInput : heroInput; }
function getSend() { return inChat ? chatSend : heroSend; }

function enterChatMode() {
  if (inChat) return;
  inChat = true;
  hero.classList.add("hidden");
  chat.classList.remove("hidden");
  chatInputArea.classList.remove("hidden");
  newChatBtn.classList.add("visible");
  footer.classList.add("hidden");
  chatInput.focus();
}

function addMsg(role, text) {
  enterChatMode();

  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "ai"}`;

  if (role === "user") {
    div.textContent = text;
  } else {
    div.innerHTML = renderMarkdown(text);
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function renderMarkdown(text) {
  return text
    .replace(/^---$/gm, "<hr>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "typing";
  div.id = "typing";
  div.innerHTML = "<span>Thinking...</span>";
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

function updateSendButton() {
  const input = getInput();
  const send = getSend();
  send.disabled = !input.value.trim() || sending;
}

function updateAllSendButtons() {
  heroSend.disabled = !heroInput.value.trim() || sending;
  chatSend.disabled = !chatInput.value.trim() || sending;
}

async function sendMessage() {
  const input = getInput();
  const text = input.value.trim();
  if (!text || sending) return;

  sending = true;
  updateAllSendButtons();
  input.value = "";
  input.style.height = "auto";

  addMsg("user", text);
  messages.push({ role: "user", content: text });

  showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, sessionId }),
    });

    hideTyping();

    if (res.status === 429) {
      addMsg("ai", "I'm being rate limited. Wait about 30 seconds and try sending your message again.");
      messages.pop();
      sending = false;
      updateAllSendButtons();
      return;
    }

    if (!res.ok) throw new Error("Request failed");

    const data = await res.json();
    messages.push({ role: "assistant", content: data.reply });
    addMsg("ai", data.reply);
  } catch (err) {
    hideTyping();
    addMsg("ai", "Something went wrong. Please try again in a moment.");
    messages.pop();
  }

  sending = false;
  updateAllSendButtons();
  chatInput.focus();
}

function resetChat() {
  messages = [];
  inChat = false;
  chat.innerHTML = "";
  chat.classList.add("hidden");
  chatInputArea.classList.add("hidden");
  hero.classList.remove("hidden");
  newChatBtn.classList.remove("visible");
  footer.classList.remove("hidden");
  chatFooterNote.classList.add("hidden");
  heroInput.value = "";
  chatInput.value = "";
  heroInput.style.height = "auto";
  chatInput.style.height = "auto";
  updateAllSendButtons();
  heroInput.focus();
}

// Hero input events
heroSend.addEventListener("click", sendMessage);
heroInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
heroInput.addEventListener("input", () => {
  heroInput.style.height = "auto";
  heroInput.style.height = Math.min(heroInput.scrollHeight, 160) + "px";
  updateAllSendButtons();
});

// Chat input events
chatSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
  updateAllSendButtons();
  if (chatInput.value.trim()) {
    chatFooterNote.classList.remove("hidden");
  } else {
    chatFooterNote.classList.add("hidden");
  }
});

newChatBtn.addEventListener("click", resetChat);
