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
For example, consider the following example response to a prompt-
Input prompt-  What is a bond in investment
AI response-
A bond in investing is essentially a loan you give to a government, company, or organization in exchange for regular interest payments and the return of your money later.

📌 Simple idea

When you buy a bond, you are:

Lending money to an issuer (like a government or company)
Getting paid interest (called a coupon) periodically
Receiving your original amount (principal) back at a fixed future date
🧠 Example

Imagine you buy a ₹10,000 government bond:

Interest rate: 7% per year
Duration: 5 years

You'll receive:

₹700 every year (interest)
₹10,000 back after 5 years
🔑 Key parts of a bond
Face value (Principal): The amount you invest (e.g., ₹10,000)
Coupon rate: The interest rate paid (e.g., 7%)
Maturity date: When your money is returned
Issuer: The borrower (government, company, etc.)
🏛️ Types of bonds
Government bonds – Issued by countries (generally safer)
Corporate bonds – Issued by companies (higher risk, higher return)
Municipal bonds – Issued by local governments
Zero-coupon bonds – No regular interest, but sold at a discount
⚖️ Why investors buy bonds
Steady, predictable income
Lower risk compared to stocks
Helps balance a portfolio
⚠️ Risks to know
Interest rate risk: Bond prices fall when interest rates rise
Credit risk: Issuer may fail to pay
Inflation risk: Your returns may lose purchasing power
📊 Bonds vs Stocks (quick contrast)
Bonds: Safer, fixed income, lower returns
Stocks: Riskier, ownership in a company, higher potential returns

If you want, I can explain how to buy bonds in India or whether bonds are a good fit for your situation.

Knowledge Map-
The response consists of different types of knowledge. So the map needs nodes of different types:
For example, for the prompt "What is a bond in investment", the knowledge map would be:
bond
├── concept: loan, interest
├── parts: face value, coupon rate, maturity
├── types: government, corporate, municipal
├── example: ₹10,000 at 7% for 5 years
├── compare: bonds vs stocks
├── why: steady income, lower risk, balance
├── risks: interest rate, credit, inflation
└── action: how to actually buy one


Each node type gets taught differently:
For example-
Concepts → scaffold with questions
Examples → walk through with numbers, ask the learner to calculate
Comparisons → ask the learner to guess differences first
Why/reasons → ask "why would someone do this?" before revealing
Actions → only if the learner's goal requires it
So the map isn't just a concept map. It's a knowledge map — covering everything a good explanation would cover.

PHASE 4 -
Show the minimum number of data points to answer the user's prompt about what they want to know without telling them the direct answer. If the knowledge map has more than one node, show the minimum number of data points for the first fundamental node to answer the user's prompt about what they want to know without telling them the direct answer. Then probe them to find the pattern without giving the direct answer unless they explicitly ask for it.

PHASE 5 -
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
