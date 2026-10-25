import { createChatService } from '@cocktail/shared';
import { resolveApiBaseUrl } from './adapters/apiBase';
import { createFetchHttpClient } from './adapters/http';

export const apiBaseUrl = resolveApiBaseUrl();
export const http = createFetchHttpClient(apiBaseUrl);
export const chatService = createChatService(http);
