import {
  CHAT_WELCOME_TEXT,
  createChatMessage,
  createThreadId,
  reduceAssistantMessage,
  type ChatMessage,
} from '@cocktail/shared';
import { resolveMediaUrl } from '../../adapters/apiBase';
import { chatService } from '../../api';
import { requireAuth } from '../../utils/nav';

type UiMessage = ChatMessage & {
  resolvedGenUrl?: string;
  images?: Array<{ url?: string; resolvedUrl?: string }>;
};

function enrich(msg: ChatMessage): UiMessage {
  return {
    ...msg,
    resolvedGenUrl: msg.generatedImageUrl
      ? resolveMediaUrl(msg.generatedImageUrl)
      : undefined,
    images: (msg.images ?? []).map((img) => ({
      ...img,
      resolvedUrl: img.url ? resolveMediaUrl(img.url) : undefined,
    })),
  };
}

const WELCOME = enrich({
  id: 'welcome',
  role: 'assistant',
  text: CHAT_WELCOME_TEXT,
});

Page({
  data: {
    logoUrl: '/assets/images/jiufang-logo.png',
    messages: [WELCOME] as UiMessage[],
    draft: '',
    sending: false,
    canSend: false,
    scrollInto: '',
  },

  threadId: '' as string,

  onLoad() {
    this.threadId = createThreadId();
  },

  onDraft(e: WechatMiniprogram.Input) {
    const draft = e.detail.value;
    this.setData({
      draft,
      canSend: Boolean(draft.trim()) && !this.data.sending,
    });
  },

  scrollToEnd(id: string) {
    this.setData({ scrollInto: `m-${id}` });
  },

  async send() {
    const message = this.data.draft.trim();
    if (!message || this.data.sending) {
      return;
    }
    if (!(await requireAuth())) {
      return;
    }
    const userMessage = enrich(createChatMessage('user', message));
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage = enrich(createChatMessage('assistant', '', assistantId));
    assistantMessage.status = '正在检索配方…';

    this.setData({
      draft: '',
      sending: true,
      canSend: false,
      messages: [...this.data.messages, userMessage, assistantMessage],
    });
    this.scrollToEnd(assistantId);

    try {
      await chatService.stream(
        {
          threadId: this.threadId,
          message,
          attachCabinet: true,
        },
        (event) => {
          if (event.type === 'error') {
            throw new Error(event.message);
          }
          const next = this.data.messages.map((item) =>
            item.id === assistantId
              ? enrich(reduceAssistantMessage(item, event))
              : item,
          );
          this.setData({ messages: next });
          this.scrollToEnd(assistantId);
        },
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : '对话失败';
      const next = this.data.messages.map((item) =>
        item.id === assistantId
          ? { ...item, error: text, status: undefined, imageLoading: false }
          : item,
      );
      this.setData({ messages: next });
    } finally {
      this.setData({
        sending: false,
        canSend: Boolean(this.data.draft.trim()),
      });
    }
  },
});
