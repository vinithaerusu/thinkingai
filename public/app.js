const chat = document.getElementById("chat");
const input = document.getElementById("input");
const send = document.getElementById("send");
const modeSwitch = document.getElementById("mode-switch");
const welcome = document.getElementById("welcome");
const inputArea = document.getElementById("input-area");
const toggleWrap = document.getElementById("toggle-wrap");
const thinkToggle = document.getElementById("think-toggle");
const modeLabel = document.getElementById("mode-label");

const sessionId = crypto.randomUUID();
let messages = [];
let sending = false;
let currentMode = null; // 'understand', 'structured', 'chat'
let thinkingOn = false; // for learn-on-the-go toggle

// Mode selection
document.querySelectorAll(".mode-card").forEach((card) => {
  card.addEventListener("click", () => {
    currentMode = card.dataset.mode;
    startMode();
  });
});

function startMode() {
  welcome.style.display = "none";
  inputArea.style.display = "block";
  messages = [];

  modeSwitch.textContent = "Switch Mode";

  const modeNames = {
    understand: "Understand",
    structured: "Structured Learning",
    chat: "Learn on-the-go",
  };
  modeLabel.textContent = modeNames[currentMode];
  modeLabel.style.display = "block";

  if (currentMode === "understand") {
    input.placeholder = "What do you want to figure out?";
    toggleWrap.style.display = "none";
  } else if (currentMode === "structured") {
    input.placeholder = "What do you want to learn?";
    toggleWrap.style.display = "none";
  } else if (currentMode === "chat") {
    input.placeholder = "Ask anything...";
    toggleWrap.style.display = "flex";
    thinkingOn = false;
    thinkToggle.className = "toggle-off";
    thinkToggle.title = "Thinking mode off";
  }

  input.focus();

  // Trigger first message from the model (only for understand and structured)
  if (currentMode === "understand" || currentMode === "structured") {
    fetchGreeting();
  }
}

async function fetchGreeting() {
  showTyping();
  sending = true;
  send.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        sessionId,
        mode: getEffectiveMode(),
      }),
    });

    hideTyping();

    if (!res.ok) throw new Error("Request failed");

    const data = await res.json();
    // Only keep the model's greeting in history, not the hidden "hi"
    messages.push({ role: "assistant", content: data.reply });
    addMsg("ai", data.reply);
  } catch (err) {
    hideTyping();
    addMsg("ai", "Something went wrong. Please try again in a moment.");
  }

  sending = false;
  send.disabled = false;
  input.focus();
}

// Toggle thinking mode in chat — resets conversation to avoid prompt/history mismatch
thinkToggle.addEventListener("click", () => {
  thinkingOn = !thinkingOn;
  thinkToggle.className = thinkingOn ? "toggle-on" : "toggle-off";
  thinkToggle.title = thinkingOn ? "Thinking mode on" : "Thinking mode off";
  input.placeholder = thinkingOn
    ? "What do you want to figure out?"
    : "Ask anything...";

  // Clear chat and reset messages when toggling
  chat.innerHTML = "";
  messages = [];

  if (thinkingOn) {
    addMsg("ai", "Thinking mode on. What do you want to figure out?");
  } else {
    addMsg("ai", "Back to regular chat. Ask me anything.");
  }
});

// Switch mode button — reset to welcome
modeSwitch.addEventListener("click", () => {
  if (!currentMode) return;
  // Clear chat
  chat.innerHTML = "";
  chat.appendChild(welcome);
  welcome.style.display = "";
  inputArea.style.display = "none";
  currentMode = null;
  messages = [];
  modeLabel.style.display = "none";
});

function getEffectiveMode() {
  if (currentMode === "chat") {
    return thinkingOn ? "understand" : "chat";
  }
  return currentMode;
}

function addMsg(role, text) {
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
      body: JSON.stringify({
        messages,
        sessionId,
        mode: getEffectiveMode(),
      }),
    });

    hideTyping();

    if (res.status === 429) {
      addMsg(
        "ai",
        "I'm being rate limited. Wait about 30 seconds and try sending your message again."
      );
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
