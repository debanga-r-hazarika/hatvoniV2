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
import { supabase } from '../../lib/supabase';
import { customerNotificationService } from '../../services/customerNotificationService';

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

export default function CustomerNotificationsMenu({ userId }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const open = Boolean(anchorEl);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [list, unread] = await Promise.all([
        customerNotificationService.listForUser(userId),
        customerNotificationService.unreadCount(userId),
      ]);
      setItems(list);
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to load customer notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    refresh();
    const channel = customerNotificationService.subscribeToUser(userId, refresh);
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const handleClose = () => setAnchorEl(null);
  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    refresh();
  };

  const handleItemClick = async (item) => {
    if (!item) return;
    try {
      if (!item.is_read) {
        await customerNotificationService.markAsRead(item.id);
      }
      refresh();
      handleClose();
      navigate(item?.order_id ? `/order/${item.order_id}` : '/orders');
    } catch (error) {
      console.error('Failed to open customer notification:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await customerNotificationService.markAllAsRead(userId);
      refresh();
    } catch (error) {
      console.error('Failed to mark customer notifications as read:', error);
    }
  };

  const emptyText = useMemo(() => (loading ? 'Loading notifications...' : 'No order updates yet'), [loading]);

  return (
    <>
      <IconButton
        onClick={handleOpen}
        aria-label="Order update notifications"
        title="Order update notifications"
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

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: {
            width: 360,
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
              Order Updates
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
                        {formatTime(item.created_at)}
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

CustomerNotificationsMenu.propTypes = {
  userId: PropTypes.string,
};

CustomerNotificationsMenu.defaultProps = {
  userId: '',
};
