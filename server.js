const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Supabase setup (optional - for logging)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is required');
  process.exit(1);
}

const MODEL = 'gemini-3.1-flash-lite-preview';

function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

const SYSTEM_PROMPT = `PHASE 1 -
When the user inputs a prompt, ask them questions to gauge what they know.

PHASE 2 -
Based on their responses, answer their question, but do not show it to them.

PHASE 3 -
Generate a knowledge map using this answer and share it with the user. Then ask the user if they want to continue.

IMPORTANT FORMATTING: You MUST wrap the knowledge map in [KNOWLEDGE_MAP] and [/KNOWLEDGE_MAP] tags. Use the exact tree format shown below. The app uses these tags to render a visual interactive map.

For example, consider the following example response to a prompt-
Input prompt- What is a bond in investment

The AI would internally generate an answer covering, for example- simple idea, examples, key parts, types, why investors buy, risks, comparisons, etc.

Then generate a knowledge map from that answer. The response consists of different types of knowledge. So the map needs nodes of different types:

[KNOWLEDGE_MAP]
For example-
bond
├── concept: loan, interest
├── parts: face value, coupon rate, maturity
├── types: government, corporate, municipal
├── example: ₹10,000 at 7% for 5 years
├── compare: bonds vs stocks
├── why: steady income, lower risk, balance
├── risks: interest rate, credit, inflation
└── action: how to actually buy one
[/KNOWLEDGE_MAP]

The node types get taught appropriately.
So the map isn't just a concept map. It's a knowledge map — covering everything a good explanation would cover. The map should link each node type appropriately.

IMPORTANT: After showing the knowledge map, STOP and wait for the user to respond before moving to Phase 4. Do NOT continue to Phase 4 in the same message.

PHASE 4 -
When starting a new node, include the tag [ACTIVE_NODE]nodeType[/ACTIVE_NODE] at the start of your message (e.g. [ACTIVE_NODE]concept[/ACTIVE_NODE]). The nodeType must match one of the node types from the knowledge map (concept, parts, types, example, compare, why, risks, action, etc.).

First, show the user the minimum number of data points needed to understand the current node. Display these data points clearly as a list. Do NOT explain the pattern or give the direct answer — just present the raw data points. If the knowledge map has more than one node, start with the first fundamental node only. After showing the data points, ask the user a probing question to help them find the pattern on their own. Do not reveal the answer unless they explicitly ask for it.

PHASE 5 -
Once the user finds the pattern in the previous node, include the tag [COMPLETED_NODE]nodeType[/COMPLETED_NODE] at the start of your message. Then ask them if they want to go deeper or move to the next node in sequence to answer the question. Then do so accordingly. Expand the knwledge map as the user goes deeper into the nodes.`;

async function callGemini(messages, model) {
  const geminiMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const res = await fetch(geminiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  if (!res.ok) {
    const error = await res.text();
    throw { status: res.status, message: error, model };
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.';
}

app.post('/api/chat', async (req, res) => {
  const { messages, sessionId } = req.body;

  try {
    const reply = await callGemini(messages, MODEL);

    // Log to Supabase if configured
    if (supabase && sessionId) {
      const userMsg = messages[messages.length - 1]?.content || '';
      supabase.from('chat_logs').insert({
        session_id: sessionId,
        user_message: userMsg,
        ai_response: reply,
        created_at: new Date().toISOString()
      }).then(() => {}).catch(err => console.error('Supabase log error:', err));
    }

    res.json({ reply });
  } catch (err) {
    console.error('Gemini API error:', err.message || err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aux running on port ${PORT}`));
