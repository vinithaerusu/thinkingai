const chat = document.getElementById("chat");
const input = document.getElementById("input");
const send = document.getElementById("send");
const mapPanel = document.getElementById("map-panel");
const mapToggle = document.getElementById("map-toggle");
const mapClose = document.getElementById("map-close");
const mapSvg = document.getElementById("map-svg");

const sessionId = crypto.randomUUID();
let messages = [];
let sending = false;

// Knowledge map state
let knowledgeMap = null; // { root: string, nodes: [{ type, label }] }
let nodeStates = {}; // { label: 'pending' | 'active' | 'completed' }
let activeNodeIndex = -1;

function addMsg(role, text) {
  const welcome = chat.querySelector(".welcome");
  if (welcome) welcome.remove();

  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "ai"}`;

  if (role === "user") {
    div.textContent = text;
  } else {
    // Parse knowledge map tags before rendering
    const parsed = parseMapTags(text);
    div.innerHTML = renderMarkdown(parsed.cleanText);
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function parseMapTags(text) {
  let cleanText = text;

  // Parse [KNOWLEDGE_MAP]...[/KNOWLEDGE_MAP]
  const mapMatch = text.match(/\[KNOWLEDGE_MAP\]([\s\S]*?)\[\/KNOWLEDGE_MAP\]/);
  if (mapMatch) {
    const mapContent = mapMatch[1].trim();
    parseKnowledgeMap(mapContent);
    cleanText = cleanText.replace(/\[KNOWLEDGE_MAP\][\s\S]*?\[\/KNOWLEDGE_MAP\]/, '').trim();
  }

  // Parse [ACTIVE_NODE]...[/ACTIVE_NODE]
  const activeMatch = text.match(/\[ACTIVE_NODE\](.*?)\[\/ACTIVE_NODE\]/);
  if (activeMatch) {
    const nodeName = activeMatch[1].trim().toLowerCase();
    setActiveNode(nodeName);
    cleanText = cleanText.replace(/\[ACTIVE_NODE\].*?\[\/ACTIVE_NODE\]/, '').trim();
  }

  // Parse [COMPLETED_NODE]...[/COMPLETED_NODE]
  const completedMatch = text.match(/\[COMPLETED_NODE\](.*?)\[\/COMPLETED_NODE\]/);
  if (completedMatch) {
    const nodeName = completedMatch[1].trim().toLowerCase();
    completeNode(nodeName);
    cleanText = cleanText.replace(/\[COMPLETED_NODE\].*?\[\/COMPLETED_NODE\]/, '').trim();
  }

  return { cleanText };
}

function parseKnowledgeMap(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return;

  const root = lines[0].trim();
  const nodes = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/[├└]──\s*(\w+):\s*(.+)/);
    if (match) {
      nodes.push({ type: match[1].trim(), label: match[2].trim() });
    }
  }

  if (nodes.length === 0) return;

  knowledgeMap = { root, nodes };
  nodeStates = {};
  nodes.forEach(n => { nodeStates[n.type] = 'pending'; });
  activeNodeIndex = -1;

  // Show the map panel and toggle
  mapPanel.classList.remove('hidden');
  mapToggle.classList.remove('hidden');
  renderMap();
}

function setActiveNode(name) {
  if (!knowledgeMap) return;
  knowledgeMap.nodes.forEach((n, i) => {
    if (n.type.toLowerCase() === name || n.label.toLowerCase().includes(name)) {
      nodeStates[n.type] = 'active';
      activeNodeIndex = i;
    }
  });
  renderMap();
}

function completeNode(name) {
  if (!knowledgeMap) return;
  knowledgeMap.nodes.forEach(n => {
    if (n.type.toLowerCase() === name || n.label.toLowerCase().includes(name)) {
      nodeStates[n.type] = 'completed';
    }
  });
  renderMap();
}

function renderMap() {
  if (!knowledgeMap) return;

  const nodes = knowledgeMap.nodes;
  const nodeW = 130;
  const nodeH = 44;
  const rootW = 140;
  const rootH = 40;
  const vGap = 60;
  const hGap = 16;

  // Calculate layout
  const cols = Math.min(nodes.length, 2);
  const rows = Math.ceil(nodes.length / cols);
  const totalW = cols * (nodeW + hGap) - hGap + 40;
  const totalH = rootH + vGap + rows * (nodeH + vGap) + 20;
  const centerX = totalW / 2;

  mapSvg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  mapSvg.style.height = totalH + 'px';
  mapSvg.innerHTML = '';

  // Root node
  const rootX = centerX - rootW / 2;
  const rootY = 16;
  const rootCenterY = rootY + rootH / 2;

  const rootGroup = createSvgElement('g', { class: 'map-node root' });
  rootGroup.appendChild(createSvgElement('rect', {
    x: rootX, y: rootY, width: rootW, height: rootH
  }));
  rootGroup.appendChild(createSvgElement('text', {
    x: centerX, y: rootCenterY
  }, knowledgeMap.root));
  mapSvg.appendChild(rootGroup);

  // Child nodes
  const startY = rootY + rootH + vGap;

  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const colWidth = (totalW - 40) / cols;
    const nx = 20 + col * colWidth + (colWidth - nodeW) / 2;
    const ny = startY + row * (nodeH + vGap);
    const ncx = nx + nodeW / 2;
    const ncy = ny + nodeH / 2;

    const state = nodeStates[node.type] || 'pending';

    // Line from root to node
    const lineClass = state === 'completed' ? 'map-line completed' : state === 'active' ? 'map-line active' : 'map-line';
    const line = createSvgElement('path', {
      d: `M ${centerX} ${rootY + rootH} C ${centerX} ${rootY + rootH + vGap / 2}, ${ncx} ${ny - vGap / 2}, ${ncx} ${ny}`,
      class: lineClass
    });
    mapSvg.insertBefore(line, rootGroup);

    // Node group
    const group = createSvgElement('g', { class: `map-node ${state}` });
    group.appendChild(createSvgElement('rect', {
      x: nx, y: ny, width: nodeW, height: nodeH
    }));

    // Type label (small, above)
    group.appendChild(createSvgElement('text', {
      x: ncx, y: ncy - 8, class: 'map-node-type'
    }, node.type));

    // Value label
    const label = node.label.length > 18 ? node.label.slice(0, 16) + '...' : node.label;
    group.appendChild(createSvgElement('text', {
      x: ncx, y: ncy + 8
    }, label));

    mapSvg.appendChild(group);
  });
}

function createSvgElement(tag, attrs, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  const className = attrs.class;
  delete attrs.class;
  if (className) el.setAttribute('class', className);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  if (text) el.textContent = text;
  return el;
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

// Map panel toggle
mapToggle.addEventListener("click", () => {
  mapPanel.classList.toggle("hidden");
});

mapClose.addEventListener("click", () => {
  mapPanel.classList.add("hidden");
});

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
