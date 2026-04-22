import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  supportService,
  SUPPORT_PRIORITIES,
  SUPPORT_REQUEST_TYPES,
  SUPPORT_STATUSES,
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

const getTicketDisplayName = (ticket) => {
  const fullName = `${ticket.profile?.first_name || ''} ${ticket.profile?.last_name || ''}`.trim();
  return fullName || ticket.profile?.email || 'Customer';
};

const isSlaBreached = (ticket) => {
  if (!ticket?.sla_due_at) return false;
  if (['resolved', 'closed'].includes(ticket.status)) return false;
  return new Date(ticket.sla_due_at).getTime() < Date.now();
};

export default function AdminSupport() {
  const navigate = useNavigate();
  const { user, isAdmin, hasModule, loading } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);
  const [savingTicket, setSavingTicket] = useState(false);
  const [replying, setReplying] = useState(false);

  const [tickets, setTickets] = useState([]);
  const [messages, setMessages] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');

  const [replyText, setReplyText] = useState('');
  const [replyIsInternal, setReplyIsInternal] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    priority: 'all',
    requestType: 'all',
  });

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  const loadAssignees = useCallback(async () => {
    const { data: adminProfiles, error: adminError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, is_admin')
      .eq('is_admin', true)
      .order('created_at', { ascending: false });

    if (adminError) throw adminError;

    const { data: supportEmployees, error: employeeError } = await supabase
      .from('employees')
      .select('profile:profiles!employees_profile_id_fkey(id, first_name, last_name, email), employee_modules(module), is_active')
      .eq('is_active', true);

    if (employeeError) throw employeeError;

    const supportProfiles = (supportEmployees || [])
      .filter((employee) => (employee.employee_modules || []).some((module) => module.module === 'support'))
      .map((employee) => employee.profile)
      .filter(Boolean);

    const uniqueById = [...(adminProfiles || []), ...supportProfiles].reduce((acc, profile) => {
      if (!profile?.id) return acc;
      acc[profile.id] = profile;
      return acc;
    }, {});

    setAssignees(Object.values(uniqueById));
  }, []);

  const loadTickets = useCallback(async () => {
    setPageLoading(true);
    try {
      const data = await supportService.getAdminTickets(filters);
      setTickets(data);
      if (!selectedTicketId && data.length > 0) {
        setSelectedTicketId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading support tickets:', err);
      alert(err.message || 'Failed to load support tickets.');
    } finally {
      setPageLoading(false);
    }
  }, [filters, selectedTicketId]);

  const loadMessages = useCallback(async (ticketId) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }

    try {
      const data = await supportService.getTicketMessages(ticketId, true);
      setMessages(data);
    } catch (err) {
      console.error('Error loading support messages:', err);
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (!loading && !isAdmin && !hasModule('support')) {
      navigate('/access-denied');
    }
  }, [hasModule, isAdmin, loading, navigate]);

  useEffect(() => {
    if (!isAdmin && !hasModule('support')) return;
    loadAssignees();
  }, [hasModule, isAdmin, loadAssignees]);

  useEffect(() => {
    if (!isAdmin && !hasModule('support')) return;
    loadTickets();
  }, [hasModule, isAdmin, loadTickets]);

  useEffect(() => {
    if (!selectedTicketId) return;
    loadMessages(selectedTicketId);
  }, [loadMessages, selectedTicketId]);

  const stats = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'in_progress').length,
    breached: tickets.filter((ticket) => isSlaBreached(ticket)).length,
  }), [tickets]);

  const updateSelectedTicket = (updatedTicket) => {
    setTickets((prev) => prev.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket)));
  };

  const handleTicketFieldUpdate = async (field, value) => {
    if (!selectedTicket) return;

    setSavingTicket(true);
    try {
      const updated = await supportService.updateAdminTicket(selectedTicket.id, {
        [field]: value,
      });
      updateSelectedTicket(updated);
    } catch (err) {
      console.error('Error updating ticket:', err);
      alert(err.message || 'Failed to update ticket.');
    } finally {
      setSavingTicket(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !user || !replyText.trim()) return;

    setReplying(true);
    try {
      await supportService.addStaffReply(selectedTicket.id, user.id, replyText.trim(), replyIsInternal);

      const nextStatus = replyIsInternal ? selectedTicket.status : 'waiting_customer';
      if (nextStatus !== selectedTicket.status) {
        const updated = await supportService.updateAdminTicket(selectedTicket.id, { status: nextStatus });
        updateSelectedTicket(updated);
      }

      setReplyText('');
      setReplyIsInternal(false);
      await loadMessages(selectedTicket.id);
    } catch (err) {
      console.error('Error sending support reply:', err);
      alert(err.message || 'Failed to send reply.');
    } finally {
      setReplying(false);
    }
  };

  if (loading || (!isAdmin && !hasModule('support'))) {
    return (!isAdmin && !hasModule('support') && !loading)
      ? <Navigate to="/access-denied" replace />
      : null;
  }

  return (
    <main className="min-h-screen bg-surface pt-28 pb-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link to="/admin" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </Link>
              <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Support Queue</h1>
            </div>
            <p className="text-on-surface-variant md:ml-8">Manage grievances, reports, and support tickets with SLA tracking.</p>
          </div>

          <button
            onClick={loadTickets}
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/50 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'bg-primary' },
            { label: 'Open', value: stats.open, color: 'bg-red-500' },
            { label: 'In Progress', value: stats.inProgress, color: 'bg-amber-500' },
            { label: 'SLA Breached', value: stats.breached, color: 'bg-slate-700' },
          ].map((card) => (
            <div key={card.label} className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center`}>
                <span className="material-symbols-outlined text-white text-sm">support_agent</span>
              </div>
              <div>
                <p className="font-brand text-xl text-primary leading-none">{card.value}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        <section className="bg-surface-container-low rounded-2xl p-4 md:p-5 border border-outline-variant/20">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search ticket/customer..."
              className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
            />

            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
            >
              <option value="all">All Status</option>
              {SUPPORT_STATUSES.map((status) => (
                <option key={status.id} value={status.id}>{status.label}</option>
              ))}
            </select>

            <select
              value={filters.priority}
              onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
              className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
            >
              <option value="all">All Priority</option>
              {SUPPORT_PRIORITIES.map((priority) => (
                <option key={priority.id} value={priority.id}>{priority.label}</option>
              ))}
            </select>

            <select
              value={filters.requestType}
              onChange={(event) => setFilters((prev) => ({ ...prev, requestType: event.target.value }))}
              className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm"
            >
              <option value="all">All Request Types</option>
              {SUPPORT_REQUEST_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
          <section className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant/20">
              <h2 className="font-headline font-bold">Tickets</h2>
            </div>

            {pageLoading ? (
              <div className="p-10 text-center">
                <span className="material-symbols-outlined animate-spin text-3xl text-secondary">progress_activity</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-sm text-on-surface-variant text-center">No tickets match current filters.</div>
            ) : (
              <div className="max-h-[620px] overflow-y-auto divide-y divide-outline-variant/20">
                {tickets.map((ticket) => (
                  <button
                    type="button"
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${ticket.id === selectedTicketId ? 'bg-primary/10' : 'hover:bg-surface-container'}`}
                  >
                    <p className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{ticket.ticket_number}</p>
                    <p className="mt-1 font-semibold text-sm text-on-surface line-clamp-2">{ticket.subject}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{getTicketDisplayName(ticket)}</p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${STATUS_STYLE[ticket.status] || STATUS_STYLE.open}`}>
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${PRIORITY_STYLE[ticket.priority] || PRIORITY_STYLE.medium}`}>
                        {ticket.priority}
                      </span>
                      {isSlaBreached(ticket) && (
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-red-100 text-red-700">
                          SLA Breached
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
            {!selectedTicket ? (
              <div className="p-8 text-on-surface-variant text-sm">Select a ticket to manage it.</div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-outline-variant/20">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-on-surface-variant">{selectedTicket.ticket_number}</p>
                      <h3 className="font-headline text-xl font-bold text-on-surface mt-1">{selectedTicket.subject}</h3>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {getTicketDisplayName(selectedTicket)} · Created {formatDate(selectedTicket.created_at)}
                      </p>
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      SLA Due: <span className={isSlaBreached(selectedTicket) ? 'text-red-600 font-semibold' : 'font-semibold'}>{formatDate(selectedTicket.sla_due_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 border-b border-outline-variant/20 bg-surface/50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">Status</span>
                      <select
                        value={selectedTicket.status}
                        disabled={savingTicket}
                        onChange={(event) => handleTicketFieldUpdate('status', event.target.value)}
                        className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm"
                      >
                        {SUPPORT_STATUSES.map((status) => (
                          <option key={status.id} value={status.id}>{status.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">Priority</span>
                      <select
                        value={selectedTicket.priority}
                        disabled={savingTicket}
                        onChange={(event) => handleTicketFieldUpdate('priority', event.target.value)}
                        className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm"
                      >
                        {SUPPORT_PRIORITIES.map((priority) => (
                          <option key={priority.id} value={priority.id}>{priority.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">Assign To</span>
                      <select
                        value={selectedTicket.assigned_to || ''}
                        disabled={savingTicket}
                        onChange={(event) => handleTicketFieldUpdate('assigned_to', event.target.value || null)}
                        className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {assignees.map((assignee) => {
                          const name = `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || assignee.email;
                          return (
                            <option key={assignee.id} value={assignee.id}>{name}</option>
                          );
                        })}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">Customer Description</p>
                    <p className="mt-1 text-sm text-on-surface whitespace-pre-wrap">{selectedTicket.description}</p>
                    {selectedTicket.order_id && (
                      <Link to={`/order/${selectedTicket.order_id}`} className="inline-flex mt-2 text-xs font-semibold text-primary hover:underline">
                        View Linked Order
                      </Link>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-3 max-h-[290px] overflow-y-auto border-b border-outline-variant/20">
                  {messages.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">No conversation yet.</p>
                  ) : (
                    messages.map((message) => {
                      const internal = message.is_internal;
                      const mine = message.author_id === user?.id;
                      const roleLabel = internal ? 'Internal Note' : message.author_role === 'customer' ? 'Customer' : 'Support';

                      return (
                        <div
                          key={message.id}
                          className={`rounded-xl px-4 py-3 text-sm border ${internal ? 'bg-amber-50 border-amber-200' : mine ? 'bg-blue-50 border-blue-100' : 'bg-emerald-50 border-emerald-100'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-on-surface">{roleLabel}</p>
                            <p className="text-[11px] text-on-surface-variant">{formatDate(message.created_at)}</p>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-on-surface">{message.message}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-5 space-y-3">
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    rows={3}
                    placeholder="Write a public reply to customer or an internal note"
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm resize-y"
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-on-surface-variant">
                      <input
                        type="checkbox"
                        checked={replyIsInternal}
                        onChange={(event) => setReplyIsInternal(event.target.checked)}
                        className="rounded border-outline-variant/40"
                      />
                      Save as internal note
                    </label>

                    <button
                      onClick={handleSendReply}
                      disabled={replying || !replyText.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-base">send</span>
                      {replying ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
