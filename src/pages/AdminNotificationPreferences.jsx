import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminNotificationService } from '../services/adminNotificationService';
import { ADMIN_MODULES } from '../lib/adminModules';
import { ADMIN_NOTIFICATION_EVENTS } from '../lib/adminNotificationEvents';
import { webPushService } from '../services/webPushService';

export default function AdminNotificationPreferences() {
  const navigate = useNavigate();
  const { user, isAdmin, hasModule, loading } = useAuth();
  const [prefLoading, setPrefLoading] = useState(true);
  const [prefs, setPrefs] = useState([]);
  const [savingModule, setSavingModule] = useState('');
  const [savingEventKey, setSavingEventKey] = useState('');
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [pushSupported, setPushSupported] = useState(true);
  const [enablingPush, setEnablingPush] = useState(false);
  const [hasPushSubscription, setHasPushSubscription] = useState(false);

  const canUsePage = isAdmin || ADMIN_MODULES.some((mod) => hasModule(mod.id));

  useEffect(() => {
    if (!loading && !canUsePage) {
      navigate('/access-denied');
    }
  }, [loading, canUsePage, navigate]);

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

  const loadPrefs = useCallback(async () => {
    if (!user?.id) return;
    setPrefLoading(true);
    try {
      const rows = await adminNotificationService.listPreferences(user.id);
      setPrefs(rows);
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    } finally {
      setPrefLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (canUsePage && user?.id) loadPrefs();
  }, [canUsePage, user?.id, loadPrefs]);

  const moduleEnabled = useCallback((moduleName) => {
    const row = prefs.find((p) => p.module === moduleName && p.event_type === '*');
    return row ? row.in_app_enabled !== false : true;
  }, [prefs]);

  const eventEnabled = useCallback((moduleName, eventType) => {
    const eventRow = prefs.find((p) => p.module === moduleName && p.event_type === eventType);
    if (eventRow) return eventRow.in_app_enabled !== false;
    return moduleEnabled(moduleName);
  }, [prefs, moduleEnabled]);

  const visibleModules = useMemo(() => {
    if (isAdmin) return ADMIN_MODULES;
    return ADMIN_MODULES.filter((mod) => hasModule(mod.id));
  }, [isAdmin, hasModule]);

  const handleToggle = async (moduleName) => {
    if (!user?.id) return;
    const next = !moduleEnabled(moduleName);
    setSavingModule(moduleName);
    try {
      await adminNotificationService.upsertModulePreference(user.id, moduleName, next);
      await loadPrefs();
    } catch (error) {
      console.error('Failed to save module preference:', error);
    } finally {
      setSavingModule('');
    }
  };

  const handleEventToggle = async (moduleName, eventType) => {
    if (!user?.id) return;
    const key = `${moduleName}:${eventType}`;
    const next = !eventEnabled(moduleName, eventType);
    setSavingEventKey(key);
    try {
      await adminNotificationService.upsertEventPreference(user.id, moduleName, eventType, next);
      await loadPrefs();
    } catch (error) {
      console.error('Failed to save event preference:', error);
    } finally {
      setSavingEventKey('');
    }
  };

  const handleResetModule = async (moduleName) => {
    if (!user?.id) return;
    setSavingModule(moduleName);
    try {
      await adminNotificationService.resetModulePreferences(user.id, moduleName);
      await loadPrefs();
    } catch (error) {
      console.error('Failed to reset module preferences:', error);
    } finally {
      setSavingModule('');
    }
  };

  const handleEnableAlerts = async () => {
    if (!pushSupported || !user?.id) return;
    setEnablingPush(true);
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        const next = await Notification.requestPermission();
        setNotificationPermission(next);
      }
      await webPushService.ensureSubscribed(user.id);
      await refreshPushState();
    } catch (error) {
      console.error('Enable alerts failed:', error);
    } finally {
      setEnablingPush(false);
    }
  };

  const alertsOn = pushSupported && notificationPermission === 'granted' && hasPushSubscription;
  const actionLabel = alertsOn ? 'On' : 'Re-initiate';

  if (loading || (!canUsePage && !loading)) {
    return (!canUsePage && !loading) ? <Navigate to="/access-denied" replace /> : null;
  }

  return (
    <main className="min-h-screen bg-surface pt-6 pb-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Link to="/admin" className="text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </Link>
            <h1 className="font-brand text-4xl text-primary tracking-tight">Notification Preferences</h1>
          </div>
          <p className="text-on-surface-variant md:ml-8">Control which module notifications appear in your admin bell.</p>
        </header>

        {(!pushSupported || notificationPermission === 'denied' || !hasPushSubscription) && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">
              {(notificationPermission === 'denied' || !pushSupported) ? 'Browser notifications are blocked' : 'Notifications are not initialized'}
            </p>
            <p className="text-xs text-amber-700 mt-1">
              This affects both admin and employee alerts. Enable notifications in browser site settings to receive desktop/mobile push alerts.
            </p>
            <button
              onClick={handleEnableAlerts}
              disabled={enablingPush || !pushSupported || alertsOn}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-400/70 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-sm">notifications_active</span>
              {enablingPush ? 'Re-initiating...' : `Notifications ${actionLabel}`}
            </button>
          </div>
        )}

        <section className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/20">
            <h2 className="font-semibold text-on-surface">Module Controls</h2>
            <p className="text-xs text-on-surface-variant mt-1">Set module-level and event-level notification controls. Defaults are ON.</p>
          </div>

          {prefLoading ? (
            <div className="p-10 text-center">
              <span className="material-symbols-outlined animate-spin text-3xl text-secondary">progress_activity</span>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/20">
              {visibleModules.map((moduleDef) => {
                const enabled = moduleEnabled(moduleDef.id);
                const isSaving = savingModule === moduleDef.id;
                return (
                  <div key={moduleDef.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enabled ? 'bg-primary/10 text-primary' : 'bg-surface text-on-surface-variant/50'}`}>
                          <span className="material-symbols-outlined text-lg">{moduleDef.icon}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-on-surface">{moduleDef.label}</p>
                          <p className="text-xs text-on-surface-variant">{enabled ? 'Enabled' : 'Muted'} for in-app bell notifications</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResetModule(moduleDef.id)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold border border-outline-variant/40 text-on-surface-variant hover:bg-surface disabled:opacity-60"
                        >
                          <span className="material-symbols-outlined text-sm">restart_alt</span>
                          Reset
                        </button>
                        <button
                          onClick={() => handleToggle(moduleDef.id)}
                          disabled={isSaving}
                          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border transition ${
                            enabled
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          } disabled:opacity-60`}
                        >
                          {isSaving ? (
                            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                          ) : (
                            <span className="material-symbols-outlined text-base">{enabled ? 'notifications_active' : 'notifications_off'}</span>
                          )}
                          {enabled ? 'Enabled' : 'Muted'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface px-3 py-3">
                      <p className="text-xs font-semibold text-on-surface-variant mb-2">Event-level controls</p>
                      {(ADMIN_NOTIFICATION_EVENTS[moduleDef.id] || []).length === 0 ? (
                        <p className="text-xs text-on-surface-variant">No event-level rules configured yet for this module.</p>
                      ) : (
                        <div className="space-y-2">
                          {ADMIN_NOTIFICATION_EVENTS[moduleDef.id].map((eventDef) => {
                            const key = `${moduleDef.id}:${eventDef.id}`;
                            const eventOn = eventEnabled(moduleDef.id, eventDef.id);
                            const eventSaving = savingEventKey === key;
                            return (
                              <div key={eventDef.id} className="flex items-center justify-between gap-2">
                                <p className="text-sm text-on-surface">{eventDef.label}</p>
                                <button
                                  onClick={() => handleEventToggle(moduleDef.id, eventDef.id)}
                                  disabled={eventSaving}
                                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                                    eventOn
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-slate-100 text-slate-700 border-slate-200'
                                  } disabled:opacity-60`}
                                >
                                  {eventSaving ? (
                                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                  ) : (
                                    <span className="material-symbols-outlined text-sm">{eventOn ? 'check_circle' : 'do_not_disturb_on'}</span>
                                  )}
                                  {eventOn ? 'On' : 'Off'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
