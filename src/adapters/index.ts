import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';

export const adapters = {
  claude: claudeAdapter,
  codex: codexAdapter,
};

export type AdapterId = keyof typeof adapters;

export function getAdapter(id: string) {
  return adapters[id as AdapterId];
}

export function listAdapters() {
  return Object.values(adapters);
}
