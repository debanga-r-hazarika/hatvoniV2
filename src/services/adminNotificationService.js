import { supabase } from '../lib/supabase';

const PAGE_SIZE = 20;

export const adminNotificationService = {
  async listForUser(userId, limit = PAGE_SIZE) {
    if (!userId) return [];
    const { data, error } = await supabase
      .from('admin_notifications')
      .select('*')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async unreadCount(userId) {
    if (!userId) return 0;
    const { count, error } = await supabase
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  },

  async markAsRead(notificationId) {
    const { error } = await supabase
      .from('admin_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (error) throw error;
  },

  async markAllAsRead(userId) {
    if (!userId) return;
    const { error } = await supabase
      .from('admin_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('recipient_user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
  },

  async listPreferences(userId) {
    if (!userId) return [];
    const { data, error } = await supabase
      .from('admin_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('module', { ascending: true })
      .order('event_type', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async upsertModulePreference(userId, moduleName, enabled) {
    const { error } = await supabase
      .from('admin_notification_preferences')
      .upsert(
        [{ user_id: userId, module: moduleName, event_type: '*', in_app_enabled: enabled }],
        { onConflict: 'user_id,module,event_type' },
      );
    if (error) throw error;
  },

  async upsertEventPreference(userId, moduleName, eventType, enabled) {
    const { error } = await supabase
      .from('admin_notification_preferences')
      .upsert(
        [{ user_id: userId, module: moduleName, event_type: eventType, in_app_enabled: enabled }],
        { onConflict: 'user_id,module,event_type' },
      );
    if (error) throw error;
  },

  async resetModulePreferences(userId, moduleName) {
    if (!userId) return;
    const { error } = await supabase
      .from('admin_notification_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('module', moduleName);
    if (error) throw error;
  },

  subscribeToUser(userId, onChange) {
    if (!userId) return null;
    const channel = supabase
      .channel(`admin-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => onChange?.(payload),
      )
      .subscribe();

    return channel;
  },
};
