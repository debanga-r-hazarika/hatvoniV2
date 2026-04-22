import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// All modules that can be assigned to an employee
export const ALL_MODULES = [
  { id: 'orders',    label: 'Orders',    icon: 'package_2' },
  { id: 'logistics', label: 'Logistics', icon: 'local_shipping' },
  { id: 'support',   label: 'Support',   icon: 'support_agent' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory_2' },
  { id: 'coupons',   label: 'Coupons',   icon: 'sell' },
  { id: 'customers', label: 'Customers', icon: 'group' },
  { id: 'sellers',   label: 'Sellers',   icon: 'storefront' },
  { id: 'products',  label: 'Products',  icon: 'category' },
  { id: 'lots',      label: 'Lots',      icon: 'all_inclusive' },
  { id: 'recipes',   label: 'Recipes',   icon: 'restaurant_menu' },
];

export default function AdminEmployees() {
  const { isAdmin, loading, profile: adminProfile } = useAuth();
  const navigate = useNavigate();

  const [employees, setEmployees]       = useState([]);
  const [pageLoading, setPageLoading]   = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [adminProfiles, setAdminProfiles] = useState([]);

  // Customer search panel
  const [customerSearch, setCustomerSearch]     = useState('');
  const [customerResults, setCustomerResults]   = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [promoting, setPromoting]               = useState(null); // profile id being promoted

  // Module assignment modal
  const [moduleModal, setModuleModal]     = useState(null);
  const [savingModules, setSavingModules] = useState(false);
  const [selectedModules, setSelectedModules] = useState([]);

  // Notes modal
  const [notesModal, setNotesModal] = useState(null);
  const [notesValue, setNotesValue] = useState('');

  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!loading && !isAdmin) navigate('/access-denied');
  }, [isAdmin, loading, navigate]);

  // ── Fetch employees ──────────────────────────────────────────────────────
  const fetchEmployees = useCallback(async () => {
    setPageLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select(`
          id, is_active, notes, created_at,
          profile:profiles!employees_profile_id_fkey(id, first_name, last_name, email, avatar_url),
          added_by_profile:profiles!employees_added_by_fkey(first_name, last_name),
          employee_modules(module)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      showToast('Failed to load employees: ' + err.message, 'error');
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchEmployees();
  }, [isAdmin, fetchEmployees]);

  // ── Fetch all admin profiles ─────────────────────────────────────────────
  const fetchAdminProfiles = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .eq('is_admin', true);
      setAdminProfiles(data || []);
    } catch {
      setAdminProfiles([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchAdminProfiles();
  }, [isAdmin, fetchAdminProfiles]);

  // ── Customer search ──────────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q) => {
    if (!q.trim()) { setCustomerResults([]); return; }
    setCustomerSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url, is_employee, is_admin')
        .or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .eq('is_admin', false)
        .limit(10);
      setCustomerResults(data || []);
    } catch {
      setCustomerResults([]);
    } finally {
      setCustomerSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 350);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  // ── Promote customer → employee ──────────────────────────────────────────
  const promoteToEmployee = async (profile) => {
    setPromoting(profile.id);
    try {
      const { error } = await supabase
        .from('employees')
        .insert({ profile_id: profile.id });
      if (error) throw error;
      showToast(`${profile.first_name || profile.email} added as employee`);
      setCustomerSearch('');
      setCustomerResults([]);
      fetchEmployees();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setPromoting(null);
    }
  };

  // ── Toggle active ────────────────────────────────────────────────────────
  const toggleActive = async (emp) => {
    try {
      const { error } = await supabase
        .from('employees')
        .update({ is_active: !emp.is_active, updated_at: new Date().toISOString() })
        .eq('id', emp.id);
      if (error) throw error;
      showToast(emp.is_active ? 'Employee deactivated' : 'Employee reactivated');
      fetchEmployees();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  // ── Remove employee ──────────────────────────────────────────────────────
  const removeEmployee = async (emp) => {
    if (!window.confirm(`Remove ${emp.profile?.first_name || emp.profile?.email} as employee? Their account stays but they lose all module access.`)) return;
    try {
      const { error } = await supabase.from('employees').delete().eq('id', emp.id);
      if (error) throw error;
      showToast('Employee removed');
      fetchEmployees();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  // ── Module assignment ────────────────────────────────────────────────────
  const openModuleModal = (emp) => {
    setSelectedModules((emp.employee_modules || []).map((m) => m.module));
    setModuleModal(emp);
  };

  const toggleModule = (modId) =>
    setSelectedModules((prev) =>
      prev.includes(modId) ? prev.filter((m) => m !== modId) : [...prev, modId]
    );

  const saveModules = async () => {
    if (!moduleModal) return;
    setSavingModules(true);
    try {
      await supabase.from('employee_modules').delete().eq('employee_id', moduleModal.id);
      if (selectedModules.length > 0) {
        const rows = selectedModules.map((mod) => ({ employee_id: moduleModal.id, module: mod }));
        const { error } = await supabase.from('employee_modules').insert(rows);
        if (error) throw error;
      }
      showToast('Modules updated');
      setModuleModal(null);
      fetchEmployees();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSavingModules(false);
    }
  };

  // ── Notes ────────────────────────────────────────────────────────────────
  const openNotesModal = (emp) => {
    setNotesValue(emp.notes || '');
    setNotesModal(emp);
  };

  const saveNotes = async () => {
    if (!notesModal) return;
    try {
      const { error } = await supabase
        .from('employees')
        .update({ notes: notesValue, updated_at: new Date().toISOString() })
        .eq('id', notesModal.id);
      if (error) throw error;
      showToast('Notes saved');
      setNotesModal(null);
      fetchEmployees();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const filtered = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const name = `${emp.profile?.first_name || ''} ${emp.profile?.last_name || ''}`.toLowerCase();
    return name.includes(q) || (emp.profile?.email || '').toLowerCase().includes(q);
  });

  const filteredAdmins = adminProfiles.filter((adm) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const name = `${adm.first_name || ''} ${adm.last_name || ''}`.toLowerCase();
    return name.includes(q) || (adm.email || '').toLowerCase().includes(q);
  });

  const fullName = (p) =>
    [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email || 'Unknown';

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/admin')}
          className="text-gray-400 hover:text-gray-700 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Identity & Module Management</h1>
          <p className="text-sm text-gray-500">Promote customers to employees and control their access</p>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-6">
        {[
          { label: 'Total', value: employees.length + adminProfiles.length, color: 'text-gray-700' },
          { label: 'Admins', value: adminProfiles.length, color: 'text-amber-600' },
          { label: 'Active', value: employees.filter((e) => e.is_active).length, color: 'text-green-600' },
          { label: 'Inactive', value: employees.filter((e) => !e.is_active).length, color: 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
            <span className="text-sm text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Two-column layout ── */}
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Employee list ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Employees</h2>
          </div>

          {/* Search employees */}
          <div className="relative mb-4">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
            <input
              type="text"
              placeholder="Filter employees by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {pageLoading ? (
            <div className="flex justify-center py-16">
              <span className="material-symbols-outlined text-4xl text-gray-300 animate-spin">progress_activity</span>
            </div>
          ) : filtered.length === 0 && filteredAdmins.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 py-14 text-center">
              <span className="material-symbols-outlined text-5xl text-gray-300 block mb-3">badge</span>
              <p className="text-gray-500 font-medium">No employees yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Search for a customer on the right →<br />then click <strong>Add as Employee</strong>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* ── Admin entries (read-only) ── */}
              {filteredAdmins.map((adm) => (
                <div
                  key={`admin-${adm.id}`}
                  className="bg-amber-50 rounded-xl border border-amber-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {adm.avatar_url ? (
                        <img src={adm.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-bold text-sm flex-shrink-0">
                          {(adm.first_name?.[0] || adm.email?.[0] || '?').toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">{fullName(adm)}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-200 text-amber-800">
                            Admin
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{adm.email}</p>
                      </div>
                    </div>
                  </div>
                  {/* All modules chip */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                      <span className="material-symbols-outlined text-xs">verified</span>
                      All Modules
                    </span>
                    {ALL_MODULES.map((mod) => (
                      <span key={mod.id} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                        <span className="material-symbols-outlined text-xs">{mod.icon}</span>
                        {mod.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {/* ── Employee entries ── */}
              {filtered.map((emp) => {
                const modules = (emp.employee_modules || []).map((m) => m.module);
                return (
                  <div
                    key={emp.id}
                    className={`bg-white rounded-xl border p-4 transition-opacity ${emp.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Avatar + info */}
                      <div className="flex items-center gap-3 min-w-0">
                        {emp.profile?.avatar_url ? (
                          <img src={emp.profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                            {(emp.profile?.first_name?.[0] || emp.profile?.email?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">{fullName(emp.profile)}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {emp.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{emp.profile?.email}</p>
                          {emp.notes && (
                            <p className="text-xs text-gray-400 mt-0.5 italic truncate">{emp.notes}</p>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => openModuleModal(emp)}
                          title="Assign modules"
                          className="flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">tune</span>
                          Modules
                        </button>
                        <button
                          onClick={() => openNotesModal(emp)}
                          title="Edit notes"
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">edit_note</span>
                        </button>
                        <button
                          onClick={() => toggleActive(emp)}
                          title={emp.is_active ? 'Deactivate' : 'Reactivate'}
                          className={`p-1.5 rounded-lg transition-colors ${emp.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50'}`}
                        >
                          <span className="material-symbols-outlined text-lg">{emp.is_active ? 'pause_circle' : 'play_circle'}</span>
                        </button>
                        <button
                          onClick={() => removeEmployee(emp)}
                          title="Remove employee"
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">person_remove</span>
                        </button>
                      </div>
                    </div>

                    {/* Module chips */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {modules.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">No modules — click Modules to assign access</span>
                      ) : (
                        modules.map((mod) => {
                          const def = ALL_MODULES.find((m) => m.id === mod);
                          return (
                            <span key={mod} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                              <span className="material-symbols-outlined text-xs">{def?.icon || 'widgets'}</span>
                              {def?.label || mod}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: Add Employee panel (always visible) ── */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 sticky top-6">
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-green-600 text-lg">person_add</span>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Add Employee</h2>
                <p className="text-xs text-gray-500">Promote a customer</p>
              </div>
            </div>

            <div className="p-5">
              <p className="text-xs text-gray-500 mb-3">
                Search by name or email. Admins are excluded.
              </p>

              {/* Search input */}
              <div className="relative mb-3">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                <input
                  type="text"
                  placeholder="Name or email…"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {customerSearching && (
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-base animate-spin">progress_activity</span>
                )}
                {customerSearch && !customerSearching && (
                  <button
                    onClick={() => { setCustomerSearch(''); setCustomerResults([]); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                )}
              </div>

              {/* Results */}
              {customerResults.length > 0 && (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                  {customerResults.map((c) => (
                    <div key={c.id} className="p-3 hover:bg-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs flex-shrink-0">
                            {(c.first_name?.[0] || c.email?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{fullName(c)}</p>
                          <p className="text-xs text-gray-500 truncate">{c.email}</p>
                        </div>
                      </div>
                      {c.is_employee ? (
                        <span className="w-full flex items-center justify-center gap-1 text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Already an employee
                        </span>
                      ) : (
                        <button
                          onClick={() => promoteToEmployee(c)}
                          disabled={promoting === c.id}
                          className="w-full flex items-center justify-center gap-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          {promoting === c.id ? (
                            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                          ) : (
                            <span className="material-symbols-outlined text-sm">person_add</span>
                          )}
                          Add as Employee
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {customerSearch && !customerSearching && customerResults.length === 0 && (
                <div className="text-center py-6 text-gray-400">
                  <span className="material-symbols-outlined text-3xl block mb-1">search_off</span>
                  <p className="text-sm">No customers found</p>
                </div>
              )}

              {!customerSearch && (
                <div className="text-center py-6 text-gray-300">
                  <span className="material-symbols-outlined text-3xl block mb-1">manage_search</span>
                  <p className="text-xs text-gray-400">Type to search customers</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── MODULE ASSIGNMENT MODAL ── */}
      {moduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Assign Modules</h3>
                <p className="text-sm text-gray-500">{fullName(moduleModal.profile)}</p>
              </div>
              <button onClick={() => setModuleModal(null)} className="text-gray-400 hover:text-gray-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-gray-500 mb-3">Select which admin sections this employee can access:</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map((mod) => {
                  const active = selectedModules.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleModule(mod.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        active
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{mod.icon}</span>
                      {mod.label}
                      {active && <span className="material-symbols-outlined text-sm ml-auto">check</span>}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => setSelectedModules(ALL_MODULES.map((m) => m.id))} className="text-xs text-indigo-600 hover:underline">
                  Select all
                </button>
                <span className="text-gray-300">·</span>
                <button onClick={() => setSelectedModules([])} className="text-xs text-gray-500 hover:underline">
                  Clear all
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModuleModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={saveModules}
                disabled={savingModules}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-60"
              >
                {savingModules ? 'Saving…' : 'Save Modules'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTES MODAL ── */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Internal Notes</h3>
              <button onClick={() => setNotesModal(null)} className="text-gray-400 hover:text-gray-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-500 mb-2">{fullName(notesModal.profile)}</p>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={4}
                placeholder="Add internal notes about this employee…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setNotesModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={saveNotes} className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          <span className="material-symbols-outlined text-base">{toast.type === 'error' ? 'error' : 'check_circle'}</span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
