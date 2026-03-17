const chat = document.getElementById("chat");
const hero = document.getElementById("hero");
const input = document.getElementById("input");
const send = document.getElementById("send");
const newChatBtn = document.getElementById("new-chat");
const inputHint = document.querySelector(".input-hint");

const sessionId = crypto.randomUUID();
let messages = [];
let sending = false;
let inChat = false;

function enterChatMode() {
  if (inChat) return;
  inChat = true;
  hero.classList.add("hidden");
  chat.classList.remove("hidden");
  newChatBtn.classList.add("visible");
  if (inputHint) inputHint.style.display = "none";
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
  send.disabled = !input.value.trim() || sending;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || sending) return;

  sending = true;
  updateSendButton();
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
      updateSendButton();
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
  updateSendButton();
  input.focus();
}

function resetChat() {
  messages = [];
  inChat = false;
  chat.innerHTML = "";
  chat.classList.add("hidden");
  hero.classList.remove("hidden");
  newChatBtn.classList.remove("visible");
  if (inputHint) inputHint.style.display = "";
  input.value = "";
  input.style.height = "auto";
  updateSendButton();
  input.focus();
}

send.addEventListener("click", sendMessage);
newChatBtn.addEventListener("click", resetChat);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
  updateSendButton();
});
