/**
 * VeoFlow AIService (ESM)
 * Handles STT audio transcription and LLM contextual formatting with fallback logic.
 */
import defaultDb from '../database/database.js';

export class AIService {
  constructor(databaseInstance = null) {
    this.db = databaseInstance || defaultDb;
    this.geminiModel = 'gemini-2.5-flash';
  }

  // 1. Audio Transcription (Speech-to-Text) with Automatic Provider Fallback
  async transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
    const provider = this.db.getSetting('ai_provider') || 'gemini';
    const geminiKey = this.db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
    const groqKey = this.db.getSetting('groq_api_key') || process.env.GROQ_API_KEY;
    const openaiKey = this.db.getSetting('openai_api_key') || process.env.OPENAI_API_KEY;

    const providersToTry = [];
    if (provider === 'groq' && groqKey) providersToTry.push({ name: 'groq', fn: () => this.transcribeWithGroq(audioBuffer, groqKey, mimeType) });
    else if (provider === 'openai' && openaiKey) providersToTry.push({ name: 'openai', fn: () => this.transcribeWithOpenAI(audioBuffer, openaiKey, mimeType) });
    else if (provider === 'gemini' && geminiKey) providersToTry.push({ name: 'gemini', fn: () => this.transcribeWithGemini(audioBuffer, geminiKey, mimeType) });

    // Fallbacks
    if (groqKey && provider !== 'groq') providersToTry.push({ name: 'groq', fn: () => this.transcribeWithGroq(audioBuffer, groqKey, mimeType) });
    if (geminiKey && provider !== 'gemini') providersToTry.push({ name: 'gemini', fn: () => this.transcribeWithGemini(audioBuffer, geminiKey, mimeType) });
    if (openaiKey && provider !== 'openai') providersToTry.push({ name: 'openai', fn: () => this.transcribeWithOpenAI(audioBuffer, openaiKey, mimeType) });

    if (providersToTry.length === 0) {
      throw new Error('No API Key configured. Please enter a Gemini, Groq, or OpenAI API key in VeoFlow Settings.');
    }

    let lastError = null;
    for (const p of providersToTry) {
      try {
        const text = await p.fn();
        if (text && text.trim()) return text.trim();
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('All transcription providers failed');
  }

  // Gemini Multimodal Audio Transcription
  async transcribeWithGemini(audioBuffer, apiKey, mimeType) {
    const base64Audio = audioBuffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType.split(';')[0],
                data: base64Audio
              }
            },
            {
              text: 'Transcribe this spoken audio exactly as spoken. Output ONLY the transcription text with appropriate punctuation and capitalization. Do not output preamble, markdown formatting, or explanations.'
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini ASR error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const textParts = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
    if (!textParts) {
      throw new Error('Gemini returned an empty transcription.');
    }
    return textParts;
  }

  // Groq Whisper Transcription (<300ms ultra low latency)
  async transcribeWithGroq(audioBuffer, apiKey, mimeType) {
    const ext = mimeType.includes('wav') ? 'wav' : 'webm';
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq Whisper error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return (data.text || '').trim();
  }

  // OpenAI Whisper Transcription
  async transcribeWithOpenAI(audioBuffer, apiKey, mimeType) {
    const ext = mimeType.includes('wav') ? 'wav' : 'webm';
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Whisper error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return (data.text || '').trim();
  }

  // 2. Context-Aware LLM Formatter & Tone Matcher
  async formatTranscription(rawAsr, context = {}) {
    if (!rawAsr || !rawAsr.trim()) return '';

    // First check custom snippets
    const snippetExpanded = this.checkSnippets(rawAsr);
    if (snippetExpanded) return snippetExpanded;

    const tonePref = this.db.getSetting('tone_preference') || 'contextual';
    if (tonePref === 'verbatim') {
      return this.applyDictionary(rawAsr);
    }

    const provider = this.db.getSetting('ai_provider') || 'gemini';
    const geminiKey = this.db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
    const groqKey = this.db.getSetting('groq_api_key') || process.env.GROQ_API_KEY;
    const openaiKey = this.db.getSetting('openai_api_key') || process.env.OPENAI_API_KEY;

    if (!geminiKey && !groqKey && !openaiKey) {
      return this.applyDictionary(rawAsr);
    }

    const systemPrompt = this.buildFormattingSystemPrompt(context, tonePref);

    try {
      let formatted = '';
      if (provider === 'groq' && groqKey) {
        formatted = await this.formatWithGroqLLM(rawAsr, systemPrompt, groqKey);
      } else if (provider === 'openai' && openaiKey) {
        formatted = await this.formatWithOpenAI(rawAsr, systemPrompt, openaiKey);
      } else if (geminiKey) {
        formatted = await this.formatWithGemini(rawAsr, systemPrompt, geminiKey);
      } else if (groqKey) {
        formatted = await this.formatWithGroqLLM(rawAsr, systemPrompt, groqKey);
      } else if (openaiKey) {
        formatted = await this.formatWithOpenAI(rawAsr, systemPrompt, openaiKey);
      }

      return this.applyDictionary(formatted || rawAsr);
    } catch (err) {
      try {
        if (geminiKey && provider !== 'gemini') {
          return this.applyDictionary(await this.formatWithGemini(rawAsr, systemPrompt, geminiKey));
        } else if (groqKey && provider !== 'groq') {
          return this.applyDictionary(await this.formatWithGroqLLM(rawAsr, systemPrompt, groqKey));
        }
      } catch (fallbackErr) {
        // Fallback suppressed
      }
      return this.applyDictionary(rawAsr);
    }
  }

