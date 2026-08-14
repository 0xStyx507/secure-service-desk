import type { Notification, Paginated } from '../../types';
import { decodeNotification, decodePage } from '../../lib/contracts';
import { sessionManager } from '../../lib/http/client';
import type { SessionManager } from '../../lib/http/SessionManager';

export class NotificationsApi {
  constructor(private readonly sessions: SessionManager) {}

  list(): Promise<Paginated<Notification>> {
    return this.sessions
      .authenticatedRequest<unknown>('/notifications?page=1&limit=6')
      .then((value) => decodePage(value, decodeNotification));
  }

  markRead(id: string): Promise<Notification> {
    return this.sessions
      .authenticatedRequest<unknown>(`/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
      })
      .then(decodeNotification);
  }
}

export const notificationsApi = new NotificationsApi(sessionManager);
