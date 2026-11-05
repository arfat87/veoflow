import { z } from 'zod';

export const SettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string()
});
export const SettingPayloadSchema = SettingSchema;

export const DictionaryWordSchema = z.object({
  trigger: z.string().min(1).max(200),
  rep: z.string().min(1).max(1000)
});

export const SnippetSchema = z.object({
  shortcut: z.string().min(1).max(100),
  text: z.string().min(1).max(10000)
});

export const AppRuleSchema = z.object({
  processName: z.string().min(1).max(200),
  category: z.string().min(1).max(100).default('unknown'),
  tone: z.string().min(1).max(50).default('contextual')
});

export const SubmitAudioSchema = z.object({
  audioData: z.union([
    z.instanceof(Uint8Array),
    z.instanceof(Buffer),
    z.array(z.number())
  ]),
  mimeType: z.string().min(1)
});
export const AudioPayloadSchema = SubmitAudioSchema;

export const WindowContextSchema = z.object({
  appName: z.string().default('Unknown'),
  windowTitle: z.string().default(''),
  url: z.string().default(''),
  textbox: z.object({
    contents: z.string().default(''),
    beforeText: z.string().default(''),
    selectedText: z.string().default(''),
    afterText: z.string().default('')
  }).default({})
});

export function validateIPC(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorMsg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`IPC validation failure: ${errorMsg}`);
  }
  return result.data;
}
