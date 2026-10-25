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
      await http.postSse(
        API_PATHS.aiChatStream,
        {
          session_id: payload.sessionId,
          message: payload.message,
        },
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
