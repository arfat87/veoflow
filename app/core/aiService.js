/**
 * VeoFlow AIService (ESM)
 * Handles STT audio transcription and LLM contextual formatting with fallback logic.
 */
import defaultDb from '../database/database.js';
import { TranscriptionEngine } from './transcription/transcription-engine.js';
import { FormattingEngine } from './formatting/formatting-engine.js';
import { PromptEngine } from './formatting/prompt-engine.js';
import { DEFAULT_MODELS } from '../shared/constants.js';

export class AIService {
  constructor(databaseInstance = null) {
    this.db = databaseInstance || defaultDb;
    this.geminiModel = DEFAULT_MODELS.GEMINI_LLM;
    this.transcriptionEngine = new TranscriptionEngine(this.db);
    this.formattingEngine = new FormattingEngine(this.db);
  }

  // 1. Audio Transcription (Speech-to-Text) with Automatic Provider Fallback
  async transcribeAudio(audioBuffer, mimeType = 'audio/webm', options = {}) {
    const res = await this.transcriptionEngine.transcribe(audioBuffer, { mimeType, ...options });
    return res.rawText;
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
  async formatTranscription(rawAsr, context = {}, options = {}) {
    return this.formattingEngine.format(rawAsr, context, options);
  }

  buildFormattingSystemPrompt(context = {}, tonePref = 'contextual') {
    return PromptEngine.buildPrompt(context, tonePref);
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
    return this.formattingEngine.dictionaryService.checkSnippets(text);
  }

  // Custom Dictionary replacements: safe from $1/$& replacement string injection
  applyDictionary(text) {
    return this.formattingEngine.dictionaryService.applyDictionary(text);
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

const defaultInstance = new AIService();
export default defaultInstance;

