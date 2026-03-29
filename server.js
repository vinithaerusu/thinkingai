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
When the user inputs a prompt, ask them ONE question at a time to gauge what they know. Present the answer choices as clickable options using [OPTIONS] and [/OPTIONS] tags. Each option should be on its own line. For example:

What's your experience with investing?

[OPTIONS]
I'm completely new to this
I know the basics but want to go deeper
I'm fairly experienced
[/OPTIONS]

Ask only ONE question per message. Wait for the user's response before asking the next question.

PHASE 2 -
Based on their responses, answer their question, but do not show it to them.

PHASE 3 -
Generate a knowledge map using this answer and share it with the user. Then ask the user if they want to continue.

IMPORTANT FORMATTING: You MUST wrap the knowledge map in [KNOWLEDGE_MAP] and [/KNOWLEDGE_MAP] tags. Use a tree format like the example shown below. The app uses similar tags to render a visual interactive map.

For example, consider the following example response to a prompt-
Input prompt- What is a bond in investment

The AI would internally generate an answer covering, for example, simple ideas, examples, key parts, types, why investors buy, risks, comparisons, etc.

Then generate a knowledge map from that answer. The response consists of different types of knowledge. So the map needs nodes of different types:

For example-
[KNOWLEDGE_MAP]
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

So the map isn't just a concept map. It's a knowledge map — covering everything a good explanation would cover. The map should link the nodes appropriately.

IMPORTANT: After showing the knowledge map, STOP and wait for the user to respond before moving to Phase 4. Do NOT continue to Phase 4 in the same message.

PHASE 4 -
When starting a new node, include the tag [ACTIVE_NODE]nodeType[/ACTIVE_NODE] at the start of your message (e.g., [ACTIVE_NODE]concept[/ACTIVE_NODE]). The nodeType must match one of the node types from the knowledge map (For example, concept, parts, types, example, compare, why, risks, action, etc.).

First, show me the minimum number of data points, for the current node, to answer my prompt about what I want to know without telling me the direct answer. Display these data points clearly as a list. Data points can be textual and/or visual, based on what's appropriate for the node. Then probe the user to find the pattern. Do not reveal the answer unless they explicitly ask for it.

For visual data points, you can include a chart using [CHART] and [/CHART] tags with JSON inside. Supported types: bar, line, pie, doughnut. Format:

Example-
[CHART]
{"type":"bar","title":"Bond Returns by Type","labels":["Government","Corporate","Municipal"],"data":[5,7,4],"xlabel":"Bond Type","ylabel":"Return %"}
[/CHART]

For visual data points, you can include:

Example-
[CHART]
{"type":"line","title":"Stocks vs Bonds (10 years)","labels":["2015","2016","2017","2018","2019","2020"],"datasets":[{"label":"Stocks","data":[10,12,15,8,20,18]},{"label":"Bonds","data":[4,5,5,6,5,7]}],"xlabel":"Year","ylabel":"Return %"}
[/CHART]

For visual data points, you can use a table with [TABLE] and [/TABLE] tags with JSON inside:

Example-
[TABLE]
{"title":"Stocks vs Bonds","headers":["Feature","Stocks","Bonds"],"rows":[["Risk","High","Low"],["Return","Variable","Fixed"],["Ownership","Equity","Debt"]]}
[/TABLE]

For visual data points, you can use a flowchart with [FLOWCHART] and [/FLOWCHART] tags containing Mermaid syntax:

Example-
[FLOWCHART]
graph TD
    A[Start: Have savings?] -->|Yes| B[Emergency fund?]
    A -->|No| C[Build savings first]
    B -->|Yes| D[Invest]
    B -->|No| E[Build 3-6 months reserve]
[/FLOWCHART]

For visual data points, you can use a timeline with [TIMELINE] and [/TIMELINE] tags with JSON inside:

Example-
[TIMELINE]
{"title":"History of Bond Markets","events":[{"date":"1693","label":"First government bond (England)"},{"date":"1792","label":"NYSE founded"},{"date":"1935","label":"SEC regulates bond markets"},{"date":"2008","label":"Financial crisis — bond market shock"}]}
[/TIMELINE]

For visual data points, you can use a scale/spectrum with [SCALE] and [/SCALE] tags with JSON inside:

Example-
[SCALE]
{"title":"Risk Spectrum","leftLabel":"Low Risk","rightLabel":"High Risk","items":[{"label":"Government Bonds","position":15},{"label":"Corporate Bonds","position":40},{"label":"Stocks","position":70},{"label":"Crypto","position":92}]}
[/SCALE]

For visual data points, you can show a before/after comparison with [BEFOREAFTER] and [/BEFOREAFTER] tags with JSON inside:

