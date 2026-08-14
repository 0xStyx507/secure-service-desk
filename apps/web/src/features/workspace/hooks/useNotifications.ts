import { useCallback, useEffect, useState } from 'react';
import { notificationsApi } from '../../notifications/api';
import type { Notification } from '../../../types';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const loadNotifications = useCallback(async () => {
    setState('loading');
    try {
      const result = await notificationsApi.list();
      setNotifications(result.items);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  const markNotificationRead = useCallback(async (notification: Notification) => {
    if (notification.readAt) return;
    const updated = await notificationsApi.markRead(notification._id);
    setNotifications((current) =>
      current.map((item) => (item._id === updated._id ? updated : item)),
    );
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  return { notifications, state, loadNotifications, markNotificationRead };
}
