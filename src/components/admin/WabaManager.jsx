import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

const AUTO_REFRESH_SECONDS = 120;
const SUB_TABS = [
  { id: 'details', label: 'Details', icon: 'info' },
  { id: 'template', label: 'Template', icon: 'article' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  { id: 'balance', label: 'Balance', icon: 'account_balance_wallet' },
  { id: 'webhook', label: 'Webhook', icon: 'webhook' },
];

const fmtYmd = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const threeDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return fmtYmd(d);
};

const thirtyDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return fmtYmd(d);
};

const formatIstDateTime = (timestamp) => {
  if (!timestamp && timestamp !== 0) return '—';
  const raw = Number(timestamp);
  if (Number.isNaN(raw)) return String(timestamp);
  const ms = raw > 1e12 ? raw : raw * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(timestamp);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

const isIgnorableFast2SmsConnectionError = (message = '') =>
  String(message).toLowerCase().includes('whatsapp business account is not connected');

const deriveCanSendFromConnection = (connectionStatus = '') => {
  const s = String(connectionStatus || '').toUpperCase();
  if (s === 'CONNECTED') return 'AVAILABLE';
  if (!s) return 'UNKNOWN';
  return 'UNKNOWN';
};

const extractTemplateVars = (text = '') => {
  const matches = String(text).match(/\{\{\d+\}\}/g) || [];
  return [...new Set(matches)];
};

const detectTemplateVarIds = (components = []) => {
  const ids = new Set();
  for (const cmp of components || []) {
    for (const v of extractTemplateVars(cmp?.text || '')) {
      ids.add(Number(v.replace(/[^\d]/g, '')));
    }
    if (Array.isArray(cmp?.buttons)) {
      for (const btn of cmp.buttons) {
        for (const v of extractTemplateVars(btn?.url || '')) {
          ids.add(Number(v.replace(/[^\d]/g, '')));
        }
      }
    }
  }
  return [...ids].filter(Number.isFinite).sort((a, b) => a - b);
};

const replaceVarsInText = (text = '', valuesById = {}) =>
  String(text).replace(/\{\{(\d+)\}\}/g, (_, id) => (valuesById[id] ?? `{{${id}}}`));

const detectTemplateMediaUrl = (components = []) => {
  const header = (components || []).find((c) => c?.type === 'HEADER');
  const ex = header?.example || {};
  const candidate =
    (Array.isArray(ex?.header_handle) && ex.header_handle[0]) ||
    (Array.isArray(ex?.header_text) && ex.header_text[0]) ||
    '';
  return typeof candidate === 'string' && /^https?:\/\//i.test(candidate) ? candidate : '';
};

const hasTemplateMediaHeader = (components = []) => {
  const header = (components || []).find((c) => c?.type === 'HEADER');
  const format = String(header?.format || '').toUpperCase();
  return ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format);
};

function StatusBadge({ value, type = 'neutral' }) {
  const text = String(value || 'UNKNOWN');
  const normalized = text.toUpperCase();
  let className = 'bg-slate-100 text-slate-700 border-slate-200';
  if (type === 'health') {
    if (normalized.includes('AVAILABLE') || normalized.includes('CONNECTED') || normalized.includes('VERIFIED') || normalized.includes('APPROVED')) className = 'bg-emerald-100 text-emerald-700 border-emerald-200';
    else if (normalized.includes('LIMITED') || normalized.includes('PENDING') || normalized.includes('UNKNOWN')) className = 'bg-amber-100 text-amber-700 border-amber-200';
    else if (normalized.includes('NOT') || normalized.includes('REJECT') || normalized.includes('FAILED') || normalized.includes('DISCONNECT')) className = 'bg-red-100 text-red-700 border-red-200';
  }
  if (type === 'quality') {
    if (normalized.includes('GREEN')) className = 'bg-emerald-100 text-emerald-700 border-emerald-200';
    else if (normalized.includes('YELLOW') || normalized.includes('UNKNOWN')) className = 'bg-amber-100 text-amber-700 border-amber-200';
    else if (normalized.includes('RED')) className = 'bg-red-100 text-red-700 border-red-200';
  }
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{text}</span>;
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60">{label}</p>
      <p className="text-sm font-semibold text-[#004a2b] break-all">{value || '—'}</p>
    </div>
  );
}

