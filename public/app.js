const chat = document.getElementById("chat");
const input = document.getElementById("input");
const send = document.getElementById("send");

const sessionId = crypto.randomUUID();
let messages = [];
let sending = false;

function addMsg(role, text) {
  const welcome = chat.querySelector(".welcome");
  if (welcome) welcome.remove();

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

async function sendMessage() {
  const text = input.value.trim();
  if (!text || sending) return;

  sending = true;
  send.disabled = true;
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
      send.disabled = false;
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
  send.disabled = false;
  input.focus();
}

send.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});
