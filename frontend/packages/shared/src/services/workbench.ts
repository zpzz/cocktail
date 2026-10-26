import { API_PATHS } from '../constants/api';
import type { HttpClient } from '../http/client';
import type {
  WorkbenchAnalyze,
  WorkbenchGlass,
  WorkbenchOptions,
  WorkbenchSession,
  WorkbenchSessionPatch,
} from '../types/api';

export function createWorkbenchService(http: HttpClient) {
  return {
    glasses() {
      return http.get<{ items: WorkbenchGlass[] }>(API_PATHS.workbenchGlasses);
    },
    options() {
      return http.get<WorkbenchOptions>(API_PATHS.workbenchOptions);
    },
    createSession() {
      return http.post<WorkbenchSession>(API_PATHS.workbenchSessions);
    },
    getSession(sessionId: string) {
      return http.get<WorkbenchSession>(`${API_PATHS.workbenchSessions}/${sessionId}`);
    },
    patchSession(sessionId: string, body: WorkbenchSessionPatch) {
      return http.patch<WorkbenchSession>(
        `${API_PATHS.workbenchSessions}/${sessionId}`,
        body,
      );
    },
    resetSession(sessionId: string, keepGlass = true) {
      return http.post<WorkbenchSession>(
        `${API_PATHS.workbenchSessions}/${sessionId}/reset`,
        { keepGlass },
      );
    },
    analyze(sessionId: string) {
      return http.post<WorkbenchAnalyze>(
        `${API_PATHS.workbenchSessions}/${sessionId}/analyze`,
      );
    },
    generate(
      sessionId: string,
      onEvent: (event: unknown) => void,
      feeling?: string,
      signal?: AbortSignal,
    ) {
      return http.postSse(
        `${API_PATHS.workbenchSessions}/${sessionId}/generate`,
        feeling ? { feeling } : {},
        onEvent,
        { signal },
      );
    },
  };
}
