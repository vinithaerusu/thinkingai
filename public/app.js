const chat = document.getElementById("chat");
const input = document.getElementById("input");
const send = document.getElementById("send");
const mapPanel = document.getElementById("map-panel");
const mapToggle = document.getElementById("map-toggle");
const mapClose = document.getElementById("map-close");
const mapExpand = document.getElementById("map-expand");
const mapSvg = document.getElementById("map-svg");

const sessionId = crypto.randomUUID();
let messages = [];
let sending = false;

// Knowledge map state
let knowledgeMap = null; // { root: string, nodes: [{ type, label, children: [] }] }
let nodeStates = {}; // { type: 'pending' | 'active' | 'completed' }
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

    // Render options as clickable buttons
    if (parsed.options && parsed.options.length > 0) {
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

      // Add "Other" option with custom input
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

        const colors = ['#5a5aff', '#ff5a5a', '#5aff5a', '#ffaa5a', '#5affff', '#ff5aff', '#aaff5a', '#5aaaff'];

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
              pointBackgroundColor: '#5a5aff',
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
                color: '#e5e5e5',
                font: { size: 14 },
              },
              legend: {
                display: datasets.length > 1,
                labels: { color: '#999' },
              },
            },
            scales: {
              x: {
                title: { display: !!chartData.xlabel, text: chartData.xlabel || '', color: '#999' },
                ticks: { color: '#888' },
                grid: { color: '#222' },
              },
              y: {
                title: { display: !!chartData.ylabel, text: chartData.ylabel || '', color: '#999' },
                ticks: { color: '#888' },
                grid: { color: '#222' },
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
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  // Render any mermaid diagrams after DOM insertion
  if (div.querySelector('.mermaid')) {
    mermaid.run({ nodes: div.querySelectorAll('.mermaid') });
  }

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

  // Parse [EXPAND_MAP]...[/EXPAND_MAP]
  const expandMatch = text.match(/\[EXPAND_MAP\]([\s\S]*?)\[\/EXPAND_MAP\]/);
  if (expandMatch) {
    const expandContent = expandMatch[1].trim();
    expandNode(expandContent);
    cleanText = cleanText.replace(/\[EXPAND_MAP\][\s\S]*?\[\/EXPAND_MAP\]/, '').trim();
  }

  // Parse [CHART]...[/CHART]
  let charts = [];
  const chartRegex = /\[CHART\]([\s\S]*?)\[\/CHART\]/g;
  let chartMatch;
  while ((chartMatch = chartRegex.exec(cleanText)) !== null) {
    try {
      charts.push(JSON.parse(chartMatch[1].trim()));
    } catch (e) {
      console.error('Failed to parse chart JSON:', e);
    }
  }
  cleanText = cleanText.replace(/\[CHART\][\s\S]*?\[\/CHART\]/g, '').trim();

  // Parse [TABLE]...[/TABLE]
  let tables = [];
  const tableRegex = /\[TABLE\]([\s\S]*?)\[\/TABLE\]/g;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(cleanText)) !== null) {
    try {
      tables.push(JSON.parse(tableMatch[1].trim()));
    } catch (e) {
      console.error('Failed to parse table JSON:', e);
    }
  }
  cleanText = cleanText.replace(/\[TABLE\][\s\S]*?\[\/TABLE\]/g, '').trim();

  // Parse [FLOWCHART]...[/FLOWCHART]
  let flowcharts = [];
  const flowRegex = /\[FLOWCHART\]([\s\S]*?)\[\/FLOWCHART\]/g;
  let flowMatch;
  while ((flowMatch = flowRegex.exec(cleanText)) !== null) {
    flowcharts.push(flowMatch[1].trim());
  }
  cleanText = cleanText.replace(/\[FLOWCHART\][\s\S]*?\[\/FLOWCHART\]/g, '').trim();

  // Parse [OPTIONS]...[/OPTIONS]
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

