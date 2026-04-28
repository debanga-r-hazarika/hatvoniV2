import { supabase } from '../lib/supabase';

const TABLE = 'seller_notifications';

const baseQuery = () =>
  supabase
    .from(TABLE)
    .select('id, recipient_seller_id, event_type, title, message, order_id, meta, is_read, read_at, created_at')
    .order('created_at', { ascending: false });

export const sellerNotificationService = {
  async listForSeller(sellerId, limit = 30) {
    if (!sellerId) return [];
    const { data, error } = await baseQuery()
      .eq('recipient_seller_id', sellerId)
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async unreadCount(sellerId) {
    if (!sellerId) return 0;
    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('recipient_seller_id', sellerId)
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

  async markAllAsRead(sellerId) {
    if (!sellerId) return;
    const { error } = await supabase
      .from(TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_seller_id', sellerId)
      .eq('is_read', false);
    if (error) throw error;
  },

  subscribeToSeller(sellerId, onChange) {
    if (!sellerId) return null;
    return supabase
      .channel(`seller-notifications-${sellerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: `recipient_seller_id=eq.${sellerId}`,
        },
        onChange,
      )
      .subscribe();
  },
};
