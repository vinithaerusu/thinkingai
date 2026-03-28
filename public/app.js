const chat = document.getElementById("chat");
const input = document.getElementById("input");
const send = document.getElementById("send");
const mapPanel = document.getElementById("map-panel");
const mapToggle = document.getElementById("map-toggle");
const mapClose = document.getElementById("map-close");
const mapExpand = document.getElementById("map-expand");
const mapSvg = document.getElementById("map-svg");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarList = document.getElementById("sidebar-list");
const sidebarSearchInput = document.getElementById("sidebar-search-input");
const newChatBtn = document.getElementById("new-chat-btn");

// ─── Persistence ───
const STORAGE_KEY = "aux_conversations";

function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveConversations(convos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
}

function saveCurrentConversation() {
  if (messages.length === 0) return;
  const convos = loadConversations();
  convos[currentConvoId] = {
    id: currentConvoId,
    title: convoTitle,
    messages: messages,
    knowledgeMap: knowledgeMap,
    nodeStates: nodeStates,
    updatedAt: Date.now()
  };
  saveConversations(convos);
  renderSidebar();
}

// ─── State ───
let currentConvoId = crypto.randomUUID();
let convoTitle = "";
let messages = [];
let sending = false;
let knowledgeMap = null;
let nodeStates = {};
let activeNodeIndex = -1;

// ─── Sidebar ───
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
});

newChatBtn.addEventListener("click", () => {
  startNewConversation();
});

function startNewConversation() {
  // Save current before switching
  saveCurrentConversation();

  currentConvoId = crypto.randomUUID();
  convoTitle = "";
  messages = [];
  knowledgeMap = null;
  nodeStates = {};
  activeNodeIndex = -1;

  // Reset UI
  chat.innerHTML = `
    <div class="welcome">
      <h2>Learn anything</h2>
      <p>I show you the right examples and let you find the pattern yourself. It sticks better than being told. Just type what you want to understand.</p>
      <div class="suggested-topics">
        <button class="topic-btn" data-topic="How does compound interest work?">Compound interest</button>
        <button class="topic-btn" data-topic="Explain how neural networks learn">Neural networks</button>
        <button class="topic-btn" data-topic="How does the immune system fight infections?">Immune system</button>
        <button class="topic-btn" data-topic="What is supply and demand in economics?">Supply &amp; demand</button>
        <button class="topic-btn" data-topic="How does encryption keep data secure?">Encryption</button>
        <button class="topic-btn" data-topic="How do black holes form?">Black holes</button>
      </div>
    </div>`;
  bindTopicButtons();

  mapPanel.classList.add("hidden");
  mapPanel.classList.remove("expanded");
  mapToggle.classList.add("hidden");
  mapSvg.innerHTML = "";

  renderSidebar();
  input.focus();
}

function loadConversation(id) {
  saveCurrentConversation();

  const convos = loadConversations();
  const convo = convos[id];
  if (!convo) return;

  currentConvoId = convo.id;
  convoTitle = convo.title || "";
  messages = convo.messages || [];
  knowledgeMap = convo.knowledgeMap || null;
  nodeStates = convo.nodeStates || {};
  activeNodeIndex = -1;

  // Rebuild chat UI
  chat.innerHTML = "";
  messages.forEach(m => {
    addMsg(m.role === "user" ? "user" : "ai", m.content, true);
  });

  // Restore map
  if (knowledgeMap) {
    mapPanel.classList.remove("hidden");
    mapToggle.classList.remove("hidden");
    renderMap();
  } else {
    mapPanel.classList.add("hidden");
    mapPanel.classList.remove("expanded");
    mapToggle.classList.add("hidden");
    mapSvg.innerHTML = "";
  }

  renderSidebar();
  input.focus();
}

function deleteConversation(id) {
  const convos = loadConversations();
  delete convos[id];
  saveConversations(convos);

  if (id === currentConvoId) {
    startNewConversation();
  } else {
    renderSidebar();
  }
}

