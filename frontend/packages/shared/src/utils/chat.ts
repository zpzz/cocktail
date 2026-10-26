import type { ChatEvent, ChatImageItem, ChatSourceItem } from '../types/api';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  status?: string;
  sources?: ChatSourceItem[];
  sourceRole?: string;
  images?: ChatImageItem[];
  generatedImageUrl?: string;
  imageError?: string;
  imageLoading?: boolean;
  interruptQuestion?: string;
  interruptOptions?: string[];
  error?: string;
};

export function createChatMessage(
  role: ChatRole,
  text: string,
  id = `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
): ChatMessage {
  return { id, role, text };
}

export function intentStatus(event: Extract<ChatEvent, { type: 'intent' }>): string {
  if (event.mode === 'customize' || event.value === 'customize') {
    return '按你的口味定制特调…';
  }
  if (event.mode === 'chitchat' || event.value === 'chitchat') {
    return '随便聊聊…';
  }
  if (event.value === 'library' || event.mode === 'library') {
    return '正在对照配方库…';
  }
  return '正在理解问题…';
}

function mapSource(raw: Record<string, unknown>): ChatSourceItem {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    nameEn: raw.name_en ? String(raw.name_en) : undefined,
    source: String(raw.source ?? ''),
    score: Number(raw.score ?? 0),
    imageUrl: raw.image_url ? String(raw.image_url) : undefined,
    glass: raw.glass ? String(raw.glass) : undefined,
    method: raw.method ? String(raw.method) : undefined,
  };
}

function mapImage(raw: Record<string, unknown>): ChatImageItem {
  return {
    url: String(raw.url ?? ''),
    alt: raw.alt ? String(raw.alt) : undefined,
    recipeId: raw.recipe_id != null ? Number(raw.recipe_id) : undefined,
  };
}

export function parseChatEvent(raw: unknown): ChatEvent | null {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) {
    return null;
  }
  const event = raw as Record<string, unknown>;
  const type = String(event.type);
  switch (type) {
    case 'intent':
      return { type, value: String(event.value ?? ''), mode: String(event.mode ?? '') };
    case 'mode':
      return { type, value: String(event.value ?? '') };
    case 'sources': {
      const items = Array.isArray(event.items)
        ? event.items.map((item) => mapSource((item ?? {}) as Record<string, unknown>))
        : [];
      return { type, role: String(event.role ?? 'library'), items };
    }
    case 'images': {
      const items = Array.isArray(event.items)
        ? event.items
            .map((item) => mapImage((item ?? {}) as Record<string, unknown>))
            .filter((item) => item.url)
        : [];
      return { type, items };
    }
    case 'status':
      return { type, text: String(event.text ?? '') };
    case 'image_loading':
      return { type, text: event.text ? String(event.text) : undefined };
    case 'image':
      return {
        type,
        url: String(event.url ?? ''),
        alt: event.alt ? String(event.alt) : undefined,
        kind: event.kind ? String(event.kind) : undefined,
      };
    case 'image_error':
      return { type, message: String(event.message ?? '配图未生成') };
    case 'token':
      return { type, text: String(event.text ?? event.content ?? '') };
    case 'interrupt': {
      const options = Array.isArray(event.options)
        ? event.options.map((item) => String(item))
        : [];
      return {
        type,
        question: String(event.question ?? ''),
        options,
      };
    }
    case 'error':
      return { type, message: String(event.message ?? '对话失败') };
    case 'done':
      return { type };
    default:
      return null;
  }
}

export function applyChatEvent(message: ChatMessage, event: ChatEvent): ChatMessage {
  switch (event.type) {
    case 'intent':
      return { ...message, status: intentStatus(event) };
    case 'mode':
      return event.value === 'clarify'
        ? { ...message, status: '想先确认基酒和做法…' }
        : message;
    case 'sources':
      return { ...message, sources: event.items, sourceRole: event.role };
    case 'images':
      return { ...message, images: event.items };
    case 'status':
      return message.text ? message : { ...message, status: event.text };
    case 'image_loading':
      return {
        ...message,
        imageLoading: true,
        status: event.text ?? '正在生成特调配图…',
      };
    case 'image':
      return {
        ...message,
        imageLoading: false,
        generatedImageUrl: event.url,
        imageError: undefined,
      };
    case 'image_error':
      return { ...message, imageLoading: false, imageError: event.message };
    case 'token':
      return {
        ...message,
        text: `${message.text}${event.text}`,
        status: undefined,
      };
    case 'interrupt':
      return {
        ...message,
        status: undefined,
        interruptQuestion: event.question,
        interruptOptions: event.options,
        text: message.text || event.question,
      };
    case 'error':
      return { ...message, error: event.message, status: undefined };
    case 'done':
      return { ...message, status: undefined, imageLoading: false };
    default:
      return message;
  }
}
