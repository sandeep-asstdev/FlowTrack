import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import {
  X,
  Bell,
  CheckCheck,
  Check,
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  Clock,
  FileCheck,
  ExternalLink,
  Filter,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
  entityType?: string;
  entityId?: string;
  actor?: {
    id: string;
    fullName?: string;
    avatarUrl?: string;
  };
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNode?: (nodeId: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onSelectNode,
}) => {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await ApiClient.getNotifications();
      if (res && res.items) {
        setNotifications(res.items);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications();

      // Subscribe to real-time notifications
      socketService.connect();
      socketService.joinUser(user.id);

      const unsubscribe = socketService.on('notification:received', (newNotif: NotificationItem) => {
        setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
        setUnreadCount((prev) => prev + 1);
      });

      return () => {
        unsubscribe();
      };
    }
  }, [user]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await ApiClient.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await ApiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read', err);
    }
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }
    if (notif.entityType === 'node' && notif.entityId && onSelectNode) {
      onSelectNode(notif.entityId);
      onClose();
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'ASSIGNMENT':
        return <ClipboardList className="w-4 h-4 text-blue-500" />;
      case 'APPROVAL_REQUEST':
        return <ShieldAlert className="w-4 h-4 text-purple-500" />;
      case 'APPROVAL_DECISION':
        return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      case 'BLOCKER':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'DEADLINE_REMINDER':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'COMMENT_MENTION':
        return <MessageSquare className="w-4 h-4 text-sky-500" />;
      case 'EVIDENCE_SUBMITTED':
        return <FileCheck className="w-4 h-4 text-indigo-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (onlyUnread && n.read) return false;
    if (filterType === 'all') return true;
    return n.type === filterType;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/40 backdrop-blur-xs flex justify-end">
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full pt-safe pb-safe animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600 text-white">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Collaboration alerts &amp; approval requests
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="p-2 sm:p-1.5 min-h-[44px] text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg font-semibold flex items-center gap-1 transition-colors"
                title="Mark all as read"
                aria-label="Mark all as read"
              >
                <CheckCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center gap-1.5 overflow-x-auto text-xs touch-pan-x">
          <button
            onClick={() => { setFilterType('all'); setOnlyUnread(false); }}
            className={`px-3 py-2 min-h-[38px] rounded-lg font-semibold transition-colors shrink-0 flex items-center justify-center ${
              filterType === 'all' && !onlyUnread
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setOnlyUnread(!onlyUnread)}
            className={`px-3 py-2 min-h-[38px] rounded-lg font-semibold transition-colors shrink-0 flex items-center justify-center ${
              onlyUnread
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => { setFilterType('ASSIGNMENT'); setOnlyUnread(false); }}
            className={`px-3 py-2 min-h-[38px] rounded-lg font-semibold transition-colors shrink-0 flex items-center justify-center ${
              filterType === 'ASSIGNMENT'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Assignments
          </button>
          <button
            onClick={() => { setFilterType('APPROVAL_REQUEST'); setOnlyUnread(false); }}
            className={`px-3 py-2 min-h-[38px] rounded-lg font-semibold transition-colors shrink-0 flex items-center justify-center ${
              filterType === 'APPROVAL_REQUEST'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Gates
          </button>
          <button
            onClick={() => { setFilterType('BLOCKER'); setOnlyUnread(false); }}
            className={`px-3 py-2 min-h-[38px] rounded-lg font-semibold transition-colors shrink-0 flex items-center justify-center ${
              filterType === 'BLOCKER'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Blockers
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {loading && notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Loading alerts...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 opacity-40" />
              </div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                You're all caught up!
              </h4>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[200px] mx-auto">
                No active notifications found for the selected filter.
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  notif.read
                    ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 opacity-80'
                    : 'border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs hover:border-blue-400'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    {getNotificationIcon(notif.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className={`text-xs font-bold truncate ${notif.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                        {notif.title}
                      </h5>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {notif.body}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                      <span className="font-medium">
                        {new Date(notif.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      <div className="flex items-center gap-2">
                        {notif.entityType === 'node' && (
                          <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5 hover:underline">
                            <span>Open Task</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        )}
                        {!notif.read && (
                          <button
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-950 rounded-lg transition-colors"
                            title="Mark read"
                            aria-label="Mark notification as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