function showDeleteConfirm(item, convoId) {
  // Remove any existing confirmations
  document.querySelectorAll('.delete-confirm').forEach(el => el.remove());
  document.querySelectorAll('.sidebar-item-delete.confirming').forEach(el => el.classList.remove('confirming'));

  const delBtn = item.querySelector('.sidebar-item-delete');
  delBtn.classList.add('confirming');
  delBtn.style.display = 'none';

  const confirm = document.createElement("div");
  confirm.className = "delete-confirm";

  const yes = document.createElement("button");
  yes.className = "delete-confirm-btn delete-confirm-yes";
  yes.textContent = "Delete";
  yes.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteConversation(convoId);
  });

  const no = document.createElement("button");
  no.className = "delete-confirm-btn delete-confirm-no";
  no.textContent = "Cancel";
  no.addEventListener("click", (e) => {
    e.stopPropagation();
    confirm.remove();
    delBtn.style.display = '';
    delBtn.classList.remove('confirming');
  });

  confirm.appendChild(yes);
  confirm.appendChild(no);
  item.appendChild(confirm);
}

function renderSidebar() {
  const convos = loadConversations();
  const searchQuery = (sidebarSearchInput.value || "").trim().toLowerCase();
  const sorted = Object.values(convos)
    .filter(c => !searchQuery || (c.title || "").toLowerCase().includes(searchQuery))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  sidebarList.innerHTML = "";
  sorted.forEach(convo => {
    const item = document.createElement("div");
    item.className = `sidebar-item${convo.id === currentConvoId ? " active" : ""}`;

    const title = document.createElement("span");
    title.className = "sidebar-item-title";
    title.textContent = convo.title || "New conversation";
    item.appendChild(title);

    const del = document.createElement("button");
    del.className = "sidebar-item-delete";
    del.innerHTML = "&times;";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      showDeleteConfirm(item, convo.id);
    });
    item.appendChild(del);

    item.addEventListener("click", () => loadConversation(convo.id));
    sidebarList.appendChild(item);
  });
}

// ─── Suggested Topics ───
function bindTopicButtons() {
  document.querySelectorAll(".topic-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.topic;
      sendMessage();
    });
  });
}
bindTopicButtons();

