import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AccountSidebar from '../components/AccountSidebar';
import {
  supportService,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_REQUEST_TYPES,
} from '../services/supportService';

const STATUS_STYLE = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-800',
  waiting_customer: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-100 text-slate-700',
};

const PRIORITY_STYLE = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-700',
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getSlaLabel = (ticket) => {
  if (!ticket?.sla_due_at) return 'SLA not available';

  const due = new Date(ticket.sla_due_at).getTime();
  const now = Date.now();
  const diffMs = due - now;
  const diffHours = Math.round(Math.abs(diffMs) / (1000 * 60 * 60));

  if (['resolved', 'closed'].includes(ticket.status)) {
    return `Resolved before SLA: ${formatDate(ticket.sla_due_at)}`;
  }

  if (diffMs < 0) {
    return `SLA breached by ${diffHours}h`;
  }

  return `SLA due in ${diffHours}h`;
};

export default function Support() {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState('');

  const initialOrderId = searchParams.get('order') || '';

  const [formData, setFormData] = useState({
    order_id: initialOrderId,
    request_type: 'grievance',
    category: 'delivery_delay',
    priority: 'medium',
    subject: '',
    description: '',
  });

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  const loadData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const [ticketData, orderData] = await Promise.all([
        supportService.getMyTickets(user.id),
        supportService.getCustomerDeliveredOrders(user.id),
      ]);

      setTickets(ticketData);
      setDeliveredOrders(orderData);

      if (!selectedTicketId && ticketData.length > 0) {
        setSelectedTicketId(ticketData[0].id);
      }
    } catch (err) {
      console.error('Error loading support data:', err);
      setError(err.message || 'Unable to load support data.');
    } finally {
      setLoading(false);
    }
  }, [selectedTicketId, user]);

  const loadMessages = useCallback(async (ticketId) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }

    try {
      const data = await supportService.getTicketMessages(ticketId);
      setMessages(data);
    } catch (err) {
      console.error('Error loading ticket messages:', err);
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    loadData();
  }, [authLoading, loadData, user]);

  useEffect(() => {
    if (!selectedTicketId) return;
    loadMessages(selectedTicketId);
  }, [loadMessages, selectedTicketId]);

  const onChangeForm = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateTicket = async (event) => {
    event.preventDefault();
    if (!user) return;

    if (!formData.subject.trim() || !formData.description.trim()) {
      alert('Subject and description are required.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await supportService.createTicket(user.id, {
        ...formData,
        subject: formData.subject.trim(),
        description: formData.description.trim(),
      });

      setTickets((prev) => [created, ...prev]);
      setSelectedTicketId(created.id);
      setFormData((prev) => ({
        ...prev,
        subject: '',
        description: '',
      }));
      alert(`Ticket ${created.ticket_number || ''} created successfully.`);
    } catch (err) {
      console.error('Error creating support ticket:', err);
      alert(err.message || 'Failed to create ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim() || !user) return;

    setReplying(true);
    try {
      await supportService.addCustomerReply(selectedTicket.id, user.id, replyText.trim());
      setReplyText('');
      await Promise.all([loadMessages(selectedTicket.id), loadData()]);
    } catch (err) {
      console.error('Error sending reply:', err);
      alert(err.message || 'Failed to send reply.');
    } finally {
      setReplying(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket || !user) return;

    const ratingInput = window.prompt('Optional: rate support from 1 to 5 before closing. Leave blank to skip.');
    let rating = null;

    if (ratingInput && ratingInput.trim()) {
      const parsed = Number(ratingInput);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        alert('Rating must be between 1 and 5.');
        return;
      }
      rating = parsed;
    }

    setClosing(true);
    try {
      const updated = await supportService.closeTicket(selectedTicket.id, user.id, rating);
      setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
      alert('Ticket closed. Thank you for your feedback.');
    } catch (err) {
      console.error('Error closing ticket:', err);
      alert(err.message || 'Failed to close ticket.');
    } finally {
      setClosing(false);
    }
  };

  const isOpenTicket = selectedTicket && ['open', 'in_progress', 'waiting_customer'].includes(selectedTicket.status);

  if (authLoading || loading) {
    return (
      <main className="pt-6 pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center py-24">
          <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="pt-6 pb-16 min-h-screen bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-surface-container-low rounded-2xl border border-outline-variant/20 p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-primary">support_agent</span>
            <h1 className="font-brand text-3xl md:text-4xl text-primary mt-4">Customer Support</h1>
            <p className="text-on-surface-variant mt-3">
              Please sign in to raise a grievance or track your support tickets.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-2.5 font-semibold">
                <span className="material-symbols-outlined text-base">login</span>
                Login
              </Link>
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/50 px-5 py-2.5 font-semibold text-primary">
                <span className="material-symbols-outlined text-base">person_add</span>
                Create Account
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-6 pb-16 min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
          <AccountSidebar />

          <section className="space-y-8">
            <header>
              <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Support & Grievance</h1>
              <p className="text-on-surface-variant mt-3 max-w-2xl">
                Raise a grievance, issue, report, or support request. Every ticket is tracked with an SLA so you always know the expected resolution window.
              </p>
            </header>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <article className="bg-surface-container-low rounded-2xl p-5 md:p-6 border border-outline-variant/20">
              <h2 className="font-headline text-xl font-bold text-on-surface mb-4">Create New Ticket</h2>

              <form onSubmit={handleCreateTicket} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Order (optional)</span>
                  <select
                    name="order_id"
                    value={formData.order_id}
                    onChange={onChangeForm}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
                  >
                    <option value="">No specific order</option>
                    {deliveredOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        #{order.id.slice(0, 8)} · Rs. {Number(order.total_amount || 0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Request Type</span>
                  <select
                    name="request_type"
                    value={formData.request_type}
                    onChange={onChangeForm}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
                  >
                    {SUPPORT_REQUEST_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Category</span>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={onChangeForm}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
                  >
                    {SUPPORT_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Priority</span>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={onChangeForm}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
                  >
                    {SUPPORT_PRIORITIES.map((priority) => (
                      <option key={priority.id} value={priority.id}>{priority.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Subject</span>
                  <input
                    name="subject"
                    value={formData.subject}
                    onChange={onChangeForm}
                    maxLength={180}
                    placeholder="Short summary of your grievance/request"
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Description</span>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={onChangeForm}
                    rows={4}
                    placeholder="Share full details so support can investigate faster"
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm resize-y"
                  />
                </label>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-2.5 font-semibold disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-base">support_agent</span>
                    {submitting ? 'Creating...' : 'Create Ticket'}
                  </button>
                </div>
              </form>
            </article>

            <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
              <article className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-outline-variant/20">
                  <h2 className="font-headline font-bold text-on-surface">My Tickets</h2>
                </div>

                {tickets.length === 0 ? (
                  <div className="p-6 text-center text-sm text-on-surface-variant">
                    No support tickets yet.
                  </div>
                ) : (
                  <div className="max-h-[520px] overflow-y-auto divide-y divide-outline-variant/20">
                    {tickets.map((ticket) => {
                      const breached = ['open', 'in_progress', 'waiting_customer'].includes(ticket.status)
                        && ticket.sla_due_at
                        && new Date(ticket.sla_due_at).getTime() < Date.now();

                      return (
                        <button
                          type="button"
                          key={ticket.id}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`w-full text-left px-4 py-3 transition-colors ${selectedTicketId === ticket.id ? 'bg-primary/10' : 'hover:bg-surface-container'}`}
                        >
                          <p className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                            {ticket.ticket_number || ticket.id.slice(0, 8)}
                          </p>
                          <p className="mt-1 font-semibold text-sm text-on-surface line-clamp-2">{ticket.subject}</p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${STATUS_STYLE[ticket.status] || STATUS_STYLE.open}`}>
                              {ticket.status.replace(/_/g, ' ')}
                            </span>
                            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${PRIORITY_STYLE[ticket.priority] || PRIORITY_STYLE.medium}`}>
                              {ticket.priority}
                            </span>
                            {breached && (
                              <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-red-100 text-red-700">
                                SLA Breached
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
                {!selectedTicket ? (
                  <div className="p-8 text-center text-on-surface-variant">
                    Select a ticket to view conversation.
                  </div>
                ) : (
                  <>
                    <div className="px-5 py-4 border-b border-outline-variant/20">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                            {selectedTicket.ticket_number}
                          </p>
                          <h3 className="font-headline text-lg font-bold text-on-surface mt-1">{selectedTicket.subject}</h3>
                          <p className="text-xs text-on-surface-variant mt-1">{getSlaLabel(selectedTicket)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedTicket.order_id && (
                            <Link to={`/order/${selectedTicket.order_id}`} className="text-xs text-primary font-semibold hover:underline">
                              View Order
                            </Link>
                          )}
                          {isOpenTicket && (
                            <button
                              onClick={handleCloseTicket}
                              disabled={closing}
                              className="text-xs font-semibold rounded-lg border border-outline-variant/50 px-3 py-1.5 hover:bg-surface disabled:opacity-60"
                            >
                              {closing ? 'Closing...' : 'Close Ticket'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-4 border-b border-outline-variant/20 bg-surface/40">
                      <p className="text-sm text-on-surface whitespace-pre-wrap">{selectedTicket.description}</p>
                      <p className="text-xs text-on-surface-variant mt-2">Created: {formatDate(selectedTicket.created_at)}</p>
                    </div>

                    <div className="p-5 space-y-3 max-h-[310px] overflow-y-auto">
                      {messages.length === 0 ? (
                        <p className="text-sm text-on-surface-variant">No replies yet. Support will respond shortly.</p>
                      ) : (
                        messages.map((message) => {
                          const isCustomer = message.author_role === 'customer';
                          return (
                            <div
                              key={message.id}
                              className={`rounded-xl px-4 py-3 text-sm ${isCustomer ? 'bg-blue-50 border border-blue-100' : 'bg-emerald-50 border border-emerald-100'}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-on-surface">
                                  {isCustomer ? 'You' : 'Support Team'}
                                </p>
                                <p className="text-[11px] text-on-surface-variant">{formatDate(message.created_at)}</p>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-on-surface">{message.message}</p>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {isOpenTicket ? (
                      <div className="p-5 border-t border-outline-variant/20 space-y-3">
                        <textarea
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          rows={3}
                          placeholder="Write additional details or updates for support"
                          className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm resize-y"
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={handleSendReply}
                            disabled={replying || !replyText.trim()}
                            className="inline-flex items-center gap-2 rounded-xl bg-secondary text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
                          >
                            <span className="material-symbols-outlined text-base">send</span>
                            {replying ? 'Sending...' : 'Send Reply'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 border-t border-outline-variant/20 text-sm text-on-surface-variant">
                        This ticket is {selectedTicket.status.replace(/_/g, ' ')}.
                      </div>
                    )}
                  </>
                )}
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