function expandNode(content) {
  if (!knowledgeMap) return;
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return;

  // First line is the parent node type
  const parentType = lines[0].trim().toLowerCase();
  const parent = knowledgeMap.nodes.find(n =>
    n.type.toLowerCase() === parentType || n.label.toLowerCase().includes(parentType)
  );
  if (!parent) return;

  // Parse child nodes
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/[├└]──\s*(\w+):\s*(.+)/);
    if (match) {
      const childType = match[1].trim();
      const childLabel = match[2].trim();
      const childKey = parent.type + '.' + childType;
      // Avoid duplicates
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

  // Calculate layout — account for expanded children
  const cols = Math.min(nodes.length, 2);

  // Calculate row heights (a row is taller if a node in it has children)
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
  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Calculate Y position based on cumulative row heights
    let ny = rootY + rootH + vGap;
    for (let r = 0; r < row; r++) {
      ny += rowHeights[r] + vGap;
    }

    const colWidth = (totalW - 40) / cols;
    const nx = 20 + col * colWidth + (colWidth - nodeW) / 2;
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
    const group = createSvgElement('g', { class: `map-node ${state} clickable` });
    group.style.cursor = 'pointer';
    group.appendChild(createSvgElement('rect', {
      x: nx, y: ny, width: nodeW, height: nodeH
    }));

    // Type label (small, above)
    group.appendChild(createSvgElement('text', {
      x: ncx, y: ncy - 8, class: 'map-node-type'
    }, node.type));

    // Value label
    const label = node.label.length > 28 ? node.label.slice(0, 26) + '...' : node.label;
    group.appendChild(createSvgElement('text', {
      x: ncx, y: ncy + 8
    }, label));

    group.addEventListener('click', () => {
      const msg = state === 'completed'
        ? `Let's revisit ${node.label}`
        : `Let's explore ${node.label}`;
      input.value = msg;
      sendMessage();
    });

    mapSvg.appendChild(group);

    // Render children if expanded
    if (node.children.length > 0) {
      let childY = ny + nodeH + childVGap;

      node.children.forEach(child => {
        const childKey = node.type + '.' + child.type;
        const childState = nodeStates[childKey] || 'pending';

        const cx = ncx - childW / 2;
        const ccx = ncx;
        const ccy = childY + childH / 2;

        // Line from parent to child
        const childLineClass = childState === 'completed' ? 'map-line completed' : childState === 'active' ? 'map-line active' : 'map-line';
        mapSvg.appendChild(createSvgElement('path', {
          d: `M ${ncx} ${ny + nodeH} C ${ncx} ${ny + nodeH + childVGap / 2}, ${ccx} ${childY - childVGap / 2}, ${ccx} ${childY}`,
          class: childLineClass
        }));

        // Child node
        const childGroup = createSvgElement('g', { class: `map-node child ${childState} clickable` });
        childGroup.style.cursor = 'pointer';
        childGroup.appendChild(createSvgElement('rect', {
          x: cx, y: childY, width: childW, height: childH
        }));

        childGroup.appendChild(createSvgElement('text', {
          x: ccx, y: ccy - 6, class: 'map-node-type'
        }, child.type));

        const childLabel = child.label.length > 24 ? child.label.slice(0, 22) + '...' : child.label;
        childGroup.appendChild(createSvgElement('text', {
          x: ccx, y: ccy + 6
        }, childLabel));

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

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { html += `</${listType}>`; inList = false; }
      if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
      html += '<hr>';
      continue;
    }

    // Headers
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

    // Blockquote
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

    // Unordered list
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

    // Ordered list
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

    // Close list if we're no longer in one
    if (inList) {
      html += `</${listType}>`;
      inList = false;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      html += '<div class="spacer"></div>';
      continue;
    }

    // Regular paragraph
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
  mapPanel.classList.remove("expanded");
});

mapExpand.addEventListener("click", () => {
  mapPanel.classList.toggle("expanded");
  renderMap();
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
