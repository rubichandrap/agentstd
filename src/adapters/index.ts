import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { commandCodeAdapter } from './commandcode';
import { geminiAdapter } from './gemini';
import { openCodeAdapter } from './opencode';

export const adapters = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  commandcode: commandCodeAdapter,
  opencode: openCodeAdapter,
};

export type AdapterId = keyof typeof adapters;

export function getAdapter(id: string) {
  return adapters[id as AdapterId];
}

export function listAdapters() {
  return Object.values(adapters);
}
