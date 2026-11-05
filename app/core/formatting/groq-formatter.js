/**
 * VeoFlow Groq LLM Formatter (ESM)
 * High-speed LLM formatting via Groq Chat Completions endpoint.
 */
import { BaseFormatter } from './base-formatter.js';
import { PROVIDERS } from '../../shared/constants.js';
import {
  AuthenticationError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  EmptyResponseError
} from '../providers/errors.js';

export class GroqFormatter extends BaseFormatter {
  constructor(apiKeyGetter, defaultModel = 'qwen/qwen3.8-27b') {
    super(PROVIDERS.GROQ);
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => apiKeyGetter;
    this.defaultModel = defaultModel;
  }

  getApiKey() {
    const key = this.apiKeyGetter();
    return (key || process.env.GROQ_API_KEY || '').trim();
  }

  async format(rawText, systemPrompt, options = {}) {
    const apiKey = options.apiKey || this.getApiKey();
    if (!apiKey) {
      throw new AuthenticationError('Groq API key is not configured.', this.name, 401);
    }

    const modelsToTry = options.model
      ? [options.model]
      : [this.defaultModel, 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];

    const timeoutMs = options.timeoutMs || 10000;
    let lastError = null;

    for (const model of modelsToTry) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: rawText }
            ],
            temperature: options.temperature ?? 0.2,
            max_tokens: options.maxOutputTokens ?? 2048
          }),
          signal: options.signal || controller.signal
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 401 || res.status === 403) {
            throw new AuthenticationError(`Groq auth error: ${errText}`, this.name, res.status);
          } else if (res.status === 429) {
            throw new RateLimitError(`Groq rate limit: ${errText}`, this.name, res.status);
          } else if (res.status === 404 || errText.includes('model_not_found') || errText.includes('decommissioned')) {
            // Model unavailable, try fallback model in loop
            lastError = new ServerError(`Groq model ${model} unavailable: ${errText}`, this.name, res.status);
            continue;
          } else if (res.status >= 500) {
            lastError = new ServerError(`Groq server error: ${errText}`, this.name, res.status);
            continue;
          }
          throw new ServerError(`Groq error (${res.status}): ${errText}`, this.name, res.status);
        }

        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || '').trim();

        if (!text) {
          throw new EmptyResponseError('Groq returned empty text.', this.name);
        }

        return text;
      } catch (err) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          throw new TimeoutError(`Groq formatting timed out after ${timeoutMs}ms`, this.name);
        }
        if (err instanceof AuthenticationError || err instanceof RateLimitError) {
          throw err;
        }
        lastError = err;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastError instanceof ServerError ||
        lastError instanceof EmptyResponseError ||
        lastError instanceof TimeoutError) {
      throw lastError;
    }

    throw new NetworkError(`Groq formatting error: ${lastError?.message || 'All models failed'}`, this.name, lastError);
  }

  async testConnection(apiKey) {
    const key = apiKey || this.getApiKey();
    if (!key) return false;
    try {
      const res = await this.format('PING', 'Respond with PONG', { apiKey: key, timeoutMs: 5000 });
      return !!res;
    } catch {
      return false;
    }
  }
}

export default GroqFormatter;

