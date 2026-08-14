import { BellIcon } from '../../components/Icons';
import { formatDate } from '../../lib/format';
import type { Notification } from '../../types';

export function NotificationPopover({
  notifications,
  state,
  onClose,
  onRetry,
  onRead,
}: {
  notifications: Notification[];
  state: 'loading' | 'ready' | 'error';
  onClose: () => void;
  onRetry: () => Promise<void>;
  onRead: (notification: Notification) => Promise<void>;
}) {
  return (
    <section className="notification-popover" aria-label="Centro de notificaciones">
      <div className="notification-popover__head">
        <div>
          <p className="eyebrow">INBOX</p>
          <strong>Notificaciones</strong>
        </div>
        <button className="text-button" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {state === 'loading' && <p className="empty-copy">Cargando notificaciones...</p>}
      {state === 'error' && (
        <p className="empty-copy notification-error">
          No fue posible cargar la bandeja.
          <button onClick={() => void onRetry()}>Reintentar</button>
        </p>
      )}
      {state === 'ready' && notifications.length === 0 && (
        <p className="empty-copy">No hay novedades pendientes.</p>
      )}
      {state === 'ready' && notifications.length > 0 && (
        <div className="notification-popover__list">
          {notifications.map((notification) => (
            <button
              className={`notification-item ${notification.readAt ? 'notification-item--read' : ''}`}
              key={notification._id}
              onClick={() => void onRead(notification)}
            >
              <span className="notification-item__icon">
                <BellIcon />
              </span>
              <span>
                <strong>{notification.title}</strong>
                <small>{notification.message}</small>
                <em>{formatDate(notification.createdAt)}</em>
              </span>
              {!notification.readAt && <i className="notification-item__unread" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
