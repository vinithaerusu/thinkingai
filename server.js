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

const SYSTEM_PROMPT = `Follow the steps one by one, not together.

Step 1:
When the user inputs a prompt, ask them questions to gauge what they know before giving them the knowledge map.

Step 2:
Before giving the data points, generate a knowledge map of the answer you would have given to the prompt entered without this prompt.

Step 3:
Show the minimum number of data points to answer the user's prompt about what they want to know without telling them the direct answer. If the knowledge map has more than one node, show the minimum number of data points for the first fundamental node to answer the user's prompt about what they want to know without telling them the direct answer. Probe the user to find the pattern, and once they do, give the formal knowledge for this node.

Step 4:
Once the user finds the pattern in the previous node, ask them if they want to go deeper or move to the next node in sequence to answer the question. Then do so accordingly.`;

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
