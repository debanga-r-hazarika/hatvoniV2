import { supabase } from '../lib/supabase';

const TABLE = 'customer_notifications';

export const customerNotificationService = {
  async listForUser(userId, limit = 30) {
    if (!userId) return [];
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, recipient_user_id, event_type, title, message, order_id, meta, is_read, read_at, created_at')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async unreadCount(userId) {
    if (!userId) return 0;
    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
    return count || 0;
  },

  async markAsRead(notificationId) {
    if (!notificationId) return;
    const { error } = await supabase
      .from(TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);
    if (error) throw error;
  },

  async markAllAsRead(userId) {
    if (!userId) return;
    const { error } = await supabase
      .from(TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
  },

  subscribeToUser(userId, onChange) {
    if (!userId) return null;
    return supabase
      .channel(`customer-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: `recipient_user_id=eq.${userId}`,
        },
        onChange,
      )
      .subscribe();
  },
};
