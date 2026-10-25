export const API_PREFIX = '/api';
export const AI_API_PREFIX = '/api/ai';

export const API_PATHS = {
  aiChatStream: `${AI_API_PREFIX}/chat/stream`,
  cabinet: `${API_PREFIX}/cabinet`,
  authLogin: `${API_PREFIX}/auth/login`,
  authRefresh: `${API_PREFIX}/auth/refresh`,
} as const;