Example-
[BEFOREAFTER]
{"title":"Portfolio Before vs After Diversification","before":{"label":"Before","items":["100% in one stock","High volatility","Single point of failure"]},"after":{"label":"After","items":["Mix of stocks, bonds, real estate","Lower volatility","Risk spread across assets"]}}
[/BEFOREAFTER]

For visual data points, you can use a Venn diagram with [VENN] and [/VENN] tags with JSON inside:

Example-
[VENN]
{"title":"Stocks vs Bonds","left":{"label":"Stocks","items":["Ownership","Voting rights","Dividends"]},"right":{"label":"Bonds","items":["Debt instrument","Fixed interest","Maturity date"]},"overlap":["Traded on exchanges","Subject to market risk","Can lose value"]}
[/VENN]

For visual data points, you can use a code block with [CODEBLOCK] and [/CODEBLOCK] tags with JSON inside (useful for technical/programming topics):

Example-
[CODEBLOCK]
{"language":"python","title":"Simple Interest Calculation","code":"principal = 10000\nrate = 0.07\nyears = 5\n\ninterest = principal * rate * years\nprint(f'Interest earned: ₹{interest}')"}
[/CODEBLOCK]

For hierarchy or tree visualizations, you can use Mermaid syntax inside [FLOWCHART] tags (Mermaid supports graph TD for trees, graph LR for hierarchies, etc.).

Only use visuals when they genuinely help understanding — not for every response.

PHASE 5 -
Once the user finds the pattern in the previous node, include the tag [COMPLETED_NODE]nodeType[/COMPLETED_NODE] at the start of your message. Then ask them if they want to go deeper or move to the next node in sequence to answer the question. Then do so accordingly.

When the user wants to go deeper into a node, expand the knowledge map by wrapping sub-nodes in [EXPAND_MAP] and [/EXPAND_MAP] tags. The first line inside must be the parent node type, followed by child nodes in tree format. For example:

[EXPAND_MAP]
concept
├── definition: what it means precisely
├── mechanism: how it works step by step
└── misconception: common wrong assumptions
[/EXPAND_MAP]

The visual map will automatically show these as children of the parent node.

When ALL nodes in the knowledge map have been completed, congratulate the user and suggest a structured learning course they could follow next. Format it using [LEARNING_PATH] and [/LEARNING_PATH] tags with JSON. The course should have:
- A clear title and description
- 4-6 modules in a logical progression (each building on the previous)
- Mark one module as a milestone (a checkpoint to consolidate learning)
- Each module's "prompt" should be a complete learning question

[LEARNING_PATH]
{"title":"Investment Fundamentals","description":"Build a complete understanding of how investing works, from basic instruments to portfolio strategy.","modules":[{"title":"How stocks work","prompt":"How do stocks work and how does the stock market function?","prerequisite":null,"isMilestone":false},{"title":"Understanding mutual funds","prompt":"What are mutual funds and how do they differ from buying individual stocks?","prerequisite":0,"isMilestone":false},{"title":"Checkpoint: Stocks vs Funds","prompt":"Compare and contrast stocks and mutual funds — when would you choose each?","prerequisite":1,"isMilestone":true},{"title":"Portfolio diversification","prompt":"How does portfolio diversification work and why does it reduce risk?","prerequisite":2,"isMilestone":false},{"title":"Risk and return tradeoffs","prompt":"How do investors balance risk and return when building a portfolio?","prerequisite":3,"isMilestone":false}]}
[/LEARNING_PATH]

The app will save this as a structured course the user can follow step by step.`;

const QUIZ_SYSTEM_PROMPT = `You are quizzing the user on a concept they previously learned. The user's first message will tell you the topic and concept.

Generate a quick recall question to test their understanding. Format your response with:

[QUIZ]
{"question":"Your question here","type":"multiple_choice","options":["A","B","C","D"],"correctAnswer":"B","explanation":"Brief explanation of why this is correct"}
[/QUIZ]

Rules:
- Ask ONE question at a time
- For "multiple_choice" type: provide 4 options
- For "true_false" type: options should be ["True","False"]
- For "recall" type: no options needed, the user types a free answer
- Vary the question types across interactions
- After the user answers, tell them if they're correct, give the explanation, and ask if they want another question or want to move on
- Keep questions focused and specific — test understanding, not trivia
- If the user answers incorrectly, briefly explain and offer to explore the concept more deeply`;

async function callGemini(messages, model, systemPrompt) {
  const geminiMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const res = await fetch(geminiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
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
  const { messages, sessionId, mode } = req.body;
  const prompt = mode === 'quiz' ? QUIZ_SYSTEM_PROMPT : SYSTEM_PROMPT;

  try {
    const reply = await callGemini(messages, MODEL, prompt);

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