// ─── Messages ───
function addMsg(role, text, isReplay) {
  const welcome = chat.querySelector(".welcome");
  if (welcome) welcome.remove();

  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "ai"}`;

  if (role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "user-bubble";
    bubble.textContent = text;
    div.appendChild(bubble);
  } else {
    // Parse knowledge map tags before rendering
    const parsed = isReplay ? { cleanText: stripMapTags(text), options: [], charts: [], tables: [], flowcharts: [] } : parseMapTags(text);
    div.innerHTML = renderMarkdown(parsed.cleanText);

    // Render options as clickable buttons (only for live messages)
    if (!isReplay && parsed.options && parsed.options.length > 0) {
      const optionsDiv = document.createElement("div");
      optionsDiv.className = "options-container";

      parsed.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerHTML = `<span class="option-num">${i + 1}</span> ${opt}`;
        btn.addEventListener("click", () => {
          document.querySelectorAll('.options-container').forEach(el => el.remove());
          input.value = opt;
          sendMessage();
        });
        optionsDiv.appendChild(btn);
      });

      const otherDiv = document.createElement("div");
      otherDiv.className = "option-other";
      const otherInput = document.createElement("input");
      otherInput.type = "text";
      otherInput.className = "option-other-input";
      otherInput.placeholder = "Other (type your answer)";
      otherInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && otherInput.value.trim()) {
          document.querySelectorAll('.options-container').forEach(el => el.remove());
          input.value = otherInput.value.trim();
          sendMessage();
        }
      });
      otherDiv.appendChild(otherInput);
      optionsDiv.appendChild(otherDiv);
      div.appendChild(optionsDiv);
    }

    // Render charts
    if (parsed.charts && parsed.charts.length > 0) {
      parsed.charts.forEach(chartData => {
        const wrapper = document.createElement("div");
        wrapper.className = "chart-container";
        const canvas = document.createElement("canvas");
        wrapper.appendChild(canvas);
        div.appendChild(wrapper);

        const colors = ['#7c9885', '#9b8a6e', '#6e8a9b', '#9b6e7c', '#8a9b6e', '#7c6e9b', '#9b8a7c', '#6e9b8a'];

        const datasets = chartData.datasets
          ? chartData.datasets.map((ds, i) => ({
              label: ds.label || '',
              data: ds.data,
              backgroundColor: ds.backgroundColor || colors[i % colors.length] + '40',
              borderColor: ds.borderColor || colors[i % colors.length],
              borderWidth: 2,
              tension: 0.3,
              pointBackgroundColor: colors[i % colors.length],
            }))
          : [{
              label: chartData.ylabel || '',
              data: chartData.data,
              backgroundColor: colors.slice(0, (chartData.data || []).length).map(c => c + '40'),
              borderColor: colors.slice(0, (chartData.data || []).length),
              borderWidth: 2,
              tension: 0.3,
              pointBackgroundColor: '#7c9885',
            }];

        new Chart(canvas, {
          type: chartData.type || 'bar',
          data: {
            labels: chartData.labels || [],
            datasets: datasets,
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: !!chartData.title,
                text: chartData.title || '',
                color: '#e0e0e0',
                font: { size: 13, family: "'IBM Plex Sans', sans-serif" },
              },
              legend: {
                display: datasets.length > 1,
                labels: { color: '#787878', font: { family: "'IBM Plex Sans', sans-serif" } },
              },
            },
            scales: {
              x: {
                title: { display: !!chartData.xlabel, text: chartData.xlabel || '', color: '#787878', font: { family: "'IBM Plex Sans', sans-serif" } },
                ticks: { color: '#4a4a4a', font: { family: "'IBM Plex Sans', sans-serif" } },
                grid: { color: '#2a2a2a' },
              },
              y: {
                title: { display: !!chartData.ylabel, text: chartData.ylabel || '', color: '#787878', font: { family: "'IBM Plex Sans', sans-serif" } },
                ticks: { color: '#4a4a4a', font: { family: "'IBM Plex Sans', sans-serif" } },
                grid: { color: '#2a2a2a' },
              },
            },
          },
        });
      });
    }

    // Render tables
    if (parsed.tables && parsed.tables.length > 0) {
      parsed.tables.forEach(tableData => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-container";
        let html = '<table class="data-table">';
        if (tableData.title) {
          html += `<caption>${tableData.title}</caption>`;
        }
        if (tableData.headers) {
          html += '<thead><tr>';
          tableData.headers.forEach(h => { html += `<th>${h}</th>`; });
          html += '</tr></thead>';
        }
        html += '<tbody>';
        (tableData.rows || []).forEach(row => {
          html += '<tr>';
          row.forEach(cell => { html += `<td>${cell}</td>`; });
          html += '</tr>';
        });
        html += '</tbody></table>';
        wrapper.innerHTML = html;
        div.appendChild(wrapper);
      });
    }

    // Render flowcharts
    if (parsed.flowcharts && parsed.flowcharts.length > 0) {
      parsed.flowcharts.forEach(mermaidCode => {
        const wrapper = document.createElement("div");
        wrapper.className = "flowchart-container";
        const mermaidDiv = document.createElement("div");
        mermaidDiv.className = "mermaid";
        mermaidDiv.textContent = mermaidCode;
        wrapper.appendChild(mermaidDiv);
        div.appendChild(wrapper);
      });
    }

    // Add actionable feedback buttons
    if (!isReplay) {
      const feedbackDiv = document.createElement("div");
      feedbackDiv.className = "msg-feedback";

      const understandBtn = document.createElement("button");
      understandBtn.className = "feedback-btn feedback-understand";
      understandBtn.textContent = "I understand";

      const explainBtn = document.createElement("button");
      explainBtn.className = "feedback-btn feedback-explain";
      explainBtn.textContent = "Explain differently";

      understandBtn.addEventListener("click", () => {
        feedbackDiv.remove();
        input.value = "I understand this. Let's move on.";
        sendMessage();
      });

      explainBtn.addEventListener("click", () => {
        feedbackDiv.remove();
        input.value = "I don't quite get this. Can you explain it differently?";
        sendMessage();
      });

      feedbackDiv.appendChild(understandBtn);
      feedbackDiv.appendChild(explainBtn);
      div.appendChild(feedbackDiv);
    }
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  // Render any mermaid diagrams after DOM insertion
  if (div.querySelector('.mermaid')) {
    mermaid.run({ nodes: div.querySelectorAll('.mermaid') });
  }

  return div;
}

// Strip map/chart/table/flowchart/option tags for replay (don't re-parse map state)
function stripMapTags(text) {
  return text
    .replace(/\[KNOWLEDGE_MAP\][\s\S]*?\[\/KNOWLEDGE_MAP\]/g, '')
    .replace(/\[ACTIVE_NODE\].*?\[\/ACTIVE_NODE\]/g, '')
    .replace(/\[COMPLETED_NODE\].*?\[\/COMPLETED_NODE\]/g, '')
    .replace(/\[EXPAND_MAP\][\s\S]*?\[\/EXPAND_MAP\]/g, '')
    .replace(/\[CHART\][\s\S]*?\[\/CHART\]/g, '')
    .replace(/\[TABLE\][\s\S]*?\[\/TABLE\]/g, '')
    .replace(/\[FLOWCHART\][\s\S]*?\[\/FLOWCHART\]/g, '')
    .replace(/\[OPTIONS\][\s\S]*?\[\/OPTIONS\]/g, '')
    .trim();
}

function parseMapTags(text) {
  let cleanText = text;

  const mapMatch = text.match(/\[KNOWLEDGE_MAP\]([\s\S]*?)\[\/KNOWLEDGE_MAP\]/);
  if (mapMatch) {
    const mapContent = mapMatch[1].trim();
    parseKnowledgeMap(mapContent);
    cleanText = cleanText.replace(/\[KNOWLEDGE_MAP\][\s\S]*?\[\/KNOWLEDGE_MAP\]/, '').trim();
  }

  const activeMatch = text.match(/\[ACTIVE_NODE\](.*?)\[\/ACTIVE_NODE\]/);
  if (activeMatch) {
    const nodeName = activeMatch[1].trim().toLowerCase();
    setActiveNode(nodeName);
    cleanText = cleanText.replace(/\[ACTIVE_NODE\].*?\[\/ACTIVE_NODE\]/, '').trim();
  }

  const completedMatch = text.match(/\[COMPLETED_NODE\](.*?)\[\/COMPLETED_NODE\]/);
  if (completedMatch) {
    const nodeName = completedMatch[1].trim().toLowerCase();
    completeNode(nodeName);
    cleanText = cleanText.replace(/\[COMPLETED_NODE\].*?\[\/COMPLETED_NODE\]/, '').trim();
  }

  const expandMatch = text.match(/\[EXPAND_MAP\]([\s\S]*?)\[\/EXPAND_MAP\]/);
  if (expandMatch) {
    const expandContent = expandMatch[1].trim();
    expandNode(expandContent);
    cleanText = cleanText.replace(/\[EXPAND_MAP\][\s\S]*?\[\/EXPAND_MAP\]/, '').trim();
  }

  let charts = [];
  const chartRegex = /\[CHART\]([\s\S]*?)\[\/CHART\]/g;
  let chartMatch;
  while ((chartMatch = chartRegex.exec(cleanText)) !== null) {
    try { charts.push(JSON.parse(chartMatch[1].trim())); } catch (e) { console.error('Failed to parse chart JSON:', e); }
  }
  cleanText = cleanText.replace(/\[CHART\][\s\S]*?\[\/CHART\]/g, '').trim();

  let tables = [];
  const tableRegex = /\[TABLE\]([\s\S]*?)\[\/TABLE\]/g;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(cleanText)) !== null) {
    try { tables.push(JSON.parse(tableMatch[1].trim())); } catch (e) { console.error('Failed to parse table JSON:', e); }
  }
  cleanText = cleanText.replace(/\[TABLE\][\s\S]*?\[\/TABLE\]/g, '').trim();

  let flowcharts = [];
  const flowRegex = /\[FLOWCHART\]([\s\S]*?)\[\/FLOWCHART\]/g;
  let flowMatch;
  while ((flowMatch = flowRegex.exec(cleanText)) !== null) {
    flowcharts.push(flowMatch[1].trim());
  }
  cleanText = cleanText.replace(/\[FLOWCHART\][\s\S]*?\[\/FLOWCHART\]/g, '').trim();

  let options = [];
  const optionsMatch = cleanText.match(/\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/);
  if (optionsMatch) {
    options = optionsMatch[1].trim().split('\n').map(l => l.trim()).filter(l => l);
    cleanText = cleanText.replace(/\[OPTIONS\][\s\S]*?\[\/OPTIONS\]/, '').trim();
  }

  return { cleanText, options, charts, tables, flowcharts };
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
      nodes.push({ type: match[1].trim(), label: match[2].trim(), children: [] });
    }
  }

  if (nodes.length === 0) return;

  knowledgeMap = { root, nodes };
  nodeStates = {};
  nodes.forEach(n => { nodeStates[n.type] = 'pending'; });
  activeNodeIndex = -1;

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

  // Mark next pending node as suggested
  Object.keys(nodeStates).forEach(k => {
    if (nodeStates[k] === 'suggested') nodeStates[k] = 'pending';
  });
  const nextPending = knowledgeMap.nodes.find(n => nodeStates[n.type] === 'pending');
  if (nextPending) {
    nodeStates[nextPending.type] = 'suggested';
  }

  renderMap();
}

function expandNode(content) {
  if (!knowledgeMap) return;
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return;

  const parentType = lines[0].trim().toLowerCase();
  const parent = knowledgeMap.nodes.find(n =>
    n.type.toLowerCase() === parentType || n.label.toLowerCase().includes(parentType)
  );
  if (!parent) return;

  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/[├└]──\s*(\w+):\s*(.+)/);
    if (match) {
      const childType = match[1].trim();
      const childLabel = match[2].trim();
      const childKey = parent.type + '.' + childType;
      if (!parent.children.find(c => c.type === childType)) {
        parent.children.push({ type: childType, label: childLabel, children: [], parentType: parent.type });
        nodeStates[childKey] = 'pending';
      }
    }
  }

  renderMap();
}

function renderMap() {
  if (!knowledgeMap) return;

  const nodes = knowledgeMap.nodes;
  const nodeW = 180;
  const nodeH = 48;
  const childW = 160;
  const childH = 40;
  const rootW = 180;
  const rootH = 44;
  const vGap = 60;
  const childVGap = 40;
  const hGap = 16;

  const cols = Math.min(nodes.length, 2);
  const rowCount = Math.ceil(nodes.length / cols);
  const rowHeights = [];
  for (let r = 0; r < rowCount; r++) {
    let maxChildren = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < nodes.length) {
        maxChildren = Math.max(maxChildren, nodes[idx].children.length);
      }
    }
    rowHeights.push(nodeH + (maxChildren > 0 ? maxChildren * (childH + 12) + childVGap : 0));
  }

  const totalW = cols * (nodeW + hGap) - hGap + 40;
  const totalH = rootH + vGap + rowHeights.reduce((a, b) => a + b + vGap, 0) + 20;
  const centerX = totalW / 2;

  mapSvg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  mapSvg.style.height = totalH + 'px';
  mapSvg.innerHTML = '';

  const rootX = centerX - rootW / 2;
  const rootY = 16;
  const rootCenterY = rootY + rootH / 2;

  const rootGroup = createSvgElement('g', { class: 'map-node root' });
  rootGroup.appendChild(createSvgElement('rect', { x: rootX, y: rootY, width: rootW, height: rootH }));
  rootGroup.appendChild(createSvgElement('text', { x: centerX, y: rootCenterY }, knowledgeMap.root));
  mapSvg.appendChild(rootGroup);

  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    let ny = rootY + rootH + vGap;
    for (let r = 0; r < row; r++) {
      ny += rowHeights[r] + vGap;
    }

    const colWidth = (totalW - 40) / cols;
    const nx = 20 + col * colWidth + (colWidth - nodeW) / 2;
    const ncx = nx + nodeW / 2;
    const ncy = ny + nodeH / 2;

    const state = nodeStates[node.type] || 'pending';

    const lineClass = state === 'completed' ? 'map-line completed' : state === 'active' ? 'map-line active' : state === 'suggested' ? 'map-line suggested' : 'map-line';
    const line = createSvgElement('path', {
      d: `M ${centerX} ${rootY + rootH} C ${centerX} ${rootY + rootH + vGap / 2}, ${ncx} ${ny - vGap / 2}, ${ncx} ${ny}`,
      class: lineClass
    });
    mapSvg.insertBefore(line, rootGroup);

    const group = createSvgElement('g', { class: `map-node ${state} clickable` });
    group.style.cursor = 'pointer';
    group.appendChild(createSvgElement('rect', { x: nx, y: ny, width: nodeW, height: nodeH }));

    group.appendChild(createSvgElement('text', { x: ncx, y: ncy - 8, class: 'map-node-type' }, node.type));

    const label = node.label.length > 28 ? node.label.slice(0, 26) + '...' : node.label;
    group.appendChild(createSvgElement('text', { x: ncx, y: ncy + 8 }, label));

    group.addEventListener('click', () => {
      const msg = state === 'completed'
        ? `Let's revisit ${node.label}`
        : `Let's explore ${node.label}`;
      input.value = msg;
      sendMessage();
    });

    mapSvg.appendChild(group);

    if (node.children.length > 0) {
      let childY = ny + nodeH + childVGap;

      node.children.forEach(child => {
        const childKey = node.type + '.' + child.type;
        const childState = nodeStates[childKey] || 'pending';

        const cx = ncx - childW / 2;
        const ccx = ncx;
        const ccy = childY + childH / 2;

        const childLineClass = childState === 'completed' ? 'map-line completed' : childState === 'active' ? 'map-line active' : 'map-line';
        mapSvg.appendChild(createSvgElement('path', {
          d: `M ${ncx} ${ny + nodeH} C ${ncx} ${ny + nodeH + childVGap / 2}, ${ccx} ${childY - childVGap / 2}, ${ccx} ${childY}`,
          class: childLineClass
        }));

        const childGroup = createSvgElement('g', { class: `map-node child ${childState} clickable` });
        childGroup.style.cursor = 'pointer';
        childGroup.appendChild(createSvgElement('rect', { x: cx, y: childY, width: childW, height: childH }));

        childGroup.appendChild(createSvgElement('text', { x: ccx, y: ccy - 6, class: 'map-node-type' }, child.type));

        const childLabel = child.label.length > 24 ? child.label.slice(0, 22) + '...' : child.label;
        childGroup.appendChild(createSvgElement('text', { x: ccx, y: ccy + 6 }, childLabel));

        childGroup.addEventListener('click', () => {
          const msg = childState === 'completed'
            ? `Let's revisit ${child.label} under ${node.label}`
            : `Let's explore ${child.label} under ${node.label}`;
          input.value = msg;
          sendMessage();
        });

        mapSvg.appendChild(childGroup);
        childY += childH + 12;
      });
    }
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
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  let listType = '';
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (/^---+$/.test(line.trim())) {
      if (inList) { html += `</${listType}>`; inList = false; }
      if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
      html += '<hr>';
      continue;
    }

    const h3 = line.match(/^### (.+)/);
    if (h3) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h4>${applyInline(h3[1])}</h4>`;
      continue;
    }
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h3>${applyInline(h2[1])}</h3>`;
      continue;
    }
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h2>${applyInline(h1[1])}</h2>`;
      continue;
    }

    const bq = line.match(/^> (.+)/);
    if (bq) {
      if (inList) { html += `</${listType}>`; inList = false; }
      if (!inBlockquote) { html += '<blockquote>'; inBlockquote = true; }
      html += `<p>${applyInline(bq[1])}</p>`;
      continue;
    } else if (inBlockquote) {
      html += '</blockquote>';
      inBlockquote = false;
    }

    const ul = line.match(/^[\-\*] (.+)/);
    if (ul) {
      if (!inList || listType !== 'ul') {
        if (inList) html += `</${listType}>`;
        html += '<ul>';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${applyInline(ul[1])}</li>`;
      continue;
    }

    const ol = line.match(/^\d+\. (.+)/);
    if (ol) {
      if (!inList || listType !== 'ol') {
        if (inList) html += `</${listType}>`;
        html += '<ol>';
        inList = true;
        listType = 'ol';
      }
      html += `<li>${applyInline(ol[1])}</li>`;
      continue;
    }

    if (inList) {
      html += `</${listType}>`;
      inList = false;
    }

    if (line.trim() === '') {
      html += '<div class="spacer"></div>';
      continue;
    }

    html += `<p>${applyInline(line)}</p>`;
  }

  if (inList) html += `</${listType}>`;
  if (inBlockquote) html += '</blockquote>';

  return html;
}

