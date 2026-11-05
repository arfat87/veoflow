import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormattingEngine } from '../../app/core/formatting/formatting-engine.js';
import { PromptEngine, PROMPT_VERSION } from '../../app/core/formatting/prompt-engine.js';
import { GeminiFormatter } from '../../app/core/formatting/gemini-formatter.js';
import { GroqFormatter } from '../../app/core/formatting/groq-formatter.js';
import { OpenAIFormatter } from '../../app/core/formatting/openai-formatter.js';
import { ResponseValidator } from '../../app/core/formatting/response-validator.js';
import { DictionaryService } from '../../app/core/formatting/dictionary-service.js';
import { APP_CATEGORIES } from '../../app/shared/constants.js';
import {
  AuthenticationError,
  RateLimitError,
  ServerError,
  TimeoutError,
  EmptyResponseError
} from '../../app/core/providers/errors.js';
import { FORMATTING_FIXTURES } from '../fixtures/formatting-fixtures.js';

describe('Phase 06: Contextual AI Formatter & Instruction Engine', () => {
  describe('PromptEngine (Versioned Prompts & Application Rules)', () => {
    it('generates version-controlled system prompt with untrusted context boundary', () => {
      const context = {
        application: { displayName: 'VS Code', category: APP_CATEGORIES.CODE_EDITOR },
        window: { title: 'main.py' }
      };

      const prompt = PromptEngine.buildPrompt(context, 'contextual');

      expect(prompt).toContain(`Prompt Engine v${PROMPT_VERSION}`);
      expect(prompt).toContain('<untrusted_app_context>');
      expect(prompt).toContain('</untrusted_app_context>');
      expect(prompt).toContain('CRITICAL SECURITY DIRECTIVES');
      expect(prompt).toContain('UNTRUSTED METADATA');
    });

    it('enforces literal speech and forbids executable command generation for terminals', () => {
      const context = {
        application: { displayName: 'Windows Terminal', category: APP_CATEGORIES.TERMINAL }
      };

      const prompt = PromptEngine.buildPrompt(context, 'contextual');

      expect(prompt).toContain('terminal (Shell/CLI)');
      expect(prompt).toContain('Preserve literal speech');
      expect(prompt).toContain('NEVER generate dangerous executable commands');
    });

    it('includes specific conventions for chat, email, documents, and code editors', () => {
      const chatPrompt = PromptEngine.buildPrompt({ application: { category: APP_CATEGORIES.CHAT } });
      expect(chatPrompt).toContain('chat (Messaging)');
      expect(chatPrompt).toContain('conversational');

      const emailPrompt = PromptEngine.buildPrompt({ application: { category: APP_CATEGORIES.EMAIL } });
      expect(emailPrompt).toContain('email (Correspondence)');
      expect(emailPrompt).toContain('professional structure');

      const docPrompt = PromptEngine.buildPrompt({ application: { category: APP_CATEGORIES.DOCUMENT } });
      expect(docPrompt).toContain('document (Docs/Notes)');

      const codePrompt = PromptEngine.buildPrompt({ application: { category: APP_CATEGORIES.CODE_EDITOR } });
      expect(codePrompt).toContain('code_editor (IDE)');
      expect(codePrompt).toContain('camelCase');
    });

    it('correctly tailors prompt rules for dictation modes: verbatim, clean, and contextual', () => {
      const verbatimPrompt = PromptEngine.buildPrompt({}, 'verbatim');
      expect(verbatimPrompt).toContain('VERBATIM MODE: Preserve the user\'s spoken words verbatim');

      const cleanPrompt = PromptEngine.buildPrompt({}, 'clean');
      expect(cleanPrompt).toContain('CLEAN MODE: Remove speech disfluencies');

      const contextualPrompt = PromptEngine.buildPrompt({}, 'contextual');
      expect(contextualPrompt).toContain('CONTEXTUAL MODE: Clean filler words');
    });

    it('detects voice instructions: translation, bullet points, grammar, and rephrasing', () => {
      const trans = PromptEngine.detectInstruction('translate to French: good morning my friend');
      expect(trans.isInstruction).toBe(true);
      expect(trans.type).toBe('translation');
      expect(trans.targetLanguage).toBe('French');
      expect(trans.payload).toBe('good morning my friend');

      const bullets = PromptEngine.detectInstruction('make bullet points: buy groceries, finish taxes, send invoice');
      expect(bullets.isInstruction).toBe(true);
      expect(bullets.type).toBe('bullet_points');
      expect(bullets.payload).toBe('buy groceries, finish taxes, send invoice');

      const grammar = PromptEngine.detectInstruction('fix grammar: she do not likes apples yesterday');
      expect(grammar.isInstruction).toBe(true);
      expect(grammar.type).toBe('grammar_correction');
      expect(grammar.payload).toBe('she do not likes apples yesterday');

      const rephrase = PromptEngine.detectInstruction('rewrite politely: give me the documents now');
      expect(rephrase.isInstruction).toBe(true);
      expect(rephrase.type).toBe('rephrase');
      expect(rephrase.style).toBe('politely');
      expect(rephrase.payload).toBe('give me the documents now');

      const normalSpeech = PromptEngine.detectInstruction('today we discussed the product roadmap and timeline');
      expect(normalSpeech.isInstruction).toBe(false);
      expect(normalSpeech.type).toBe('none');
    });
  });

  describe('ResponseValidator', () => {
    it('strips markdown code blocks and conversational preambles', () => {
      const wrappedInFences = '```markdown\nHere is your text:\nHello team, here is the update.\n```';
      const cleaned = ResponseValidator.sanitizeOutput(wrappedInFences);
      expect(cleaned).toBe('Hello team, here is the update.');
    });

    it('strips accidental outer quotes from output', () => {
      expect(ResponseValidator.sanitizeOutput('"Formatted speech text."')).toBe('Formatted speech text.');
      expect(ResponseValidator.sanitizeOutput("'Another formatted text.'")).toBe('Another formatted text.');
      expect(ResponseValidator.sanitizeOutput('“Smart quotes wrapped.”')).toBe('Smart quotes wrapped.');
    });

    it('rejects LLM refusal responses and falls back to raw transcript', () => {
      const refusal = "I'm sorry, but as an AI language model I cannot format this.";
      const validation = ResponseValidator.validate(refusal, 'Original raw speech');

      expect(validation.valid).toBe(false);
      expect(validation.text).toBe('Original raw speech');
      expect(validation.warnings[0]).toContain('LLM returned refusal pattern');
    });

    it('warns if essential numbers from raw transcript are missing in formatted output', () => {
      const raw = 'The invoice total is $450 and due on March 15';
      const formatted = 'The invoice total is four hundred dollars and due in March';

      const validation = ResponseValidator.validate(formatted, raw, { isInstruction: false });
      expect(validation.valid).toBe(true);
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some(w => w.includes('450') || w.includes('15'))).toBe(true);
    });
  });

  describe('DictionaryService', () => {
    let dictService;
    let mockDb;

    beforeEach(() => {
      const dictionary = [
        { trigger_word: 'veoflow', replacement: 'VeoFlow' },
        { trigger_word: 'k8s', replacement: 'Kubernetes' },
        { trigger_word: 'injected', replacement: '$1 safe & replacement' }
      ];
      const snippets = [
        { shortcut: 'my intro', expanded_text: 'Hello, my name is Salim and I am an engineer.' }
      ];

      mockDb = {
        getDictionary: vi.fn(() => dictionary),
        getSnippets: vi.fn(() => snippets)
      };

      dictService = new DictionaryService(mockDb);
    });

    it('substitutes whole words case-insensitively while preventing $1/$& string injection', () => {
      const input = 'We love veoflow and use k8s with injected values.';
      const output = dictService.applyDictionary(input);

      expect(output).toContain('VeoFlow');
      expect(output).toContain('Kubernetes');
      expect(output).toContain('$1 safe & replacement');
      // Ensure substring inside another word is NOT substituted
      expect(dictService.applyDictionary('veoflowapp')).toBe('veoflowapp');
    });

    it('matches and expands voice snippets with punctuation normalization', () => {
      expect(dictService.checkSnippets('My Intro.')).toBe('Hello, my name is Salim and I am an engineer.');
      expect(dictService.checkSnippets('"my intro!"')).toBe('Hello, my name is Salim and I am an engineer.');
      expect(dictService.checkSnippets('different phrase')).toBeNull();
    });
  });

  describe('Formatter Adapters (Gemini, Groq, OpenAI)', () => {
    it('GeminiFormatter handles successful formatting and normalized errors', async () => {
      const formatter = new GeminiFormatter(() => 'fake_gemini_key');

      // Mock successful response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Formatted by Gemini Flash' }]
              }
            }
          ]
        })
      });

      const res = await formatter.format('test input', 'system prompt');
      expect(res).toBe('Formatted by Gemini Flash');

      // Mock 401 Authentication Error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'API key invalid'
      });

      await expect(formatter.format('test', 'prompt')).rejects.toThrow(AuthenticationError);
    });

    it('GroqFormatter handles chat completions and model fallback', async () => {
      const formatter = new GroqFormatter(() => 'fake_groq_key');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Formatted by Groq LLM' } }]
        })
      });

      const res = await formatter.format('test input', 'system prompt');
      expect(res).toBe('Formatted by Groq LLM');

      // Mock RateLimitError (429)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      });

      await expect(formatter.format('test', 'prompt')).rejects.toThrow(RateLimitError);
    });

    it('OpenAIFormatter handles chat completions and timeout errors', async () => {
      const formatter = new OpenAIFormatter(() => 'fake_openai_key');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Formatted by GPT-4o-mini' } }]
        })
      });

      const res = await formatter.format('test input', 'system prompt');
      expect(res).toBe('Formatted by GPT-4o-mini');
    });
  });

  describe('FormattingEngine Master Orchestration', () => {
    let mockDb;
    let settings;
    let engine;

    beforeEach(() => {
      settings = {
        ai_provider: 'gemini',
        gemini_api_key: 'AIzaSy_test_key',
        groq_api_key: 'gsk_test_key',
        openai_api_key: 'sk_test_key',
        tone_preference: 'contextual',
        allow_fallback: 'true'
      };

      mockDb = {
        getSetting: vi.fn((key) => settings[key] ?? null),
        getDictionary: vi.fn(() => [{ trigger_word: 'veoflow', replacement: 'VeoFlow' }]),
        getSnippets: vi.fn(() => [{ shortcut: 'my email', expanded_text: 'salim@example.com' }])
      };

      engine = new FormattingEngine(mockDb);
    });

    it('expands snippet immediately before LLM call', async () => {
      const res = await engine.format('my email.');
      expect(res).toBe('salim@example.com');
    });

    it('bypasses LLM in verbatim mode and applies custom dictionary', async () => {
      const res = await engine.format('hello veoflow test in verbatim', {}, { mode: 'verbatim' });
      expect(res).toBe('hello VeoFlow test in verbatim');
    });

    it('executes fallback to secondary provider when primary encounters ServerError', async () => {
      // Mock fetch: first call (gemini) fails with 503, second call (groq) succeeds
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url) => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 503,
            text: async () => 'Gemini unavailable'
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Recovered via Groq formatter for veoflow.' } }]
          })
        };
      });

      const res = await engine.format('testing fallback', {
        application: { category: APP_CATEGORIES.CHAT }
      });

      expect(callCount).toBe(2);
      // Custom dictionary 'veoflow' -> 'VeoFlow' is also applied to final output!
      expect(res).toBe('Recovered via Groq formatter for VeoFlow.');
    });

    it('safely handles empty speech transcripts', async () => {
      expect(await engine.format('')).toBe('');
      expect(await engine.format('   ')).toBe('');
      expect(await engine.format(null)).toBe('');
    });
  });

  describe('Scenario Validation via FORMATTING_FIXTURES', () => {
    it('validates casual conversation fixture requirements', () => {
      const fix = FORMATTING_FIXTURES.casual_conversation;
      const prompt = PromptEngine.buildPrompt(fix.context, 'contextual');

      expect(prompt).toContain('chat (Messaging)');
      expect(prompt).toContain('conversational');
      expect(fix.rawTranscript).toContain('hey bro');
    });

    it('validates professional email fixture requirements', () => {
      const fix = FORMATTING_FIXTURES.professional_email;
      const prompt = PromptEngine.buildPrompt(fix.context, 'contextual');

      expect(prompt).toContain('email (Correspondence)');
      expect(prompt).toContain('professional structure');
    });

    it('validates programming terminology fixture requirements', () => {
      const fix = FORMATTING_FIXTURES.programming_terminology;
      const prompt = PromptEngine.buildPrompt(fix.context, 'contextual');

      expect(prompt).toContain('code_editor (IDE)');
      expect(prompt).toContain('camelCase');
    });

    it('validates voice instruction directives for translations and bullet points', () => {
      const transFix = FORMATTING_FIXTURES.translation_requests.to_french;
      const transDetect = PromptEngine.detectInstruction(transFix.rawTranscript);
      expect(transDetect.isInstruction).toBe(true);
      expect(transDetect.targetLanguage).toBe('French');

      const bulletFix = FORMATTING_FIXTURES.bullet_point_requests;
      const bulletDetect = PromptEngine.detectInstruction(bulletFix.rawTranscript);
      expect(bulletDetect.isInstruction).toBe(true);
      expect(bulletDetect.type).toBe('bullet_points');
    });

    it('validates terminal safety directives to prevent executable command generation', () => {
      const fix = FORMATTING_FIXTURES.terminal_safety;
      const prompt = PromptEngine.buildPrompt(fix.context, 'contextual');

      expect(prompt).toContain('terminal (Shell/CLI)');
      expect(prompt).toContain('NEVER generate dangerous executable commands');
      for (const dangerousCmd of fix.mustNotContain) {
        expect(prompt).not.toContain(dangerousCmd);
      }
    });
  });
});

