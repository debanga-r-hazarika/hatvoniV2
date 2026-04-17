import { supabase } from '../lib/supabase';

export const SUPPORT_REQUEST_TYPES = [
  { id: 'grievance', label: 'Grievance' },
  { id: 'issue', label: 'Issue' },
  { id: 'report', label: 'Report' },
  { id: 'support', label: 'General Support' },
];

export const SUPPORT_CATEGORIES = [
  { id: 'delivery_delay', label: 'Delivery Delay' },
  { id: 'damaged_item', label: 'Damaged Item' },
  { id: 'missing_item', label: 'Missing Item' },
  { id: 'wrong_item', label: 'Wrong Item' },
  { id: 'quality_issue', label: 'Product Quality Issue' },
  { id: 'payment_issue', label: 'Payment Issue' },
  { id: 'refund_request', label: 'Refund Request' },
  { id: 'return_request', label: 'Return Request' },
  { id: 'app_issue', label: 'App / Website Issue' },
  { id: 'other', label: 'Other' },
];

export const SUPPORT_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
];

export const SUPPORT_STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting_customer', label: 'Waiting Customer' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const BASE_SELECT = `
  *,
  profile:profiles!support_tickets_user_id_fkey(id, first_name, last_name, email),
  assignee:profiles!support_tickets_assigned_to_fkey(id, first_name, last_name, email),
  order:orders(id, status, created_at, total_amount)
`;

export const supportService = {
  async getCustomerDeliveredOrders(userId) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, order_status, created_at, total_amount')
      .eq('user_id', userId)
      .or('status.eq.delivered,order_status.eq.delivered')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getMyTickets(userId) {
    const { data, error } = await supabase
      .from('support_tickets')
      .select(BASE_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async createTicket(userId, payload) {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert([
        {
          user_id: userId,
          order_id: payload.order_id || null,
          request_type: payload.request_type,
          category: payload.category,
          priority: payload.priority || 'medium',
          subject: payload.subject,
          description: payload.description,
        }
      ])
      .select(BASE_SELECT)
      .single();

    if (error) throw error;
    return data;
  },

  async getTicketMessages(ticketId, includeInternal = false) {
    let query = supabase
      .from('support_ticket_messages')
      .select('*, author:profiles(id, first_name, last_name, email)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (!includeInternal) {
      query = query.eq('is_internal', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async addCustomerReply(ticketId, userId, message) {
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .insert([
        {
          ticket_id: ticketId,
          author_id: userId,
          author_role: 'customer',
          is_internal: false,
          message,
        }
      ])
      .select('*, author:profiles(id, first_name, last_name, email)')
      .single();

    if (error) throw error;

    await supabase
      .from('support_tickets')
      .update({ status: 'open' })
      .eq('id', ticketId);

    return data;
  },

  async closeTicket(ticketId, userId, rating = null) {
    const updatePayload = {
      status: 'closed',
      updated_at: new Date().toISOString(),
    };

    if (rating !== null && rating !== undefined) {
      updatePayload.customer_rating = Number(rating);
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .update(updatePayload)
      .eq('id', ticketId)
      .eq('user_id', userId)
      .select(BASE_SELECT)
      .single();

    if (error) throw error;
    return data;
  },

  async getAdminTickets(filters = {}) {
    let query = supabase
      .from('support_tickets')
      .select(BASE_SELECT)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.priority && filters.priority !== 'all') {
      query = query.eq('priority', filters.priority);
    }

    if (filters.requestType && filters.requestType !== 'all') {
      query = query.eq('request_type', filters.requestType);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!filters.search) {
      return data || [];
    }

    const needle = filters.search.trim().toLowerCase();
    return (data || []).filter((ticket) => {
      const fullName = `${ticket.profile?.first_name || ''} ${ticket.profile?.last_name || ''}`.trim().toLowerCase();
      return (
        String(ticket.ticket_number || '').toLowerCase().includes(needle)
        || String(ticket.subject || '').toLowerCase().includes(needle)
        || String(ticket.description || '').toLowerCase().includes(needle)
        || fullName.includes(needle)
        || String(ticket.profile?.email || '').toLowerCase().includes(needle)
      );
    });
  },

  async updateAdminTicket(ticketId, updates) {
    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('support_tickets')
      .update(payload)
      .eq('id', ticketId)
      .select(BASE_SELECT)
      .single();

    if (error) throw error;
    return data;
  },

  async addStaffReply(ticketId, authorId, message, isInternal = false) {
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .insert([
        {
          ticket_id: ticketId,
          author_id: authorId,
          author_role: 'support',
          is_internal: isInternal,
          message,
        }
      ])
      .select('*, author:profiles(id, first_name, last_name, email)')
      .single();

    if (error) throw error;
    return data;
  }
};