function applyInline(text) {
  return text
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "typing";
  div.id = "typing";
  div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div> Thinking';
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

  // Set conversation title from first user message
  if (!convoTitle) {
    convoTitle = text.length > 50 ? text.slice(0, 47) + "..." : text;
  }

  // Save after user message
  saveCurrentConversation();

  showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, sessionId: currentConvoId }),
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

    // Save after AI response
    saveCurrentConversation();
  } catch (err) {
    hideTyping();
    addMsg("ai", "Something went wrong. Please try again in a moment.");
    messages.pop();
  }

  sending = false;
  send.disabled = false;
  input.focus();
}

// ─── Map Panel Controls ───
mapToggle.addEventListener("click", () => {
  mapPanel.classList.toggle("hidden");
});

mapClose.addEventListener("click", () => {
  mapPanel.classList.add("hidden");
  mapPanel.classList.remove("expanded");
});

mapExpand.addEventListener("click", () => {
  mapPanel.classList.toggle("expanded");
  renderMap();
});

// ─── Input Controls ───
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

// ─── Search ───
sidebarSearchInput.addEventListener("input", () => {
  renderSidebar();
});

// ─── My Knowledge ───
const myKnowledgeBtn = document.getElementById("my-knowledge-btn");
const knowledgeOverlay = document.getElementById("knowledge-overlay");
const knowledgeOverlayClose = document.getElementById("knowledge-overlay-close");
const knowledgeOverlayContent = document.getElementById("knowledge-overlay-content");

