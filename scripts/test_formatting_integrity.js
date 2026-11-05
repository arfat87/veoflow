import assert from 'node:assert';
import { PromptEngine } from '../app/core/formatting/prompt-engine.js';
import { ResponseValidator } from '../app/core/formatting/response-validator.js';
import { DictionaryService } from '../app/core/formatting/dictionary-service.js';

console.log('[TEST] AI Formatting Engine & Prompt Integrity Verification...');

// 1. Verbatim Mode - Prompt Engine Directive Verification
const verbatimPrompt = PromptEngine.buildPrompt({
  application: { name: 'notepad.exe', displayName: 'Notepad', category: 'document' }
}, 'verbatim');
assert.ok(verbatimPrompt.includes('VERBATIM MODE'), 'System prompt must enforce VERBATIM MODE');
assert.ok(verbatimPrompt.includes('Do NOT rephrase, restructure, or remove words'), 'Verbatim mode must forbid rephrasing');

// 2. IDE / Code Editor Context Directives
const idePrompt = PromptEngine.buildPrompt({
  application: { name: 'Code.exe', displayName: 'Visual Studio Code', category: 'code_editor' }
}, 'contextual');
assert.ok(idePrompt.includes('code_editor'), 'System prompt must identify code_editor category');
assert.ok(idePrompt.includes('camelCase'), 'System prompt must instruct preserving camelCase / code syntax');

// 3. Response Validator - Fence Stripping & Clean Outputs
const rawLlmMarkdown = '```markdown\nHello world from dictation!\n```';
const cleaned = ResponseValidator.sanitizeOutput(rawLlmMarkdown);
assert.strictEqual(cleaned, 'Hello world from dictation!', 'Markdown fences must be stripped');

const rawQuotes = '"This is a quoted sentence."';
const strippedQuotes = ResponseValidator.sanitizeOutput(rawQuotes);
assert.strictEqual(strippedQuotes, 'This is a quoted sentence.', 'Enclosing quotes must be stripped');

// 4. Response Validator - Refusal Detection and Fallback to Raw
const refusalResult = ResponseValidator.validate("I cannot fulfill this request because of policy", "Original speech");
assert.strictEqual(refusalResult.valid, false, 'Refusal should be marked invalid');
assert.strictEqual(refusalResult.text, "Original speech", 'Refusal must fallback to raw transcript');

// 5. Dictionary Service - Whole-Word Matching & $1 / Money / Special Characters
const mockDictionary = [
  { trigger_word: 'veoflow', replacement: 'VeoFlow', match_whole_word: 1, case_sensitive: 0, is_enabled: 1 },
  { trigger_word: 'priceUSD', replacement: '$100.00', match_whole_word: 1, case_sensitive: 0, is_enabled: 1 },
  { trigger_word: 'k8s', replacement: 'Kubernetes', match_whole_word: 1, case_sensitive: 0, is_enabled: 1 }
];

const mockDb = {
  getDictionary: () => mockDictionary,
  getSnippets: () => [
    { shortcut: 'my calendly', expanded_text: 'https://calendly.com/user/30min' },
    { shortcut: 'shrug', expanded_text: '¯\\_(ツ)_/¯' }
  ]
};

const dictService = new DictionaryService(mockDb);

const testInput = 'i use veoflow for priceUSD and k8s cluster deployments';
const substituted = dictService.applyDictionary(testInput);
console.log('Dictionary Substituted Output:', substituted);

assert.strictEqual(substituted, 'i use VeoFlow for $100.00 and Kubernetes cluster deployments');

// 6. Snippet Expansion with Trailing Punctuation Normalization
assert.strictEqual(dictService.checkSnippets('my calendly'), 'https://calendly.com/user/30min');
assert.strictEqual(dictService.checkSnippets('my calendly.'), 'https://calendly.com/user/30min');
assert.strictEqual(dictService.checkSnippets('"my calendly"'), 'https://calendly.com/user/30min');
assert.strictEqual(dictService.checkSnippets('shrug'), '¯\\_(ツ)_/¯');

// 7. Hinglish / Multi-lingual Transcript Safety
const hinglishText = 'aaj shaam ko meeting schedule kar do at 5pm';
const validatedHinglish = ResponseValidator.validate(hinglishText, hinglishText);
assert.strictEqual(validatedHinglish.valid, true);

console.log('[PASS] AI Formatter, Prompt Engine, Response Validator & Snippets Verified 100%');
