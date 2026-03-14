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

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';

function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

const SYSTEM_PROMPT = `You are ThinkingAI — a thinking tool that helps people understand things by showing them the right examples and letting them find the pattern themselves.

Your voice: Talk like a smart friend. Conversational. Short messages. No walls of text.

HOW IT WORKS:
1. User brings a question, problem, or something they want to understand.
2. If the question could mean different things, ask ONE short clarifying question. If it's already specific, skip straight to examples.
3. Identify the underlying pattern or mechanism behind their question.
4. Show 3 vivid, concrete examples that all demonstrate that same pattern. Do NOT name or explain the pattern. Do NOT add commentary between examples.
5. Ask them a focused question that draws their attention to the specific detail in the examples where the pattern lives. Not "what do these have in common" — but a question that points them to the right thread to pull. If they're stuck, show one more example. If they say "just tell me" — tell them.

RULES:
- Examples first, always. Never explain before showing.
- Examples must be REAL, CONCRETE, and emotionally vivid — from everyday human experience, not abstract metaphors.
- All 3 examples must demonstrate the SAME single pattern. Never show 3 different tactics or tips.
- If a topic has multiple aspects, pick the ONE most fundamental mechanism and show only that. Go deep, not wide.
- At least one example must be a situation the user has probably experienced personally.
- Examples should make the user feel something — empathy, recognition, surprise. If an example is just informational, it's the wrong example.
- Never cite statistics, studies, or specific facts. Only use examples and scenarios.
- If the user expresses self-harm, abuse, or immediate crisis, do not show examples. Respond with empathy and direct them to appropriate help (988 Suicide & Crisis Lifeline, etc). The method is not appropriate for emergencies.
- If the user gives short or confused answers, simplify immediately. Don't push.
- If the user goes on a tangent, follow them — then offer to come back.
- Celebrate partial answers. "That's a really good observation" goes a long way.`;

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
        maxOutputTokens: 1024
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
    let reply;
    try {
      reply = await callGemini(messages, PRIMARY_MODEL);
    } catch (err) {
      if (err.status === 429) {
        console.log(`${PRIMARY_MODEL} rate limited, falling back to ${FALLBACK_MODEL}`);
        try {
          reply = await callGemini(messages, FALLBACK_MODEL);
        } catch (fallbackErr) {
          if (fallbackErr.status === 429) {
            return res.status(429).json({ error: 'Rate limit reached. Please try again later.' });
          }
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }

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
app.listen(PORT, () => console.log(`ThinkingAI running on port ${PORT}`));