myKnowledgeBtn.addEventListener("click", () => {
  renderKnowledgeOverlay();
  knowledgeOverlay.classList.remove("hidden");
});

knowledgeOverlayClose.addEventListener("click", () => {
  knowledgeOverlay.classList.add("hidden");
});

function renderKnowledgeOverlay() {
  const convos = loadConversations();
  const topics = {};

  Object.values(convos).forEach(convo => {
    if (!convo.knowledgeMap || !convo.nodeStates) return;
    const root = convo.knowledgeMap.root || "Unknown";
    if (!topics[root]) topics[root] = { completed: [], total: 0 };

    convo.knowledgeMap.nodes.forEach(node => {
      topics[root].total++;
      if (convo.nodeStates[node.type] === "completed") {
        topics[root].completed.push(node);
      }
    });
  });

  const topicKeys = Object.keys(topics);

  if (topicKeys.length === 0) {
    knowledgeOverlayContent.innerHTML = `
      <div class="knowledge-empty">
        <p>No knowledge yet.</p>
        <p class="knowledge-empty-sub">Start a conversation and complete nodes on the knowledge map to track what you've learned.</p>
      </div>`;
    return;
  }

  let html = '';
  topicKeys.forEach(topic => {
    const t = topics[topic];
    const pct = t.total > 0 ? Math.round((t.completed.length / t.total) * 100) : 0;
    html += `<div class="knowledge-topic">
      <div class="knowledge-topic-header">
        <span class="knowledge-topic-name">${topic}</span>
        <span class="knowledge-topic-progress">${t.completed.length}/${t.total} nodes &middot; ${pct}%</span>
      </div>
      <div class="knowledge-progress-bar"><div class="knowledge-progress-fill" style="width:${pct}%"></div></div>`;
    if (t.completed.length > 0) {
      html += '<div class="knowledge-nodes">';
      t.completed.forEach(n => {
        html += `<span class="knowledge-node-tag">${n.type}: ${n.label}</span>`;
      });
      html += '</div>';
    }
    html += '</div>';
  });

  knowledgeOverlayContent.innerHTML = html;
}

// ─── Init ───
renderSidebar();