function TemplateComponentCard({ cmp, index }) {
  const textVars = extractTemplateVars(cmp?.text || '');
  return (
    <div className="rounded-lg border border-[#bec9bf]/15 p-3 bg-white">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[11px] font-semibold text-[#004a2b]">{cmp?.type || 'COMPONENT'} {cmp?.format ? `(${cmp.format})` : ''}</p>
        <span className="text-[10px] text-[#3f4942]/60">#{index + 1}</span>
      </div>
      {cmp?.text && <p className="text-[11px] text-[#3f4942] break-words mb-2">{cmp.text}</p>}
      {textVars.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Variables</p>
          <div className="flex flex-wrap gap-1">
            {textVars.map((v) => <span key={v} className="inline-flex px-2 py-0.5 rounded bg-[#eef6ef] text-[#004a2b] text-[10px] font-semibold">{v}</span>)}
          </div>
        </div>
      )}
      {cmp?.example && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Example Data</p>
          <pre className="text-[10px] text-[#3f4942] bg-[#f8f7f1] border border-[#bec9bf]/20 rounded p-2 overflow-auto">{JSON.stringify(cmp.example, null, 2)}</pre>
        </div>
      )}
      {Array.isArray(cmp?.buttons) && cmp.buttons.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Buttons</p>
          <div className="space-y-1">
            {cmp.buttons.map((btn, i) => (
              <div key={`${btn?.text || btn?.url || i}`} className="rounded border border-[#bec9bf]/15 px-2 py-1.5 text-[11px]">
                <p className="font-semibold text-[#004a2b]">{btn?.type || 'BUTTON'} - {btn?.text || 'No label'}</p>
                {btn?.url && (
                  <p className="text-[#3f4942] break-all">
                    URL: {btn.url}
                    {extractTemplateVars(btn.url).length > 0 && (
                      <span className="ml-1 text-[#815500]">({extractTemplateVars(btn.url).join(', ')})</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!cmp?.text && !cmp?.example && (!Array.isArray(cmp?.buttons) || cmp.buttons.length === 0) && (
        <p className="text-[11px] text-[#3f4942]/70">No extra content in this component.</p>
      )}
    </div>
  );
}

function WhatsAppPreview({ template, valuesById }) {
  const components = template?.components || [];
  const header = components.find((c) => c?.type === 'HEADER');
  const body = components.find((c) => c?.type === 'BODY');
  const footer = components.find((c) => c?.type === 'FOOTER');
  const buttons = components.find((c) => c?.type === 'BUTTONS')?.buttons || [];
  const headerText = replaceVarsInText(header?.text || '', valuesById);
  const bodyText = replaceVarsInText(body?.text || '', valuesById);
  const footerText = replaceVarsInText(footer?.text || '', valuesById);

  return (
    <div className="rounded-xl border border-[#bec9bf]/25 bg-[#e8efe8] p-3">
      <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/70 mb-2">WhatsApp Preview</p>
      <div className="rounded-xl bg-white border border-[#bec9bf]/20 p-3 space-y-2">
        {header?.format && header?.format !== 'TEXT' && (
          <div className="rounded-lg bg-[#f5f4eb] border border-[#bec9bf]/20 px-2 py-1 text-[11px] text-[#3f4942]">
            Header Media: {header.format}
          </div>
        )}
        {headerText && <p className="text-sm font-semibold text-[#004a2b]">{headerText}</p>}
        {bodyText && <p className="text-sm text-[#2f3731] whitespace-pre-wrap">{bodyText}</p>}
        {footerText && <p className="text-xs text-[#6b726d]">{footerText}</p>}
        {buttons.length > 0 && (
          <div className="pt-1 border-t border-[#bec9bf]/20 space-y-1">
            {buttons.map((btn, i) => (
              <div key={`${btn?.text || i}`} className="text-xs text-[#004a2b] font-semibold">
                {btn?.text || `Button ${i + 1}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaManager({ template, headerFormat, savedAssignment, sampleMediaUrl, mediaUploadBusy, onUpload, onSave, onUseUrl, onRemove }) {
  const [expanded, setExpanded] = React.useState(false);
  const [customUrl, setCustomUrl] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState('');
  const savedUrl = String(savedAssignment?.media_url || '').trim();
  const isImage = String(headerFormat || '').toUpperCase() === 'IMAGE';

  const handleSaveCustomUrl = async () => {
    if (!customUrl.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await onSave(customUrl.trim());
      onUseUrl(customUrl.trim());
      setSaveMsg('Saved!');
      setCustomUrl('');
      setTimeout(() => setSaveMsg(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try { await onRemove(); } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#f6f4ea] border-b border-[#bec9bf]/20">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-[#815500]">
            {headerFormat === 'IMAGE' ? 'image' : headerFormat === 'VIDEO' ? 'videocam' : 'description'}
          </span>
          <p className="text-xs font-bold text-[#815500]">Media Manager</p>
          <span className="text-[10px] text-[#3f4942]/40 uppercase">{headerFormat} header</span>
        </div>
        <div className="flex items-center gap-2">
          {savedUrl ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Media saved
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <span className="material-symbols-outlined text-sm">warning</span>
              No media
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* Saved media display */}
        {savedUrl ? (
          <div className="rounded-lg border border-[#bec9bf]/20 bg-[#fbfaf1] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#bec9bf]/15">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#3f4942]/50">Saved Media</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { onUseUrl(savedUrl); }}
                  className="h-6 px-2 rounded text-[10px] font-semibold text-[#004a2b] bg-[#eef6ef] border border-[#004a2b]/15 hover:bg-[#004a2b]/10"
                >
                  Use in Test
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="h-6 px-2 rounded text-[10px] font-semibold text-[#3f4942]/60 bg-white border border-[#bec9bf]/20 hover:bg-[#f6f4ea] flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">{expanded ? 'expand_less' : 'expand_more'}</span>
                  {expanded ? 'Hide' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={saving}
                  className="h-6 px-2 rounded text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="px-3 py-2 min-w-0">
              <p className="text-[10px] text-[#3f4942]/50 break-all leading-relaxed">{savedUrl}</p>
            </div>
            {/* Expandable preview */}
            {expanded && isImage && (
              <div className="border-t border-[#bec9bf]/15 p-3 bg-white">
                <img
                  src={savedUrl}
                  alt="Saved media preview"
                  className="w-full max-h-48 object-contain rounded-lg border border-[#bec9bf]/20"
                  onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('p'), { className: 'text-xs text-red-500 p-2', textContent: 'Failed to load image preview.' })); }}
                />
              </div>
            )}
            {expanded && !isImage && (
              <div className="border-t border-[#bec9bf]/15 p-3 bg-white flex items-center gap-2 text-xs text-[#3f4942]/60">
                <span className="material-symbols-outlined text-base">{headerFormat === 'VIDEO' ? 'videocam' : 'description'}</span>
                Preview not available for {headerFormat} files.
                <a href={savedUrl} target="_blank" rel="noopener noreferrer" className="text-[#004a2b] font-semibold underline underline-offset-2 ml-1">Open file ↗</a>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#bec9bf]/40 bg-[#fbfaf1] px-4 py-5 text-center">
            <span className="material-symbols-outlined text-2xl text-[#bec9bf]/60 block mb-1">
              {headerFormat === 'IMAGE' ? 'add_photo_alternate' : headerFormat === 'VIDEO' ? 'video_call' : 'upload_file'}
            </span>
            <p className="text-xs text-[#3f4942]/50">No media saved for this template yet.</p>
            <p className="text-[10px] text-[#3f4942]/40 mt-0.5">Upload or paste a URL below to save it.</p>
          </div>
        )}

        {/* Upload new file */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50 font-semibold">{savedUrl ? 'Replace with new file' : 'Upload file'}</p>
          <label className="flex items-center gap-3 rounded-lg border border-[#bec9bf]/20 bg-[#fbfaf1] px-3 py-2.5 cursor-pointer hover:bg-[#f6f4ea] transition-colors">
            <span className="material-symbols-outlined text-base text-[#004a2b]">upload</span>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-[#2f3731]">{mediaUploadBusy ? 'Uploading to R2…' : 'Choose file to upload'}</p>
              <p className="text-[10px] text-[#3f4942]/40">Uploads to Cloudflare R2 · Saved & reused automatically</p>
            </div>
            {mediaUploadBusy && <span className="material-symbols-outlined text-base text-[#004a2b] animate-spin">progress_activity</span>}
            <input
              type="file"
              accept={headerFormat === 'IMAGE' ? 'image/*' : headerFormat === 'VIDEO' ? 'video/*' : '*'}
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] || null)}
              disabled={mediaUploadBusy}
            />
          </label>
        </div>

        {/* Paste URL */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50 font-semibold">{savedUrl ? 'Or replace with URL' : 'Or paste URL'}</p>
          <div className="flex gap-2">
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://cdn.example.com/image.jpg"
              className="flex-1 h-9 px-3 border border-[#bec9bf]/30 rounded-lg text-xs focus:outline-none focus:border-[#004a2b]/50 bg-[#fbfaf1]"
            />
            <button
              type="button"
              onClick={handleSaveCustomUrl}
              disabled={saving || !customUrl.trim()}
              className="h-9 px-3 rounded-lg bg-[#004a2b] text-white text-xs font-bold hover:bg-[#004a2b]/90 disabled:opacity-40 whitespace-nowrap"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {saveMsg && <p className="text-[10px] text-emerald-600 font-semibold">{saveMsg}</p>}
          <p className="text-[10px] text-[#3f4942]/40">URL must be publicly accessible. Private/expired links will fail.</p>
        </div>

        {/* Sample media from template */}
        {sampleMediaUrl && sampleMediaUrl !== savedUrl && (
          <div className="rounded-lg border border-[#bec9bf]/20 bg-[#fbfaf1] px-3 py-2.5 flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[#3f4942]/60">Template sample URL</p>
              <p className="text-[10px] text-[#3f4942]/40 break-all leading-relaxed">{sampleMediaUrl}</p>
            </div>
            <button
              type="button"
              onClick={async () => { await onSave(sampleMediaUrl); onUseUrl(sampleMediaUrl); }}
              className="h-7 px-2.5 rounded-lg border border-[#004a2b]/20 text-[10px] font-semibold text-[#004a2b] bg-white hover:bg-[#eef6ef] flex-shrink-0"
            >
              Save as media
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default function WabaManager() {
  const version = 'v24.0';
  const [activeSubTab, setActiveSubTab] = useState('details');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [healthInfo, setHealthInfo] = useState(null);
  const [phoneNumbersList, setPhoneNumbersList] = useState([]);
  const [templateList, setTemplateList] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [webhook, setWebhook] = useState({ webhook_url: '', webhook_status: 'disable' });
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [logsFrom, setLogsFrom] = useState(threeDaysAgo());
  const [logsTo, setLogsTo] = useState(fmtYmd(new Date()));
  const [summaryFrom, setSummaryFrom] = useState(thirtyDaysAgo());
  const [summaryTo, setSummaryTo] = useState(fmtYmd(new Date()));
  const [webhookStatusEdit, setWebhookStatusEdit] = useState('enable');
  const [webhookUrlEdit, setWebhookUrlEdit] = useState(`https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/send-whatsapp`);
  const [templateRows, setTemplateRows] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDetail, setTemplateDetail] = useState(null);
  const [testToNumber, setTestToNumber] = useState('');
  const [testVarValues, setTestVarValues] = useState({});
  const [testMediaUrl, setTestMediaUrl] = useState('');
  const [mediaUploadBusy, setMediaUploadBusy] = useState(false);
  const [templateMediaAssignments, setTemplateMediaAssignments] = useState({});
  const [testSendResult, setTestSendResult] = useState(null);
  const [mediaLookupId, setMediaLookupId] = useState('');
  const [mediaLookupResult, setMediaLookupResult] = useState(null);
  const [sectionWarnings, setSectionWarnings] = useState([]);

  const invokeWaba = useCallback(async (action, body = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Not authenticated. Please log in again.');
    const { data: payload, error: invokeError } = await supabase.functions.invoke('waba-details', {
      body: { action, version, ...body },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (invokeError) throw invokeError;
    if (!payload?.ok) throw new Error(payload?.error || 'WABA request failed.');
    return payload;
  }, []);

  const safeInvokeWaba = useCallback(async (action, body = {}) => {
    try {
      const data = await invokeWaba(action, body);
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || 'Request failed' };
    }
  }, [invokeWaba]);

  const loadDetails = useCallback(async () => {
    const warnings = [];
    const numbersRes = await invokeWaba('get_waba_and_templates', { type: 'number' });
    const templatesRes = await invokeWaba('get_waba_and_templates', { type: 'template' });
    const numbers = numbersRes?.upstream?.data?.data || [];
    const primary = numbers[0] || {};
    const wabaId = primary?.waba_id ? String(primary.waba_id) : '';
    const phoneId = primary?.phone_number_id ? String(primary.phone_number_id) : '';
    let healthRes = null;
    let phoneRes = null;
    let businessRes = null;
    let nameRes = null;
    let singleRes = null;
    if (wabaId) {
      const [h, p] = await Promise.all([
        safeInvokeWaba('get_waba_health_status', { waba_id: wabaId }),
        safeInvokeWaba('get_phone_numbers', { waba_id: wabaId }),
      ]);
      healthRes = h.data;
      phoneRes = p.data;
      if (h.error && !isIgnorableFast2SmsConnectionError(h.error)) warnings.push(`Health API: ${h.error}`);
      if (p.error && !isIgnorableFast2SmsConnectionError(p.error)) warnings.push(`Phone Numbers API: ${p.error}`);
    }
    if (phoneId) {
      const [b, n, s] = await Promise.all([
        safeInvokeWaba('get_business_profile', { phone_number_id: phoneId }),
        safeInvokeWaba('get_display_name_status', { phone_number_id: phoneId }),
        safeInvokeWaba('get_single_phone_number_details', { phone_number_id: phoneId }),
      ]);
      businessRes = b.data;
      nameRes = n.data;
      singleRes = s.data;
      if (b.error && !isIgnorableFast2SmsConnectionError(b.error)) warnings.push(`Business Profile API: ${b.error}`);
      if (n.error && !isIgnorableFast2SmsConnectionError(n.error)) warnings.push(`Display Name API: ${n.error}`);
      if (s.error && !isIgnorableFast2SmsConnectionError(s.error)) warnings.push(`Single Phone API: ${s.error}`);
    }
    const templates = Array.isArray(templatesRes?.upstream?.data?.data) ? templatesRes.upstream.data.data.flatMap((x) => x?.templates || []) : [];
    const fallbackPhoneRows = numbers.map((n) => ({
      id: n.phone_number_id ? String(n.phone_number_id) : '',
      display_phone_number: n.number || '',
      verified_name: n.verified_name || '',
      code_verification_status: n.name_status || 'UNKNOWN',
      quality_rating: n.quality_rating || 'UNKNOWN',
      platform_type: n.platform_type || '',
      status: n.connection_status || '',
    }));
    const fallbackHealth = {
      id: wabaId || null,
      health_status: {
        can_send_message: deriveCanSendFromConnection(primary?.connection_status),
        entities: (numbers || []).map((n) => ({
          entity_type: 'PHONE_NUMBER',
          id: String(n?.phone_number_id || ''),
          can_send_message: deriveCanSendFromConnection(n?.connection_status),
        })),
      },
    };
    const fallbackBusinessProfile = {
      about: '',
      vertical: '',
      messaging_product: 'whatsapp',
      websites: [],
      profile_picture_url: '',
      verified_name: primary?.verified_name || '',
      display_phone_number: primary?.number || '',
    };
    const fallbackSinglePhone = {
      status: primary?.connection_status || 'UNKNOWN',
      is_official_business_account: false,
      id: phoneId || '',
      name_status: primary?.name_status || 'UNKNOWN',
      code_verification_status: primary?.name_status || 'UNKNOWN',
      display_phone_number: primary?.number || '',
      platform_type: primary?.platform_type || '',
      messaging_limit_tier: primary?.messaging_limit || '',
      throughput: { level: 'STANDARD' },
    };
    const rawHealth = healthRes?.upstream?.data;
    const normalizedHealth = {
      id: rawHealth?.id || fallbackHealth.id,
      health_status: {
        can_send_message:
          rawHealth?.health_status?.can_send_message ||
          fallbackHealth.health_status.can_send_message,
        entities:
          Array.isArray(rawHealth?.health_status?.entities) && rawHealth.health_status.entities.length > 0
            ? rawHealth.health_status.entities
            : fallbackHealth.health_status.entities,
      },
    };
    const rawPhoneRows = phoneRes?.upstream?.data?.data;
    const normalizedPhoneRows = Array.isArray(rawPhoneRows) && rawPhoneRows.length > 0
      ? rawPhoneRows
      : fallbackPhoneRows;
    const rawBusinessProfile = businessRes?.upstream?.data?.data?.[0];
    const normalizedBusinessProfile = rawBusinessProfile || fallbackBusinessProfile;
    const rawSinglePhone = singleRes?.upstream?.data;
    const normalizedSinglePhone = rawSinglePhone
      ? { ...fallbackSinglePhone, ...rawSinglePhone }
      : fallbackSinglePhone;

    setHealthInfo(normalizedHealth);
    setPhoneNumbersList(normalizedPhoneRows);
    setTemplateList(templates);
    setDashboard({
      waba_id: wabaId,
      phone_number_id: phoneId,
      verified_name: primary?.verified_name || '',
      number: primary?.number || '',
      connection_status: primary?.connection_status || '',
      quality_rating: primary?.quality_rating || '',
      messaging_limit: primary?.messaging_limit || '',
      platform_type: primary?.platform_type || '',
      name_status:
        nameRes?.upstream?.data?.name_status ||
        rawSinglePhone?.name_status ||
        primary?.name_status ||
        'UNKNOWN',
      can_send_message: normalizedHealth.health_status.can_send_message,
      templates_count: templates.length,
      business_profile: normalizedBusinessProfile,
      single_phone_details: normalizedSinglePhone,
    });
    setSectionWarnings(warnings);
  }, [invokeWaba, safeInvokeWaba]);

  const loadWebhook = useCallback(async () => {
    const [data, eventsData] = await Promise.all([
      invokeWaba('get_webhook_whatsapp'),
      invokeWaba('get_webhook_events', { limit: 30 }),
    ]);
    const webhookData = data?.upstream?.data?.data;
    const row = Array.isArray(webhookData)
      ? (webhookData[0] || { webhook_url: '', webhook_status: 'disable' })
      : (webhookData || { webhook_url: '', webhook_status: 'disable' });
    setWebhook(row);
    setWebhookEvents(eventsData?.events || []);
    setWebhookStatusEdit((row.webhook_status || 'disable').toLowerCase());
    setWebhookUrlEdit(row.webhook_url || webhookUrlEdit);
  }, [invokeWaba, webhookUrlEdit]);

  const loadBalance = useCallback(async () => {
    const data = await invokeWaba('get_wallet_balance');
    setWallet(data?.upstream?.data || null);
  }, [invokeWaba]);

  const loadAnalytics = useCallback(async () => {
    const [logsRes, summaryRes] = await Promise.all([
      invokeWaba('get_whatsapp_logs', { from: logsFrom, to: logsTo }),
      invokeWaba('get_whatsapp_summary', { from: summaryFrom, to: summaryTo }),
    ]);
    setLogs(logsRes?.upstream?.data?.data || []);
    setSummary(summaryRes?.upstream?.data?.data || null);
  }, [invokeWaba, logsFrom, logsTo, summaryFrom, summaryTo]);

  const loadTemplateSection = useCallback(async () => {
    const warnings = [];
    const [basicTemplates, numberData] = await Promise.all([
      invokeWaba('get_waba_and_templates', { type: 'template' }),
      invokeWaba('get_waba_and_templates', { type: 'number' }),
    ]);
    const numberPrimary = numberData?.upstream?.data?.data?.[0] || null;
    const flattened = (basicTemplates?.upstream?.data?.data || []).flatMap((entry) => {
      const meta = {
        waba_id: String(entry?.waba_id || ''),
        phone_number_id: String(entry?.phone_number_id || ''),
        number: entry?.number || '',
        verified_name: entry?.verified_name || '',
      };
      return (entry?.templates || []).map((tpl) => ({
        ...meta,
        message_id: tpl?.message_id ? String(tpl.message_id) : '',
        template_id: tpl?.template_id ? String(tpl.template_id) : '',
        template_name: tpl?.template_name || '',
        category: tpl?.category || '',
        status: tpl?.status || '',
        language: tpl?.language || '',
        var_count: tpl?.var_count || 0,
        components: tpl?.components || [],
      }));
    });
    const messageIds = flattened.map((row) => String(row?.message_id || '').trim()).filter(Boolean);
    let assignmentsByMessageId = {};
    if (messageIds.length > 0) {
      const assignmentFetch = await safeInvokeWaba('get_template_media_assignments', { message_ids: messageIds });
      const assignments = Array.isArray(assignmentFetch?.data?.assignments)
        ? assignmentFetch.data.assignments
        : [];
      assignmentsByMessageId = assignments.reduce((acc, item) => {
        const key = String(item?.message_id || '').trim();
        if (!key) return acc;
        acc[key] = item;
        return acc;
      }, {});
      if (assignmentFetch?.error) {
        warnings.push(`Template media mapping unavailable: ${assignmentFetch.error}`);
      }
    }
    setTemplateRows(flattened);
    setTemplateMediaAssignments(assignmentsByMessageId);
    if (!selectedTemplate && flattened.length > 0) {
      const first = flattened[0];
      setSelectedTemplate(first);
      setTestToNumber(String(numberPrimary?.number || '').replace(/^\+/, ''));
    }
    if (flattened.length === 0) warnings.push('No templates returned from mapping API.');
    setSectionWarnings(warnings);
  }, [invokeWaba, safeInvokeWaba, selectedTemplate]);

  const loadTemplateDetail = useCallback(async (template) => {
    if (!template?.template_id) return;
    const detail = await invokeWaba('get_template_by_id', { template_id: template.template_id });
    const d = detail?.upstream?.data || null;
    setTemplateDetail(d);
    const varIds = detectTemplateVarIds(d?.components || template?.components || []);
    const initial = {};
    for (const id of varIds) initial[String(id)] = '';
    setTestVarValues(initial);
    const savedMediaUrl = String(
      templateMediaAssignments?.[String(template?.message_id || '')]?.media_url || '',
    ).trim();
    setTestMediaUrl(savedMediaUrl);
  }, [invokeWaba, templateMediaAssignments]);

  const saveTemplateMediaAssignment = useCallback(async (template, mediaUrl) => {
    const normalizedMediaUrl = String(mediaUrl || '').trim();
    if (!template?.message_id || !template?.phone_number_id || !normalizedMediaUrl) return null;
    const result = await invokeWaba('set_template_media_assignment', {
      message_id: String(template.message_id),
      phone_number_id: String(template.phone_number_id),
      template_id: String(template.template_id || ''),
      template_name: String(template.template_name || ''),
      media_url: normalizedMediaUrl,
    });
    const assignment = result?.assignment || null;
    if (assignment?.message_id) {
      setTemplateMediaAssignments((prev) => ({
        ...prev,
        [String(assignment.message_id)]: assignment,
      }));
    }
    return assignment;
  }, [invokeWaba]);

  const uploadTemplateMediaFile = async (file) => {
    if (!file) return;
    setMediaUploadBusy(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated. Please log in again.');
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'whatsapp/template-media');
      form.append('filename', file.name || 'header-media');
      const { data, error: uploadError } = await supabase.functions.invoke('upload-to-r2', {
        body: form,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (uploadError) throw uploadError;
      if (!data?.ok) throw new Error(data?.error || 'Upload failed');
      const uploadedUrl = String(data?.public_url || data?.url || '').trim();
      if (!uploadedUrl) throw new Error('Uploaded file URL missing. Set R2_PUBLIC_BASE_URL.');
      setTestMediaUrl(uploadedUrl);
      if (selectedTemplate?.message_id && selectedTemplate?.phone_number_id) {
        await saveTemplateMediaAssignment(selectedTemplate, uploadedUrl);
      }
    } catch (e) {
      setError(e.message || 'Failed to upload media file.');
    } finally {
      setMediaUploadBusy(false);
    }
  };

  const refreshActiveTab = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (activeSubTab === 'details') await loadDetails();
      if (activeSubTab === 'template') await loadTemplateSection();
      if (activeSubTab === 'webhook') await loadWebhook();
      if (activeSubTab === 'balance') await loadBalance();
      if (activeSubTab === 'analytics') await loadAnalytics();
      setLastSyncAt(new Date().toISOString());
      if (activeSubTab !== 'details' && activeSubTab !== 'template') setSectionWarnings([]);
    } catch (e) {
      setError(e.message || 'Failed to load section');
    } finally {
      setLoading(false);
    }
  }, [activeSubTab, loadAnalytics, loadBalance, loadDetails, loadTemplateSection, loadWebhook]);

  useEffect(() => { refreshActiveTab(); }, [refreshActiveTab]);
  useEffect(() => {
    if (activeSubTab !== 'details') return undefined;
    const timer = setInterval(() => { refreshActiveTab(); }, AUTO_REFRESH_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [activeSubTab, refreshActiveTab]);

  const summaryCards = useMemo(() => summary ? [
    ['Sent', summary.sent], ['Accepted', summary.accepted], ['Delivered', summary.delivered], ['Read', summary.read], ['Pending', summary.pending], ['Failed', summary.failed], ['Rejected', summary.rejected],
  ] : [], [summary]);

  const saveWebhook = async () => {
    setLoading(true);
    setError('');
    try {
      await invokeWaba('set_webhook_whatsapp', { webhook_status: webhookStatusEdit, webhook_url: webhookUrlEdit });
      await loadWebhook();
      setLastSyncAt(new Date().toISOString());
    } catch (e) {
      setError(e.message || 'Failed to update webhook');
    } finally {
      setLoading(false);
    }
  };

  const sendTemplateTest = async () => {
    if (!selectedTemplate?.message_id || !selectedTemplate?.phone_number_id) {
      setError('Select a template with message id and phone number id first.');
      return;
    }
    if (!testToNumber.trim()) {
      setError('Enter test destination number.');
      return;
    }
    const components = templateDetail?.components || selectedTemplate?.components || [];
    const varIds = detectTemplateVarIds(components);
    const missing = varIds.filter((id) => !String(testVarValues[String(id)] || '').trim());
    if (missing.length > 0) {
      setError(`Fill all variable fields: ${missing.map((id) => `{{${id}}}`).join(', ')}`);
      return;
    }
    const variables_values = varIds.map((id) => String(testVarValues[String(id)] || '').trim()).join('|');
    const media_url = String(testMediaUrl || '').trim();
    const mediaRequired = hasTemplateMediaHeader(components);
    if (mediaRequired && !media_url) {
      setError('This template requires header media. Upload/select it once and it will be reused automatically.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mediaRequired && media_url) {
        await saveTemplateMediaAssignment(selectedTemplate, media_url);
      }
      const res = await invokeWaba('send_template_message', {
        message_id: selectedTemplate.message_id,
        phone_number_id: selectedTemplate.phone_number_id,
        numbers: testToNumber.trim(),
        variables_values: variables_values || undefined,
        media_url: media_url || undefined,
      });
      setTestSendResult(res?.upstream?.data || null);
    } catch (e) {
      setError(e.message || 'Failed to send test template.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMediaById = async () => {
    if (!mediaLookupId.trim()) {
      setError('Enter media ID.');
      return;
    }
    if (!selectedTemplate?.phone_number_id) {
      setError('Select template first to detect phone number id.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await invokeWaba('get_media_url', {
        phone_number_id: selectedTemplate.phone_number_id,
        media_id: mediaLookupId.trim(),
      });
      setMediaLookupResult(res?.upstream?.data || null);
    } catch (e) {
      setError(e.message || 'Failed to fetch media URL.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-[#bec9bf]/20 p-5 space-y-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#815500] mb-1">WhatsApp Business API</p>
        <h3 className="text-lg font-bold text-[#004a2b]" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>WABA Dashboard</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUB_TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveSubTab(tab.id)} className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${activeSubTab === tab.id ? 'bg-[#004a2b] text-white border-[#004a2b]' : 'bg-white text-[#004a2b] border-[#bec9bf]/30'}`}>
            <span className="material-symbols-outlined text-sm align-middle mr-1">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-[#bec9bf]/25 bg-[#fbfaf1] px-3 py-2">
        <p className="text-xs text-[#3f4942]">Version: {version} {lastSyncAt ? `| Last Sync: ${new Date(lastSyncAt).toLocaleString('en-IN')}` : ''}</p>
        <button onClick={refreshActiveTab} disabled={loading} className="h-8 px-3 rounded-lg bg-[#004a2b] text-white text-xs font-semibold hover:bg-[#004a2b]/90 disabled:opacity-50">{loading ? 'Refreshing...' : 'Refresh'}</button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {sectionWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
          {sectionWarnings.map((w, i) => <p key={i}>- {w}</p>)}
        </div>
      )}

      {activeSubTab === 'details' && dashboard && (
        <div className="space-y-5">

          {/* ── Section 1: WABA Overview ── */}
          <div className="rounded-xl border border-[#bec9bf]/20 bg-[#fbfaf1] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#bec9bf]/20 bg-[#f0ede0]">
              <span className="material-symbols-outlined text-base text-[#815500]">business</span>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#815500]">WABA Overview</p>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4">
              <InfoItem label="WABA ID" value={dashboard.waba_id} />
              <InfoItem label="Phone Number ID" value={dashboard.phone_number_id} />
              <InfoItem label="Display Number" value={dashboard.number} />
              <InfoItem label="Verified Name" value={dashboard.verified_name} />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Connection Status</p>
                <StatusBadge value={dashboard.connection_status} type="health" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Display Name Status</p>
                <StatusBadge value={dashboard.name_status} type="health" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Quality Rating</p>
                <StatusBadge value={dashboard.quality_rating} type="quality" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Can Send Message</p>
                <StatusBadge value={dashboard.can_send_message} type="health" />
              </div>
              <InfoItem label="Messaging Limit" value={dashboard.messaging_limit} />
              <InfoItem label="Platform Type" value={dashboard.platform_type} />
            </div>
          </div>

          {/* ── Section 2: WABA Health Status ── */}
          <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
              <span className="material-symbols-outlined text-base text-[#004a2b]">monitor_heart</span>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#004a2b]">WABA Health Status</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                <InfoItem label="WABA ID (Health)" value={healthInfo?.id} />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Overall Can Send</p>
                  <StatusBadge value={healthInfo?.health_status?.can_send_message} type="health" />
                </div>
                <InfoItem label="Entities Count" value={String(healthInfo?.health_status?.entities?.length || 0)} />
              </div>
              {Array.isArray(healthInfo?.health_status?.entities) && healthInfo.health_status.entities.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-2">Health Entities</p>
                  <div className="overflow-auto rounded-lg border border-[#bec9bf]/20">
                    <table className="min-w-full text-xs">
                      <thead className="bg-[#f6f4ea]">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-[#3f4942]">Entity Type</th>
                          <th className="px-3 py-2 text-left font-semibold text-[#3f4942]">ID</th>
                          <th className="px-3 py-2 text-left font-semibold text-[#3f4942]">Can Send Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {healthInfo.health_status.entities.map((entity, i) => (
                          <tr key={`${entity?.id || i}`} className="border-t border-[#bec9bf]/15 hover:bg-[#fbfaf1]">
                            <td className="px-3 py-2 font-medium text-[#004a2b]">{entity?.entity_type || '—'}</td>
                            <td className="px-3 py-2 text-[#3f4942] break-all">{entity?.id || '—'}</td>
                            <td className="px-3 py-2"><StatusBadge value={entity?.can_send_message} type="health" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 3: Business Profile ── */}
          {dashboard.business_profile && (
            <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
                <span className="material-symbols-outlined text-base text-[#004a2b]">store</span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#004a2b]">Business Profile</p>
              </div>
              <div className="p-4 flex flex-col sm:flex-row gap-4">
                {dashboard.business_profile.profile_picture_url && (
                  <div className="flex-shrink-0">
                    <img
                      src={dashboard.business_profile.profile_picture_url}
                      alt="Business profile"
                      className="w-20 h-20 rounded-xl object-cover border border-[#bec9bf]/25"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3 flex-1">
                  <InfoItem label="Verified Name" value={dashboard.business_profile.verified_name} />
                  <InfoItem label="Display Phone" value={dashboard.business_profile.display_phone_number} />
                  <InfoItem label="Messaging Product" value={dashboard.business_profile.messaging_product} />
                  <InfoItem label="Vertical / Industry" value={dashboard.business_profile.vertical} />
                  <InfoItem label="About" value={dashboard.business_profile.about} />
                  {dashboard.business_profile.address && <InfoItem label="Address" value={dashboard.business_profile.address} />}
                  {dashboard.business_profile.description && <InfoItem label="Description" value={dashboard.business_profile.description} />}
                  {dashboard.business_profile.email && <InfoItem label="Email" value={dashboard.business_profile.email} />}
                  {Array.isArray(dashboard.business_profile.websites) && dashboard.business_profile.websites.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Websites</p>
                      <div className="space-y-0.5">
                        {dashboard.business_profile.websites.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-[#004a2b] underline underline-offset-2 break-all">{url}</a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Section 4: Single Phone Number Details ── */}
          {dashboard.single_phone_details && (
            <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
                <span className="material-symbols-outlined text-base text-[#004a2b]">phone_iphone</span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#004a2b]">Phone Number Details</p>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4">
                <InfoItem label="Phone Number ID" value={dashboard.single_phone_details.id} />
                <InfoItem label="Display Number" value={dashboard.single_phone_details.display_phone_number} />
                <InfoItem label="Platform Type" value={dashboard.single_phone_details.platform_type} />
                <InfoItem label="Messaging Limit Tier" value={dashboard.single_phone_details.messaging_limit_tier} />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Connection Status</p>
                  <StatusBadge value={dashboard.single_phone_details.status} type="health" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Name Status</p>
                  <StatusBadge value={dashboard.single_phone_details.name_status} type="health" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Code Verification</p>
                  <StatusBadge value={dashboard.single_phone_details.code_verification_status} type="health" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60 mb-1">Official Business Account</p>
                  <StatusBadge value={dashboard.single_phone_details.is_official_business_account ? 'YES' : 'NO'} type="health" />
                </div>
                {dashboard.single_phone_details.throughput?.level && (
                  <InfoItem label="Throughput Level" value={dashboard.single_phone_details.throughput.level} />
                )}
              </div>
            </div>
          )}

          {/* ── Section 5: All Phone Numbers ── */}
          {phoneNumbersList.length > 0 && (
            <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-[#004a2b]">sim_card</span>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#004a2b]">Phone Numbers</p>
                </div>
                <span className="text-[10px] font-semibold text-[#3f4942]/60 bg-[#eef6ef] border border-[#bec9bf]/20 rounded-full px-2 py-0.5">{phoneNumbersList.length} number{phoneNumbersList.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-[#f6f4ea]">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Phone Number ID</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Display Number</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Verified Name</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Platform</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Quality</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Verification</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Status</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Throughput</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#3f4942]">Last Onboarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phoneNumbersList.map((ph, i) => (
                      <tr key={`${ph?.id || i}`} className="border-t border-[#bec9bf]/15 hover:bg-[#fbfaf1]">
                        <td className="px-3 py-2.5 text-[#3f4942] break-all">{ph?.id || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-[#004a2b] whitespace-nowrap">{ph?.display_phone_number || '—'}</td>
                        <td className="px-3 py-2.5 text-[#3f4942]">{ph?.verified_name || '—'}</td>
                        <td className="px-3 py-2.5 text-[#3f4942]">{ph?.platform_type || '—'}</td>
                        <td className="px-3 py-2.5"><StatusBadge value={ph?.quality_rating} type="quality" /></td>
                        <td className="px-3 py-2.5"><StatusBadge value={ph?.code_verification_status} type="health" /></td>
                        <td className="px-3 py-2.5"><StatusBadge value={ph?.status || ph?.connection_status} type="health" /></td>
                        <td className="px-3 py-2.5 text-[#3f4942]">{ph?.throughput?.level || '—'}</td>
                        <td className="px-3 py-2.5 text-[#3f4942] whitespace-nowrap">{ph?.last_onboarded_time ? new Date(ph.last_onboarded_time).toLocaleDateString('en-IN') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


        </div>
      )}

      {activeSubTab === 'template' && (
        <div className="space-y-0">

          {/* ═══ Two-column layout: left = list+detail, right = preview+test ═══ */}
          <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">

            {/* ── LEFT COLUMN: Template list ── */}
            <div className="space-y-4">
              <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-[#f6f4ea] border-b border-[#bec9bf]/20">
                  <p className="text-xs font-bold text-[#004a2b]">Templates</p>
                  <span className="text-[10px] font-semibold text-[#3f4942]/50 bg-white border border-[#bec9bf]/20 rounded-full px-2.5 py-0.5">{templateRows.length}</span>
                </div>
                <div className="divide-y divide-[#bec9bf]/10 max-h-[480px] overflow-y-auto">
                  {templateRows.length === 0 && (
                    <p className="px-4 py-8 text-center text-xs text-[#3f4942]/40">No templates found.</p>
                  )}
                  {templateRows.map((row, idx) => {
                    const isSelected = selectedTemplate?.message_id === row.message_id && selectedTemplate?.template_id === row.template_id;
                    return (
                      <button
                        key={`${row.template_id || row.message_id || idx}`}
                        type="button"
                        onClick={async () => { setSelectedTemplate(row); await loadTemplateDetail(row); }}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${isSelected ? 'bg-[#004a2b]/[0.06]' : 'hover:bg-[#fbfaf1]'}`}
                      >
                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-[#004a2b]' : 'bg-[#bec9bf]/50'}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] font-semibold leading-tight ${isSelected ? 'text-[#004a2b]' : 'text-[#2f3731]'}`}>{row.template_name || '—'}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                            <span className="text-[10px] text-[#3f4942]/50">{row.message_id || '—'}</span>
                            <span className="text-[10px] text-[#3f4942]/30">·</span>
                            <span className="text-[10px] text-[#3f4942]/50 uppercase">{row.category || '—'}</span>
                            <span className="text-[10px] text-[#3f4942]/30">·</span>
                            <span className="text-[10px] text-[#3f4942]/50 uppercase">{row.language || '—'}</span>
                          </div>
                        </div>
                        <StatusBadge value={row.status || 'UNKNOWN'} type="health" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Selected template meta ── */}
              {selectedTemplate && (
                <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
                  <div className="px-4 py-3 bg-[#004a2b]">
                    <p className="text-[10px] uppercase tracking-widest text-white/60 mb-0.5">Selected</p>
                    <p className="text-sm font-bold text-white leading-tight">{selectedTemplate.template_name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <StatusBadge value={selectedTemplate.status} type="health" />
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white">{selectedTemplate.category}</span>
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white uppercase">{selectedTemplate.language}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-[#bec9bf]/10">
                    {[
                      ['Message ID', selectedTemplate.message_id],
                      ['Meta Template ID', selectedTemplate.template_id],
                      ['WABA ID', selectedTemplate.waba_id],
                      ['Phone Number ID', selectedTemplate.phone_number_id],
                      ['Variables', String(selectedTemplate.var_count ?? 0)],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-start justify-between gap-3 px-4 py-2.5">
                        <p className="text-[10px] text-[#3f4942]/50 flex-shrink-0 pt-0.5">{label}</p>
                        <p className="text-[11px] font-semibold text-[#004a2b] text-right break-all">{val || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT COLUMN: Detail + Preview + Test ── */}
            <div className="space-y-4 min-w-0 overflow-hidden">

              {!selectedTemplate && (
                <div className="rounded-xl border border-dashed border-[#bec9bf]/40 bg-[#fbfaf1] flex items-center justify-center py-16">
                  <p className="text-sm text-[#3f4942]/40">Select a template from the list to view details</p>
                </div>
              )}

              {selectedTemplate && (() => {
                const components = templateDetail?.components || selectedTemplate?.components || [];
                const header = components.find((c) => c?.type === 'HEADER');
                const body = components.find((c) => c?.type === 'BODY');
                const footer = components.find((c) => c?.type === 'FOOTER');
                const buttonsComp = components.find((c) => c?.type === 'BUTTONS');
                const buttons = buttonsComp?.buttons || [];
                const headerFormat = String(header?.format || '').toUpperCase();
                const isMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat);
                const sampleMediaUrl = detectTemplateMediaUrl(components);
                const hasSampleMedia = Boolean(sampleMediaUrl);
                const mediaRequired = hasTemplateMediaHeader(components);
                const savedAssignment = templateMediaAssignments?.[String(selectedTemplate?.message_id || '')] || null;
                const varIds = detectTemplateVarIds(components);

                return (
                  <>
                    {/* ── Template Components ── */}
                    <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
                        <p className="text-xs font-bold text-[#004a2b]">Template Components</p>
                      </div>
                      <div className="p-4 space-y-3">

                        {/* HEADER */}
                        {header && (
                          <div className="rounded-lg border border-[#bec9bf]/20 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border-b border-violet-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Header{headerFormat ? ` · ${headerFormat}` : ''}</p>
                            </div>
                            <div className="px-4 py-3 space-y-2 bg-white min-w-0">
                              {header.text && (
                                <p className="text-sm text-[#2f3731] font-medium break-words">{header.text}</p>
                              )}
                              {isMediaHeader && (
                                <div className="flex items-center gap-2 text-[11px] text-[#3f4942]/60">
                                  <span className="material-symbols-outlined text-sm text-violet-400">
                                    {headerFormat === 'IMAGE' ? 'image' : headerFormat === 'VIDEO' ? 'videocam' : 'description'}
                                  </span>
                                  {headerFormat} media required
                                </div>
                              )}
                              {header.example && Object.keys(header.example).length > 0 && (
                                <div className="mt-2">
                                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/40 mb-1.5">Example</p>
                                  <div className="space-y-1">
                                    {(() => {
                                      const headerTexts = header.example?.header_text?.[0]
                                        ? (Array.isArray(header.example.header_text[0]) ? header.example.header_text[0] : [header.example.header_text[0]])
                                        : header.example?.header_handle
                                        ? (Array.isArray(header.example.header_handle) ? header.example.header_handle : [header.example.header_handle])
                                        : [];
                                      return headerTexts.length > 0
                                        ? headerTexts.map((val, i) => (
                                            <div key={i} className="flex items-start gap-2 min-w-0">
                                              <span className="text-[10px] font-bold text-[#004a2b] bg-[#eef6ef] border border-[#004a2b]/15 rounded px-1.5 py-0.5 flex-shrink-0">{`{{${i + 1}}}`}</span>
                                              <span className="text-[10px] text-[#3f4942]/40 flex-shrink-0 mt-0.5">→</span>
                                              <span className="text-[11px] font-semibold text-[#2f3731] break-all min-w-0">{val}</span>
                                            </div>
                                          ))
                                        : null;
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* BODY */}
                        {body && (
                          <div className="rounded-lg border border-[#bec9bf]/20 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Body</p>
                              {body.text && extractTemplateVars(body.text).length > 0 && (
                                <div className="ml-auto flex gap-1">
                                  {extractTemplateVars(body.text).map((v) => (
                                    <span key={v} className="inline-flex px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">{v}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="px-4 py-3 bg-white space-y-2">
                              {body.text && (
                                <p className="text-sm text-[#2f3731] leading-relaxed whitespace-pre-wrap break-words">{body.text}</p>
                              )}
                              {body.example && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/40 mb-1.5">Example values</p>
                                  <div className="space-y-1">
                                    {(() => {
                                      const bodyTexts = body.example?.body_text?.[0] || [];
                                      return bodyTexts.length > 0
                                        ? bodyTexts.map((val, i) => (
                                            <div key={i} className="flex items-start gap-2 min-w-0">
                                              <span className="text-[10px] font-bold text-[#004a2b] bg-[#eef6ef] border border-[#004a2b]/15 rounded px-1.5 py-0.5 flex-shrink-0">{`{{${i + 1}}}`}</span>
                                              <span className="text-[10px] text-[#3f4942]/40 flex-shrink-0 mt-0.5">→</span>
                                              <span className="text-[11px] font-semibold text-[#2f3731] break-all min-w-0">{val}</span>
                                            </div>
                                          ))
                                        : null;
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* FOOTER */}
                        {footer && (
                          <div className="rounded-lg border border-[#bec9bf]/20 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Footer</p>
                            </div>
                            <div className="px-4 py-3 bg-white">
                              {footer.text && <p className="text-sm text-[#6b726d]">{footer.text}</p>}
                            </div>
                          </div>
                        )}

                        {/* BUTTONS */}
                        {buttons.length > 0 && (
                          <div className="rounded-lg border border-[#bec9bf]/20 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Buttons</p>
                              <span className="ml-auto text-[10px] text-amber-500">{buttons.length} button{buttons.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="p-3 bg-white grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {buttons.map((btn, bi) => (
                                <div key={bi} className="rounded-lg border border-[#bec9bf]/20 bg-[#fbfaf1] px-3 py-2.5">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-bold uppercase text-[#815500] bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">{btn?.type || 'BTN'}</span>
                                    <span className="text-xs font-semibold text-[#2f3731]">{btn?.text || `Button ${bi + 1}`}</span>
                                  </div>
                                  {btn?.url && (
                                    <p className="text-[10px] text-[#3f4942]/60 break-all leading-relaxed">
                                      {btn.url}
                                      {extractTemplateVars(btn.url).length > 0 && (
                                        <span className="ml-1 font-bold text-[#815500]">({extractTemplateVars(btn.url).join(', ')})</span>
                                      )}
                                    </p>
                                  )}
                                  {btn?.phone_number && <p className="text-[10px] text-[#3f4942]/60">{btn.phone_number}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {components.length === 0 && (
                          <p className="text-xs text-[#3f4942]/40 italic text-center py-4">No component data available.</p>
                        )}
                      </div>
                    </div>

                    {/* ── Media Manager (only for media-header templates) ── */}
                    {isMediaHeader && (
                      <MediaManager
                        template={selectedTemplate}
                        headerFormat={headerFormat}
                        savedAssignment={savedAssignment}
                        sampleMediaUrl={sampleMediaUrl}
                        mediaUploadBusy={mediaUploadBusy}
                        onUpload={uploadTemplateMediaFile}
                        onSave={(url) => saveTemplateMediaAssignment(selectedTemplate, url)}
                        onUseUrl={(url) => setTestMediaUrl(url)}
                        onRemove={async () => {
                          await saveTemplateMediaAssignment(selectedTemplate, '');
                          setTestMediaUrl('');
                        }}
                      />
                    )}

                    {/* ── Preview + Send side by side ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                      {/* WhatsApp Preview */}
                      <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
                          <p className="text-xs font-bold text-[#004a2b]">Preview</p>
                        </div>
                        <div className="p-4">
                          <div className="mx-auto max-w-[280px]">
                            <div className="rounded-2xl border-2 border-[#bec9bf]/30 bg-[#e5ddd5] overflow-hidden shadow-sm">
                              <div className="bg-[#075e54] px-3 py-2 flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-white/20 flex-shrink-0" />
                                <div>
                                  <p className="text-white text-[11px] font-semibold leading-none">{selectedTemplate.verified_name || 'Business'}</p>
                                  <p className="text-white/60 text-[9px]">WhatsApp Business</p>
                                </div>
                              </div>
                              <div className="p-3 min-h-[120px]">
                                <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden max-w-[90%]">
                                  {isMediaHeader && (
                                    <div className="bg-[#f0f0f0] flex items-center justify-center py-5 border-b border-[#e0e0e0] overflow-hidden">
                                      {savedAssignment?.media_url && headerFormat === 'IMAGE' ? (
                                        <img src={savedAssignment.media_url} alt="header" className="w-full h-24 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                      ) : (
                                        <span className="material-symbols-outlined text-2xl text-[#aaa]">
                                          {headerFormat === 'IMAGE' ? 'image' : headerFormat === 'VIDEO' ? 'videocam' : 'description'}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {header?.text && (
                                    <div className="px-3 pt-2.5">
                                      <p className="text-[13px] font-bold text-[#111] leading-snug">{replaceVarsInText(header.text, testVarValues)}</p>
                                    </div>
                                  )}
                                  {body?.text && (
                                    <div className="px-3 py-2">
                                      <p className="text-[12px] text-[#333] leading-relaxed whitespace-pre-wrap">{replaceVarsInText(body.text, testVarValues)}</p>
                                    </div>
                                  )}
                                  {footer?.text && (
                                    <div className="px-3 pb-2">
                                      <p className="text-[10px] text-[#999]">{footer.text}</p>
                                    </div>
                                  )}
                                  <div className="px-3 pb-1.5 flex justify-end">
                                    <p className="text-[9px] text-[#999]">10:30 AM ✓✓</p>
                                  </div>
                                  {buttons.length > 0 && (
                                    <div className="border-t border-[#e0e0e0]">
                                      {buttons.map((btn, bi) => (
                                        <div key={bi} className={`flex items-center justify-center gap-1 py-2 text-[#0a7cff] text-[12px] font-medium ${bi > 0 ? 'border-t border-[#e0e0e0]' : ''}`}>
                                          <span className="material-symbols-outlined text-sm">
                                            {btn?.type === 'URL' ? 'open_in_new' : btn?.type === 'PHONE_NUMBER' ? 'call' : 'reply'}
                                          </span>
                                          {btn?.text || `Button ${bi + 1}`}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Send Test */}
                      <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea] flex items-center justify-between">
                          <p className="text-xs font-bold text-[#815500]">Send Test</p>
                          {isMediaHeader && savedAssignment?.media_url && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                              <span className="material-symbols-outlined text-sm">check_circle</span>
                              Media ready
                            </span>
                          )}
                        </div>
                        <div className="p-4 space-y-3">

                          <div>
                            <label className="block text-[10px] uppercase tracking-widest text-[#3f4942]/50 mb-1">To Number</label>
                            <input
                              value={testToNumber}
                              onChange={(e) => setTestToNumber(e.target.value)}
                              placeholder="91xxxxxxxxxx"
                              className="h-9 px-3 border border-[#bec9bf]/30 rounded-lg text-xs w-full focus:outline-none focus:border-[#004a2b]/50 bg-[#fbfaf1]"
                            />
                          </div>

                          {varIds.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50">Variables</p>
                              {varIds.map((id) => (
                                <div key={id} className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-[#004a2b] bg-[#eef6ef] border border-[#004a2b]/15 rounded px-1.5 py-1 flex-shrink-0">{`{{${id}}}`}</span>
                                  <input
                                    value={testVarValues[String(id)] || ''}
                                    onChange={(e) => setTestVarValues((prev) => ({ ...prev, [String(id)]: e.target.value }))}
                                    placeholder={`Value for {{${id}}}`}
                                    className="flex-1 h-8 px-2.5 border border-[#bec9bf]/30 rounded-lg text-xs focus:outline-none focus:border-[#004a2b]/50 bg-[#fbfaf1]"
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Media selector — only shown for media-header templates */}
                          {isMediaHeader && (
                            <div className="rounded-lg border border-[#bec9bf]/20 bg-[#fbfaf1] p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50 font-semibold">Header Media</p>
                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Required</span>
                              </div>

                              {/* Saved media option */}
                              {savedAssignment?.media_url && (
                                <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${testMediaUrl === savedAssignment.media_url ? 'border-[#004a2b] bg-[#eef6ef]' : 'border-[#bec9bf]/30 bg-white hover:bg-[#f6f4ea]'}`}>
                                  <input
                                    type="radio"
                                    name={`media-${selectedTemplate.message_id}`}
                                    checked={testMediaUrl === savedAssignment.media_url}
                                    onChange={() => setTestMediaUrl(savedAssignment.media_url)}
                                    className="accent-[#004a2b]"
                                  />
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {headerFormat === 'IMAGE' && (
                                      <img src={savedAssignment.media_url} alt="" className="w-8 h-8 rounded object-cover border border-[#bec9bf]/20 flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    )}
                                    {headerFormat !== 'IMAGE' && (
                                      <span className="material-symbols-outlined text-base text-[#004a2b] flex-shrink-0">
                                        {headerFormat === 'VIDEO' ? 'videocam' : 'description'}
                                      </span>
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-semibold text-[#004a2b]">Saved media</p>
                                      <p className="text-[10px] text-[#3f4942]/50 truncate">{savedAssignment.media_url}</p>
                                    </div>
                                  </div>
                                  {testMediaUrl === savedAssignment.media_url && (
                                    <span className="material-symbols-outlined text-sm text-[#004a2b] flex-shrink-0">check_circle</span>
                                  )}
                                </label>
                              )}

                              {/* Sample media option */}
                              {hasSampleMedia && sampleMediaUrl !== savedAssignment?.media_url && (
                                <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${testMediaUrl === sampleMediaUrl ? 'border-[#004a2b] bg-[#eef6ef]' : 'border-[#bec9bf]/30 bg-white hover:bg-[#f6f4ea]'}`}>
                                  <input
                                    type="radio"
                                    name={`media-${selectedTemplate.message_id}`}
                                    checked={testMediaUrl === sampleMediaUrl}
                                    onChange={() => setTestMediaUrl(sampleMediaUrl)}
                                    className="accent-[#004a2b]"
                                  />
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="material-symbols-outlined text-base text-[#3f4942]/50 flex-shrink-0">image</span>
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-semibold text-[#3f4942]">Template sample</p>
                                      <p className="text-[10px] text-[#3f4942]/50 truncate">{sampleMediaUrl}</p>
                                    </div>
                                  </div>
                                </label>
                              )}

                              {/* Custom URL option */}
                              <label className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${testMediaUrl !== savedAssignment?.media_url && testMediaUrl !== sampleMediaUrl ? 'border-[#004a2b] bg-[#eef6ef]' : 'border-[#bec9bf]/30 bg-white hover:bg-[#f6f4ea]'}`}>
                                <input
                                  type="radio"
                                  name={`media-${selectedTemplate.message_id}`}
                                  checked={testMediaUrl !== savedAssignment?.media_url && testMediaUrl !== sampleMediaUrl}
                                  onChange={() => setTestMediaUrl('')}
                                  className="accent-[#004a2b] mt-0.5"
                                />
                                <div className="flex-1 space-y-1.5">
                                  <p className="text-[11px] font-semibold text-[#3f4942]">Custom URL</p>
                                  {testMediaUrl !== savedAssignment?.media_url && testMediaUrl !== sampleMediaUrl && (
                                    <input
                                      value={testMediaUrl}
                                      onChange={(e) => setTestMediaUrl(e.target.value)}
                                      placeholder="https://cdn.example.com/image.jpg"
                                      className="h-8 px-2.5 border border-[#bec9bf]/30 rounded-lg text-xs w-full focus:outline-none focus:border-[#004a2b]/50 bg-white"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                </div>
                              </label>

                              {!savedAssignment?.media_url && !hasSampleMedia && (
                                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-sm">warning</span>
                                  No saved media yet. Upload one in the Media Manager above.
                                </p>
                              )}
                            </div>
                          )}

                          <button
                            onClick={sendTemplateTest}
                            disabled={loading}
                            className="w-full h-9 rounded-lg bg-[#815500] text-white text-xs font-bold hover:bg-[#815500]/90 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <span className="material-symbols-outlined text-sm">send</span>
                            {loading ? 'Sending…' : 'Send Test Message'}
                          </button>

                          {testSendResult && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1.5">Result</p>
                              <div className="flex justify-between text-[11px]"><span className="text-[#3f4942]/60">Status</span><span className="font-semibold text-[#004a2b]">{String(testSendResult.status)}</span></div>
                              <div className="flex justify-between text-[11px]"><span className="text-[#3f4942]/60">Message</span><span className="font-semibold text-[#004a2b]">{testSendResult.message}</span></div>
                              <div className="flex justify-between text-[11px]"><span className="text-[#3f4942]/60">Request ID</span><span className="font-semibold text-[#004a2b] break-all">{testSendResult.request_id}</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Media Lookup ── */}
                    <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
                        <p className="text-xs font-bold text-[#004a2b]">Get Media URL by Media ID</p>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex gap-2">
                          <input
                            value={mediaLookupId}
                            onChange={(e) => setMediaLookupId(e.target.value)}
                            placeholder="Enter Media ID"
                            className="flex-1 h-9 px-3 border border-[#bec9bf]/30 rounded-lg text-xs focus:outline-none focus:border-[#004a2b]/50 bg-[#fbfaf1]"
                          />
                          <button
                            onClick={fetchMediaById}
                            disabled={loading}
                            className="h-9 px-4 rounded-lg bg-[#004a2b] text-white text-xs font-bold hover:bg-[#004a2b]/90 disabled:opacity-50"
                          >
                            {loading ? 'Fetching…' : 'Fetch'}
                          </button>
                        </div>
                        {mediaLookupResult && (
                          <div className="rounded-lg border border-[#bec9bf]/20 bg-[#fbfaf1] divide-y divide-[#bec9bf]/10">
                            {[
                              ['Media ID', mediaLookupResult.id],
                              ['Mime Type', mediaLookupResult.mime_type],
                              ['File Size', String(mediaLookupResult.file_size || '')],
                              ['SHA256', mediaLookupResult.sha256],
                              ['URL', mediaLookupResult.url],
                            ].map(([label, val]) => (
                              <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                                <p className="text-[10px] text-[#3f4942]/50 flex-shrink-0 pt-0.5">{label}</p>
                                <p className="text-[11px] font-semibold text-[#004a2b] text-right break-all">{val || '—'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

            </div>
          </div>

        </div>
      )}
      {activeSubTab === 'analytics' && (
        <div className="space-y-5">

          {/* ── Date Filters ── */}
          <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
              <span className="material-symbols-outlined text-base text-[#004a2b]">calendar_month</span>
              <p className="text-xs font-bold text-[#004a2b]">Date Range</p>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50 font-semibold">Logs (last 3 days max)</p>
                <div className="flex items-center gap-2">
                  <input type="date" value={logsFrom} onChange={(e) => setLogsFrom(e.target.value)} className="flex-1 h-9 px-3 border border-[#bec9bf]/30 rounded-lg text-xs bg-[#fbfaf1] focus:outline-none focus:border-[#004a2b]/40" />
                  <span className="text-[10px] text-[#3f4942]/40">to</span>
                  <input type="date" value={logsTo} onChange={(e) => setLogsTo(e.target.value)} className="flex-1 h-9 px-3 border border-[#bec9bf]/30 rounded-lg text-xs bg-[#fbfaf1] focus:outline-none focus:border-[#004a2b]/40" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50 font-semibold">Summary (30-day interval)</p>
                <div className="flex items-center gap-2">
                  <input type="date" value={summaryFrom} onChange={(e) => setSummaryFrom(e.target.value)} className="flex-1 h-9 px-3 border border-[#bec9bf]/30 rounded-lg text-xs bg-[#fbfaf1] focus:outline-none focus:border-[#004a2b]/40" />
                  <span className="text-[10px] text-[#3f4942]/40">to</span>
                  <input type="date" value={summaryTo} onChange={(e) => setSummaryTo(e.target.value)} className="flex-1 h-9 px-3 border border-[#bec9bf]/30 rounded-lg text-xs bg-[#fbfaf1] focus:outline-none focus:border-[#004a2b]/40" />
                </div>
              </div>
            </div>
            <div className="px-4 pb-4">
              <button onClick={loadAnalytics} disabled={loading} className="h-9 px-4 rounded-lg bg-[#004a2b] text-white text-xs font-bold hover:bg-[#004a2b]/90 disabled:opacity-50 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">refresh</span>
                {loading ? 'Loading…' : 'Load Analytics'}
              </button>
            </div>
          </div>

          {/* ── Summary Cards ── */}
          {summary && (() => {
            const cards = [
              { label: 'Sent',      value: summary.sent,      icon: 'send',            color: 'text-[#004a2b] bg-[#eef6ef] border-[#004a2b]/15' },
              { label: 'Accepted',  value: summary.accepted,  icon: 'check',           color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { label: 'Delivered', value: summary.delivered, icon: 'done_all',        color: 'text-blue-700 bg-blue-50 border-blue-200' },
              { label: 'Read',      value: summary.read,      icon: 'mark_email_read', color: 'text-violet-700 bg-violet-50 border-violet-200' },
              { label: 'Pending',   value: summary.pending,   icon: 'schedule',        color: 'text-amber-700 bg-amber-50 border-amber-200' },
              { label: 'Failed',    value: summary.failed,    icon: 'error',           color: 'text-red-700 bg-red-50 border-red-200' },
              { label: 'Rejected',  value: summary.rejected,  icon: 'block',           color: 'text-slate-600 bg-slate-50 border-slate-200' },
            ];
            const total = (summary.sent || 0) + (summary.accepted || 0);
            return (
              <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-[#004a2b]">bar_chart</span>
                    <p className="text-xs font-bold text-[#004a2b]">Summary</p>
                  </div>
                  <span className="text-[10px] text-[#3f4942]/50">{summaryFrom} → {summaryTo}</span>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {cards.map(({ label, value, icon, color }) => (
                    <div key={label} className={`rounded-xl border p-3 space-y-2 ${color}`}>
                      <div className="flex items-center justify-between">
                        <span className="material-symbols-outlined text-base">{icon}</span>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
                      </div>
                      <p className="text-2xl font-bold leading-none">{Number(value || 0)}</p>
                      {total > 0 && (
                        <div className="w-full bg-black/10 rounded-full h-1">
                          <div className="bg-current h-1 rounded-full opacity-50" style={{ width: `${Math.min(100, Math.round((Number(value || 0) / total) * 100))}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Logs Table ── */}
          <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-[#004a2b]">receipt_long</span>
                <p className="text-xs font-bold text-[#004a2b]">WhatsApp Logs</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#3f4942]/50">{logsFrom} → {logsTo}</span>
                {logs.length > 0 && (
                  <span className="text-[10px] font-semibold text-[#3f4942]/50 bg-white border border-[#bec9bf]/20 rounded-full px-2.5 py-0.5">{logs.length}</span>
                )}
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <span className="material-symbols-outlined text-3xl text-[#bec9bf]/60 block mb-2">inbox</span>
                <p className="text-xs text-[#3f4942]/40">No logs for the selected date range.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-[#f6f4ea] border-b border-[#bec9bf]/20">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#3f4942] whitespace-nowrap">Type</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#3f4942] whitespace-nowrap">Request / Message ID</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#3f4942] whitespace-nowrap">Phone Number ID</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#3f4942] whitespace-nowrap">Recipient / From</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#3f4942] whitespace-nowrap">Status / Msg Type</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#3f4942] whitespace-nowrap">Body / Errors</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[#3f4942] whitespace-nowrap">Timestamp (IST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((r, i) => {
                      const isIncoming = String(r.type || '').toLowerCase().includes('incoming');
                      const isStatus = String(r.type || '').toLowerCase().includes('status');
                      const typeColor = isIncoming
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : isStatus
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200';
                      const bodyOrError = isIncoming
                        ? (r.body || '—')
                        : (r.errors ? (typeof r.errors === 'string' ? r.errors : JSON.stringify(r.errors)) : '—');
                      return (
                        <tr key={`${r.request_id || r.message_id || i}`} className="border-t border-[#bec9bf]/10 hover:bg-[#fbfaf1]">
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${typeColor}`}>
                              {r.type || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-[#3f4942] font-mono text-[10px] max-w-[160px] truncate" title={r.request_id || r.message_id || ''}>
                            {r.request_id || r.message_id || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-[#3f4942] font-mono text-[10px]">{r.phone_number_id || '—'}</td>
                          <td className="px-4 py-2.5 text-[#3f4942] font-semibold">{r.recipient_id || r.from || '—'}</td>
                          <td className="px-4 py-2.5">
                            {(r.status || r.message_type)
                              ? <StatusBadge value={r.status || r.message_type} type="health" />
                              : <span className="text-[#3f4942]/40">—</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-[#3f4942] max-w-[200px]">
                            <p className="truncate text-[11px]" title={bodyOrError}>{bodyOrError}</p>
                            {isIncoming && r.context?.replied_to_message_id && (
                              <p className="text-[10px] text-[#3f4942]/40 mt-0.5 truncate">↩ {r.context.replied_to_message_id}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[#3f4942]/70 whitespace-nowrap text-[11px]">{formatIstDateTime(r.timestamp)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {activeSubTab === 'balance' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-[#bec9bf]/20 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#bec9bf]/20 bg-[#f6f4ea]">
              <span className="material-symbols-outlined text-base text-[#004a2b]">account_balance_wallet</span>
              <p className="text-xs font-bold text-[#004a2b]">Fast2SMS Wallet</p>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-[#004a2b]/15 bg-[#eef6ef] p-4">
                <p className="text-[10px] uppercase tracking-widest text-[#004a2b]/60 mb-1">Wallet Balance</p>
                <p className="text-3xl font-bold text-[#004a2b]">₹{wallet?.wallet || '0.00'}</p>
              </div>
              <div className="rounded-xl border border-[#bec9bf]/20 bg-[#fbfaf1] p-4">
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50 mb-1">SMS Count</p>
                <p className="text-3xl font-bold text-[#2f3731]">{wallet?.sms_count ?? 0}</p>
              </div>
              <div className="rounded-xl border border-[#bec9bf]/20 bg-[#fbfaf1] p-4">
                <p className="text-[10px] uppercase tracking-widest text-[#3f4942]/50 mb-1">Return</p>
                <p className="text-3xl font-bold text-[#2f3731]">{String(wallet?.return || '—')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'webhook' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#bec9bf]/20 bg-white p-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-[#3f4942]/70 mb-2">Current Fast2SMS Webhook</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoItem label="Webhook URL" value={webhook.webhook_url} />
              <div><p className="text-[10px] uppercase tracking-widest text-[#3f4942]/60">Webhook Status</p><StatusBadge value={webhook.webhook_status} type="health" /></div>
            </div>
          </div>
          <div className="rounded-xl border border-[#bec9bf]/20 bg-white p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-[#3f4942]/70">Update Fast2SMS Webhook</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={webhookUrlEdit} onChange={(e) => setWebhookUrlEdit(e.target.value)} className="md:col-span-2 h-9 px-3 border rounded-lg text-xs" placeholder="Webhook URL" />
              <select value={webhookStatusEdit} onChange={(e) => setWebhookStatusEdit(e.target.value)} className="h-9 px-3 border rounded-lg text-xs bg-white"><option value="enable">enable</option><option value="disable">disable</option></select>
            </div>
            <button onClick={saveWebhook} disabled={loading} className="h-8 px-3 rounded-lg bg-[#815500] text-white text-xs font-semibold">{loading ? 'Saving...' : 'Save Webhook'}</button>
          </div>
          <div className="rounded-xl border border-[#bec9bf]/20 bg-[#fbfaf1] p-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-[#3f4942]/70 mb-1">Existing Webhook Receiver</p>
            <p className="text-xs text-[#3f4942] break-all">https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/send-whatsapp</p>
          </div>

          <div className="rounded-xl border border-[#bec9bf]/20 bg-white p-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-[#3f4942]/70 mb-2">Recent Incoming Webhook Events</p>
            <div className="overflow-auto rounded-lg border border-[#bec9bf]/20">
              <table className="min-w-full text-xs">
                <thead className="bg-[#f6f4ea]">
                  <tr>
                    <th className="px-3 py-2 text-left">Received At</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Message / Request ID</th>
                    <th className="px-3 py-2 text-left">Phone Number ID</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookEvents.map((event) => (
                    <tr key={event.id} className="border-t border-[#bec9bf]/15">
                      <td className="px-3 py-2">{event.created_at ? new Date(event.created_at).toLocaleString('en-IN') : '—'}</td>
                      <td className="px-3 py-2">{event.event_type || '—'}</td>
                      <td className="px-3 py-2">{event.message_id || event.request_id || '—'}</td>
                      <td className="px-3 py-2">{event.phone_number_id || '—'}</td>
                      <td className="px-3 py-2"><StatusBadge value={event.status || event.message_type || 'unknown'} type="health" /></td>
                    </tr>
                  ))}
                  {webhookEvents.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-[#3f4942]/70" colSpan={5}>No webhook events received yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
