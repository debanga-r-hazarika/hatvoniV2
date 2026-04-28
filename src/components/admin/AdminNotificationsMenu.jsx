import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { adminNotificationService } from '../../services/adminNotificationService';
import { supabase } from '../../lib/supabase';
import { ADMIN_MODULE_MAP } from '../../lib/adminModules';
import { webPushService } from '../../services/webPushService';

const formatTime = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const moduleLabel = (moduleName) =>
  String(moduleName || '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export default function AdminNotificationsMenu({ userId }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [pushSupported, setPushSupported] = useState(true);
  const [enablingPush, setEnablingPush] = useState(false);
  const [hasPushSubscription, setHasPushSubscription] = useState(false);

  const open = Boolean(anchorEl);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [list, unread] = await Promise.all([
        adminNotificationService.listForUser(userId),
        adminNotificationService.unreadCount(userId),
      ]);
      setItems(list);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to load admin notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refreshPushState = useCallback(async () => {
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/sw-notifications.js')
          || await navigator.serviceWorker.getRegistration();
        if (!registration) {
          setHasPushSubscription(false);
          return;
        }
        const sub = await registration.pushManager.getSubscription();
        setHasPushSubscription(!!sub);
      } catch {
        setHasPushSubscription(false);
      }
    } else {
      setHasPushSubscription(false);
    }
  }, []);

  useEffect(() => {
    refreshPushState();
  }, [refreshPushState]);

  useEffect(() => {
    if (!userId) return undefined;
    refresh();
    refreshPushState();
    webPushService.ensureSubscribed(userId).catch((error) => {
      console.warn('Push subscription setup skipped:', error);
    });
    const channel = adminNotificationService.subscribeToUser(userId, (payload) => {
      const row = payload?.new;
      if (payload?.eventType === 'INSERT' && row) {
        const route = resolveNotificationRoute(row);
        webPushService.showLocalNotification(row.title || 'New notification', row.message || '', route).catch(() => {});
      }
      refresh();
    });
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, refresh, refreshPushState]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    refresh();
  };
  const handleClose = () => setAnchorEl(null);

  const resolveNotificationRoute = (item) => {
    if (!item) return '/admin';
    if (item.entity_type === 'order' && item.entity_id) return `/admin/orders/${item.entity_id}`;
    if (item.entity_type === 'support_ticket') return '/admin/support';
    if (item.entity_type === 'order_shipment') return '/admin/logistics';
    if (item.entity_type === 'coupon') return '/admin/coupons';
    if (item.entity_type === 'inventory') return '/admin/inventory';
    if (item.entity_type === 'product' || item.entity_type === 'lot' || item.entity_type === 'profile') {
      return ADMIN_MODULE_MAP[item.module]?.route || '/admin';
    }
    return ADMIN_MODULE_MAP[item.module]?.route || '/admin';
  };

  const handleItemClick = async (item) => {
    if (!item) return;
    try {
      if (!item.is_read) {
        await adminNotificationService.markAsRead(item.id);
      }
      refresh();
      handleClose();
      navigate(resolveNotificationRoute(item));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await adminNotificationService.markAllAsRead(userId);
      refresh();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const handleEnableAlerts = async () => {
    if (!pushSupported) {
      window.alert('Push notifications are not supported in this browser.');
      return;
    }
    if (!userId) return;
    setEnablingPush(true);
    try {
      const before = ('Notification' in window) ? Notification.permission : 'default';
      if ('Notification' in window) {
        const next = await Notification.requestPermission();
        setNotificationPermission(next);
      }
      await webPushService.ensureSubscribed(userId);
      await refreshPushState();
      if ('Notification' in window && Notification.permission === 'granted') {
        window.alert('Notifications are enabled.');
      } else if (before === 'denied' || Notification.permission === 'denied') {
        window.alert('Notifications are blocked by browser settings. Please allow notifications for this site in browser settings, then click Re-initiate again.');
      }
    } catch (error) {
      console.error('Enable alerts failed:', error);
      window.alert(`Unable to re-initiate notifications: ${error.message || 'Unknown error'}`);
    } finally {
      setEnablingPush(false);
    }
  };

  const alertsOn = pushSupported && notificationPermission === 'granted' && hasPushSubscription;
  const actionLabel = alertsOn ? 'On' : 'Re-initiate';

  const emptyText = useMemo(() => (loading ? 'Loading notifications...' : 'No notifications yet'), [loading]);

  return (
    <>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton
            onClick={handleOpen}
            aria-label="Admin notifications"
            title={alertsOn ? 'Notifications On' : 'Notifications Re-initiate'}
            sx={{
              color: alpha(theme.palette.primary.main, 0.75),
              '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.05) },
            }}
          >
            <Badge
              badgeContent={unreadCount}
              color="error"
              max={99}
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.625rem',
                  fontWeight: 700,
                },
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>notifications</span>
            </Badge>
          </IconButton>
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: alertsOn ? 'success.main' : 'warning.main',
              border: `1.5px solid ${theme.palette.background.paper}`,
              pointerEvents: 'none',
            }}
          />
        </Box>

        {!alertsOn && (
          <IconButton
            onClick={handleEnableAlerts}
            disabled={enablingPush || !pushSupported}
            aria-label="Re-initiate notifications"
            title="Re-initiate notifications"
            size="small"
            sx={{
              color: theme.palette.warning.dark,
              bgcolor: alpha(theme.palette.warning.main, 0.12),
              '&:hover': { bgcolor: alpha(theme.palette.warning.main, 0.2) },
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {enablingPush ? 'progress_activity' : 'autorenew'}
            </span>
          </IconButton>
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: {
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            borderRadius: 3,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
            mt: 1,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.08)}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
              Admin Notifications
            </Typography>
            <Button size="small" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
              Mark all read
            </Button>
          </Box>
          <Typography variant="caption" sx={{ color: alpha(theme.palette.primary.main, 0.6) }}>
            {unreadCount} unread
          </Typography>
        </Box>

        {items.length === 0 ? (
          <Box sx={{ p: 2.5 }}>
            <Typography variant="body2" sx={{ color: alpha(theme.palette.primary.main, 0.6) }}>
              {emptyText}
            </Typography>
          </Box>
        ) : (
          <List disablePadding sx={{ maxHeight: 420, overflowY: 'auto' }}>
            {items.map((item) => (
              <ListItemButton
                key={item.id}
                onClick={() => handleItemClick(item)}
                sx={{
                  alignItems: 'flex-start',
                  borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.05)}`,
                  bgcolor: item.is_read ? 'transparent' : alpha(theme.palette.primary.main, 0.04),
                }}
              >
                <ListItemText
                  primary={(
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: item.is_read ? 500 : 700, color: 'primary.main' }}>
                        {item.title}
                      </Typography>
                      {!item.is_read && (
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />
                      )}
                    </Box>
                  )}
                  secondary={(
                    <Box sx={{ mt: 0.25 }}>
                      <Typography variant="caption" sx={{ display: 'block', color: alpha(theme.palette.primary.main, 0.72) }}>
                        {item.message}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', color: alpha(theme.palette.primary.main, 0.52), mt: 0.5 }}>
                        {moduleLabel(item.module)} · {formatTime(item.created_at)}
                      </Typography>
                    </Box>
                  )}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Menu>
    </>
  );
}

AdminNotificationsMenu.propTypes = {
  userId: PropTypes.string,
};

AdminNotificationsMenu.defaultProps = {
  userId: '',
};