  buildFormattingSystemPrompt(context, tonePref) {
    const app = context.appName || 'Unknown';
    const title = context.windowTitle || '';
    const url = context.url || '';
    const textbox = context.textbox || {};
    const surrounding = textbox.contents || '';

    return `You are VeoFlow, an elite real-time voice typing and text injection engine.
Your task is to take the user's raw spoken speech and format it seamlessly for direct pasting into their active computer application.

TARGET APPLICATION CONTEXT:
- Application: "${app}"
- Window Title: "${title}"
${url ? `- Active URL: "${url}"` : ''}
${surrounding ? `- Surrounding Text in Textbox: "${surrounding.slice(-200)}"` : ''}
- Tone Preference: ${tonePref}

RULES:
1. CONTEXTUAL AWARENESS:
   - If in an IDE / code editor (e.g. Code.exe, Cursor, Visual Studio): Match programming conventions. If the user dictates code or identifiers, format as clean syntax or appropriate casing (camelCase, snake_case).
   - If in a Chat / Messaging app (e.g. Slack, Teams, Discord, WhatsApp): Format casually with natural punctuation and friendly tone.
   - If in an Email / Document app (e.g. Outlook, Word, Gmail, Notion): Format with polished professional structure, paragraph breaks, and proper capitalization.
2. INSTRUCTION / SHORTCUT RECOGNITION:
   - If the user speaks an explicit directive (e.g. "translate this to French: ...", "fix grammar: ...", "make bullet points from: ...", "rephrase politely: ..."), execute the instruction and return the processed result!
3. CLEANLINESS:
   - Eliminate filler words ("um", "uh", "you know", "like") unless critical to meaning.
   - Fix repeated stuttered words.
4. OUTPUT RESTRICTIONS:
   - Return ONLY the exact text to paste.
   - Do NOT include quotes around the text, explanations, headers, greetings, or commentary.`;
  }

  async formatWithGemini(rawText, systemPrompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${apiKey}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: rawText }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini format error: ${err}`);
    }

    const json = await res.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
    return text || rawText;
  }

  async formatWithGroqLLM(rawText, systemPrompt, apiKey) {
    const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: rawText }
            ],
            temperature: 0.2,
            max_tokens: 1024,
            include_reasoning: false
          })
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Groq LLM error (${model}): ${err}`);
        }

        const json = await res.json();
        let content = json.choices?.[0]?.message?.content?.trim();
        if (content) {
          content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          return content;
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('All Groq models failed');
  }

  async formatWithOpenAI(rawText, systemPrompt, apiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText }
        ],
        temperature: 0.2,
        max_tokens: 1024
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI format error: ${err}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || rawText;
  }

  // Snippets: Robust matching with punctuation and quote normalization
  checkSnippets(text) {
    if (!text) return null;
    const clean = text.trim().toLowerCase()
      .replace(/^["']|["']$/g, '')
      .replace(/[.,!?;:]+$/, '')
      .trim();

    const snippets = this.db.getSnippets();
    for (const s of snippets) {
      const shortcutClean = s.shortcut.toLowerCase()
        .replace(/^["']|["']$/g, '')
        .replace(/[.,!?;:]+$/, '')
        .trim();
      if (clean === shortcutClean) {
        return s.expanded_text;
      }
    }
    return null;
  }

  // Custom Dictionary replacements: safe from $1/$& replacement string injection
  applyDictionary(text) {
    if (!text) return '';
    let result = text;
    const dictionary = this.db.getDictionary();
    for (const d of dictionary) {
      if (!d.trigger_word) continue;
      const escaped = this.escapeRegex(d.trigger_word);
      const isWord = /^\w+$/.test(d.trigger_word);
      if (isWord) {
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        result = result.replace(regex, () => d.replacement);
      } else {
        const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|[.,!?;:]|$)`, 'gi');
        result = result.replace(regex, (match, prefix) => (prefix || '') + d.replacement);
      }
    }
    return result;
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

const defaultInstance = new AIService();
export default defaultInstance;

