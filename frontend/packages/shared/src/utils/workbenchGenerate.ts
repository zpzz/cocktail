import type { WorkbenchRecipe } from '../types/api';

export type WorkbenchGenerateEvent =
  | { kind: 'token'; text: string }
  | { kind: 'recipe'; recipe: WorkbenchRecipe }
  | { kind: 'image_loading'; text: string }
  | { kind: 'image'; url: string }
  | { kind: 'image_error'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' };

/** 解析工作台 generate SSE 事件（与 AI 服务约定对齐） */
export function parseWorkbenchGenerateEvent(raw: unknown): WorkbenchGenerateEvent {
  const event = (raw ?? {}) as Record<string, unknown>;
  const type = String(event.type || '');
  if (type === 'token' && typeof event.text === 'string') {
    return { kind: 'token', text: event.text.trim() || '生成中…' };
  }
  if (type === 'recipe' && event.recipe && typeof event.recipe === 'object') {
    return { kind: 'recipe', recipe: event.recipe as WorkbenchRecipe };
  }
  if (type === 'image_loading') {
    return { kind: 'image_loading', text: String(event.text || '正在生成配图…') };
  }
  if (type === 'image' && typeof event.url === 'string') {
    return { kind: 'image', url: event.url };
  }
  if (type === 'image_error') {
    return { kind: 'image_error', message: String(event.message || '配图失败，仍可查看配方') };
  }
  if (type === 'error') {
    return { kind: 'error', message: String(event.message || '生成失败') };
  }
  return { kind: 'ignore' };
}
