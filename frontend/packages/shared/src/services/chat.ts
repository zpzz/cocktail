import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type { ChatEvent, ChatStreamRequest } from '../types/api';
import { applyChatEvent, createChatMessage, parseChatEvent } from '../utils/chat';
import type { ChatMessage } from '../utils/chat';

export function createChatService(http: HttpClient) {
  return {
    async stream(
      payload: ChatStreamRequest,
      onEvent: (event: ChatEvent) => void,
      signal?: AbortSignal,
    ) {
      const path = payload.resume ? API_PATHS.chatResume : API_PATHS.chat;
      const body = payload.resume
        ? {
            threadId: payload.threadId,
            userInput: payload.message,
          }
        : {
            threadId: payload.threadId,
            userInput: payload.message,
            attachCabinet: payload.attachCabinet ?? true,
            context: { mode: 'home' },
          };

      await http.postSse(
        path,
        body,
        (raw) => {
          const event = parseChatEvent(raw);
          if (event) {
            onEvent(event);
          }
        },
        { signal },
      );
    },
  };
}

export function reduceAssistantMessage(
  message: ChatMessage,
  event: ChatEvent,
): ChatMessage {
  return applyChatEvent(message, event);
}

export { createChatMessage };
export type { ChatMessage };
