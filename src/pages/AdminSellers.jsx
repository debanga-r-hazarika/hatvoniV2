import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import PickupLocationModal from '../components/admin/PickupLocationModal';

export default function AdminSellers() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sellers, setSellers] = useState([]);
  const [sellerProducts, setSellerProducts] = useState({});
  const [pickupLocations, setPickupLocations] = useState({});
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingState, setLoadingState] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [syncingLocationId, setSyncingLocationId] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showNotice = useCallback((message) => {
    setNotice(message);
    setErrorMessage('');
  }, []);

  const showError = useCallback((message) => {
    setErrorMessage(message);
  }, []);

  const callVelocityOrchestrator = useCallback(async (action, payload) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('Your session expired. Please sign in again.');
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/velocity-orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ action, payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Velocity sync failed');
    return data?.data || data;
  }, []);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, loading, navigate]);

  const fetchSellerData = useCallback(async () => {
    setLoadingState(true);
    try {
      const { data: sellerRows, error: sellerError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, is_banned, is_admin, is_seller, is_own_seller, created_at')
        .eq('is_seller', true)
        .order('created_at', { ascending: false });

      if (sellerError) throw sellerError;

      const sellerIds = (sellerRows || []).map((seller) => seller.id);
      if (sellerIds.length === 0) {
        setSellers([]);
        setSellerProducts({});
        setPickupLocations({});
        return;
      }

      const [productRes, locationRes] = await Promise.all([
        supabase.from('products').select('seller_id').in('seller_id', sellerIds),
        supabase
          .from('seller_pickup_locations')
          .select('id, seller_id, warehouse_name, street_address, pincode, city, state, warehouse_contact_person, warehouse_contact_number, warehouse_email_id, is_default, velocity_warehouse_id, velocity_warehouse_synced_at, created_at, updated_at')
          .in('seller_id', sellerIds)
          .order('created_at', { ascending: false }),
      ]);

      if (productRes.error) throw productRes.error;
      if (locationRes.error) throw locationRes.error;

      const productCounts = (productRes.data || []).reduce((acc, row) => {
        if (!row.seller_id) return acc;
        acc[row.seller_id] = (acc[row.seller_id] || 0) + 1;
        return acc;
      }, {});

      const locationsBySeller = (locationRes.data || []).reduce((acc, location) => {
        if (!acc[location.seller_id]) acc[location.seller_id] = [];
        acc[location.seller_id].push(location);
        return acc;
      }, {});

      setSellers(sellerRows || []);
      setSellerProducts(productCounts);
      setPickupLocations(locationsBySeller);
    } catch (error) {
      console.error('Error loading sellers:', error);
      showError('Failed to load sellers: ' + (error?.message || 'Unknown error'));
    } finally {
      setLoadingState(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchSellerData();
  }, [fetchSellerData, isAdmin]);

  useEffect(() => {
    const sellerId = searchParams.get('seller');
    if (sellerId) {
      setSelectedSellerId(sellerId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedSellerId && sellers.length > 0) {
      setSelectedSellerId(sellers[0].id);
    }
  }, [selectedSellerId, sellers]);

  const selectedSeller = useMemo(
    () => sellers.find((seller) => seller.id === selectedSellerId) || null,
    [sellers, selectedSellerId]
  );

  const sellerLocations = pickupLocations[selectedSellerId] || [];
  const defaultLocation = sellerLocations.find((location) => location.is_default) || sellerLocations[0] || null;

  const stats = useMemo(() => {
    const total = sellers.length;
    const active = sellers.filter((seller) => !seller.is_banned).length;
    const ownSellerCount = sellers.filter((seller) => seller.is_own_seller).length;
    const totalLocations = Object.values(pickupLocations).reduce((sum, locations) => sum + locations.length, 0);
    return { total, active, ownSellerCount, totalLocations };
  }, [pickupLocations, sellers]);

  const filteredSellers = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();
    return sellers.filter((seller) => {
      const fullName = `${seller.first_name || ''} ${seller.last_name || ''}`.trim().toLowerCase();
      const matchesSearch =
        !searchLower ||
        fullName.includes(searchLower) ||
        (seller.email || '').toLowerCase().includes(searchLower);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !seller.is_banned) ||
        (statusFilter === 'banned' && seller.is_banned) ||
        (statusFilter === 'own' && seller.is_own_seller) ||
        (statusFilter === 'marketplace' && !seller.is_own_seller);
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, sellers, statusFilter]);

  const handleToggleBan = async (seller) => {
    try {
      setErrorMessage('');
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: !seller.is_banned })
        .eq('id', seller.id);
      if (error) throw error;
      fetchSellerData();
      showNotice(`Seller ${seller.is_banned ? 'unbanned' : 'banned'} successfully.`);
    } catch (error) {
      showError('Error updating seller status: ' + (error?.message || 'Unknown error'));
    }
  };

  const handleToggleOwnSeller = async (seller) => {
    try {
      setErrorMessage('');
      const { error } = await supabase
        .from('profiles')
        .update({ is_own_seller: !seller.is_own_seller })
        .eq('id', seller.id);
      if (error) throw error;
      fetchSellerData();
      showNotice('Seller type updated successfully.');
    } catch (error) {
      showError('Error updating seller type: ' + (error?.message || 'Unknown error'));
    }
  };

  const openLocationModal = (location = null) => {
    setEditingLocation(location);
    setLocationModalOpen(true);
  };

  const hasWarehouseFieldsChanged = (previousLocation, nextPayload) => {
    if (!previousLocation) return true;
    const normalize = (value) => String(value || '').trim();
    const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

    return (
      normalize(previousLocation.warehouse_name) !== normalize(nextPayload.warehouse_name) ||
      normalize(previousLocation.street_address) !== normalize(nextPayload.street_address) ||
      normalizeDigits(previousLocation.pincode) !== normalizeDigits(nextPayload.pincode) ||
      normalize(previousLocation.city) !== normalize(nextPayload.city) ||
      normalize(previousLocation.state) !== normalize(nextPayload.state) ||
      normalize(previousLocation.warehouse_contact_person) !== normalize(nextPayload.warehouse_contact_person) ||
      normalizeDigits(previousLocation.warehouse_contact_number) !== normalizeDigits(nextPayload.warehouse_contact_number) ||
      normalize(previousLocation.warehouse_email_id).toLowerCase() !== normalize(nextPayload.warehouse_email_id).toLowerCase()
    );
  };

  const saveLocation = async (payload) => {
    if (!selectedSellerId) return;

    setSavingLocation(true);
    try {
      setErrorMessage('');
      const locationPayload = {
        seller_id: selectedSellerId,
        warehouse_name: payload.warehouse_name?.trim() || '',
        street_address: payload.street_address?.trim() || '',
        pincode: String(payload.pincode || '').replace(/\D/g, '').slice(0, 6),
        city: payload.city?.trim() || '',
        state: payload.state?.trim() || '',
        warehouse_contact_person: payload.warehouse_contact_person?.trim() || '',
        warehouse_contact_number: String(payload.warehouse_contact_number || '').replace(/\D/g, '').slice(0, 10),
        warehouse_email_id: payload.warehouse_email_id?.trim() || '',
        is_default: payload.is_default === true,
        updated_at: new Date().toISOString(),
      };

      let error;
      let savedLocation = null;
      if (editingLocation) {
        ({ data: savedLocation, error } = await supabase
          .from('seller_pickup_locations')
          .update(locationPayload)
          .eq('id', editingLocation.id)
          .eq('seller_id', selectedSellerId)
          .select('*')
          .single());
      } else {
        ({ data: savedLocation, error } = await supabase
          .from('seller_pickup_locations')
          .insert([{ ...locationPayload, created_at: new Date().toISOString() }])
          .select('*')
          .single());
      }

      if (error) throw error;

      const shouldSyncWarehouse = !!savedLocation && (
        !savedLocation.velocity_warehouse_id ||
        hasWarehouseFieldsChanged(editingLocation, locationPayload)
      );

      if (shouldSyncWarehouse) {
        const sellerName = `${selectedSeller?.first_name || ''} ${selectedSeller?.last_name || ''}`.trim();
        const contactName = locationPayload.warehouse_contact_person || sellerName || selectedSeller?.email || 'Seller';

        const syncPayload = {
          seller_id: selectedSellerId,
          pickup_location_id: savedLocation.id,
          warehouse_name: locationPayload.warehouse_name,
          pickup_location: locationPayload.warehouse_name,
          name: locationPayload.warehouse_name,
          address: locationPayload.street_address,
          street_address: locationPayload.street_address,
          address_1: locationPayload.street_address,
          address1: locationPayload.street_address,
          address_line1: locationPayload.street_address,
          address_line_1: locationPayload.street_address,
          address_2: '',
          address2: '',
          city: locationPayload.city,
          city_name: locationPayload.city,
          state: locationPayload.state,
          state_name: locationPayload.state,
          country: 'India',
          pincode: locationPayload.pincode,
          pin_code: locationPayload.pincode,
          pin: locationPayload.pincode,
          zip: locationPayload.pincode,
          zip_code: locationPayload.pincode,
          postal_code: locationPayload.pincode,
          phone: locationPayload.warehouse_contact_number,
          mobile: locationPayload.warehouse_contact_number,
          contact_number: locationPayload.warehouse_contact_number,
          warehouse_contact_person: contactName,
          warehouse_contact_number: locationPayload.warehouse_contact_number,
          warehouse_email_id: locationPayload.warehouse_email_id || selectedSeller?.email || '',
          contact_person: contactName,
          person_name: contactName,
          email: locationPayload.warehouse_email_id || selectedSeller?.email || '',
          email_id: locationPayload.warehouse_email_id || selectedSeller?.email || '',
        };

        try {
          const syncResult = await callVelocityOrchestrator('create_warehouse', syncPayload);
          const syncedId = syncResult?.payload?.warehouse_id || syncResult?.warehouse_id || syncResult?.existing_warehouse_id || '';
          showNotice(
            `Pickup location saved and synced with Velocity${syncedId ? ` (Warehouse ID: ${syncedId})` : ''}.`
          );
        } catch (syncError) {
          showError(
            'Pickup location saved, but Velocity warehouse sync failed. ' +
            (syncError?.message || 'Unknown sync error')
          );
        }
      }

      setLocationModalOpen(false);
      setEditingLocation(null);
      fetchSellerData();
      if (!shouldSyncWarehouse) {
        showNotice(
          editingLocation
            ? 'Pickup location updated. Warehouse sync not needed because no warehouse fields changed.'
            : 'Pickup location added.'
        );
      }
    } catch (error) {
      showError('Error saving pickup location: ' + (error?.message || 'Unknown error'));
    } finally {
      setSavingLocation(false);
    }
  };

  const deleteLocation = async (location) => {
    if (!window.confirm(`Delete ${location.warehouse_name || 'this pickup location'}?`)) return;

    try {
      setErrorMessage('');
      const { error } = await supabase
        .from('seller_pickup_locations')
        .delete()
        .eq('id', location.id)
        .eq('seller_id', selectedSellerId);
      if (error) throw error;
      fetchSellerData();
      showNotice('Pickup location deleted.');
    } catch (error) {
      showError('Error deleting pickup location: ' + (error?.message || 'Unknown error'));
    }
  };

  const setDefaultLocation = async (location) => {
    try {
      setErrorMessage('');
      const { error } = await supabase
        .from('seller_pickup_locations')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', location.id)
        .eq('seller_id', selectedSellerId);
      if (error) throw error;
      fetchSellerData();
      showNotice('Default pickup location updated.');
    } catch (error) {
      showError('Error setting default location: ' + (error?.message || 'Unknown error'));
    }
  };

  const syncLocationToVelocity = async (location) => {
    if (!selectedSellerId || !location?.id) return;
    setSyncingLocationId(location.id);
    try {
      setErrorMessage('');
      const sellerName = `${selectedSeller?.first_name || ''} ${selectedSeller?.last_name || ''}`.trim();
      const contactName = location.warehouse_contact_person || sellerName || selectedSeller?.email || 'Seller';

      const syncPayload = {
        seller_id: selectedSellerId,
        pickup_location_id: location.id,
        warehouse_name: location.warehouse_name,
        pickup_location: location.warehouse_name,
        name: location.warehouse_name,
        address: location.street_address,
        street_address: location.street_address,
        address_1: location.street_address,
        address1: location.street_address,
        address_line1: location.street_address,
        address_line_1: location.street_address,
        address_2: '',
        address2: '',
        city: location.city,
        city_name: location.city,
        state: location.state,
        state_name: location.state,
        country: 'India',
        pincode: location.pincode,
        pin_code: location.pincode,
        pin: location.pincode,
        zip: location.pincode,
        zip_code: location.pincode,
        postal_code: location.pincode,
        phone: location.warehouse_contact_number,
        mobile: location.warehouse_contact_number,
        contact_number: location.warehouse_contact_number,
        warehouse_contact_person: contactName,
        warehouse_contact_number: location.warehouse_contact_number,
        warehouse_email_id: location.warehouse_email_id || selectedSeller?.email || '',
        contact_person: contactName,
        person_name: contactName,
        email: location.warehouse_email_id || selectedSeller?.email || '',
        email_id: location.warehouse_email_id || selectedSeller?.email || '',
      };

      const syncResult = await callVelocityOrchestrator('create_warehouse', syncPayload);
      await fetchSellerData();
      const syncedId = syncResult?.payload?.warehouse_id || syncResult?.warehouse_id || syncResult?.existing_warehouse_id || location.velocity_warehouse_id || '';
      showNotice(`Velocity warehouse synced for ${location.warehouse_name}${syncedId ? ` (Warehouse ID: ${syncedId})` : ''}.`);
    } catch (error) {
      showError('Velocity sync failed: ' + (error?.message || 'Unknown error'));
    } finally {
      setSyncingLocationId('');
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-surface pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors mb-3"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to admin dashboard
            </button>
            <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Seller Management</h1>
            <p className="text-on-surface-variant mt-2 font-body max-w-2xl">
              Review sellers, manage their pickup locations, and keep one default location per seller.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSellerData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-body font-semibold hover:opacity-90 transition"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        </header>

        {notice && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-600">check_circle</span>
            <p className="font-medium flex-1">{notice}</p>
            <button onClick={() => setNotice('')} className="text-emerald-700 hover:text-emerald-900 font-bold">✕</button>
          </div>
        )}
        {errorMessage && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-3">
            <span className="material-symbols-outlined text-red-600">error</span>
            <p className="font-medium flex-1">{errorMessage}</p>
            <button onClick={() => setErrorMessage('')} className="text-red-700 hover:text-red-900 font-bold">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Sellers', value: stats.total, icon: 'storefront', color: 'bg-emerald-600' },
            { label: 'Active Sellers', value: stats.active, icon: 'verified', color: 'bg-primary' },
            { label: 'Own Sellers', value: stats.ownSellerCount, icon: 'badge', color: 'bg-secondary' },
            { label: 'Pickup Locations', value: stats.totalLocations, icon: 'local_shipping', color: 'bg-sky-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface-container-low rounded-2xl p-6 flex items-center gap-4">
              <div className={`${stat.color} w-12 h-12 rounded-xl flex items-center justify-center`}>
                <span className="material-symbols-outlined text-white">{stat.icon}</span>
              </div>
              <div>
                <p className="text-2xl font-brand text-primary">{stat.value}</p>
                <p className="text-sm text-on-surface-variant font-body">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-6">
          <div className="bg-surface-container-low rounded-[2rem] border border-outline-variant/20 overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div>
                <h2 className="font-brand text-2xl text-primary">Sellers</h2>
                <p className="text-sm text-on-surface-variant mt-1">Select a seller to manage pickup locations.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-72">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
                  <input
                    type="text"
                    placeholder="Search sellers..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/30 rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body text-sm"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="px-4 py-2.5 border border-outline-variant/30 rounded-xl bg-surface focus:ring-2 focus:ring-secondary font-body text-sm"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="banned">Banned</option>
                  <option value="own">Own</option>
                  <option value="marketplace">Marketplace</option>
                </select>
              </div>
            </div>

            {loadingState ? (
              <div className="flex items-center justify-center py-20">
                <span className="material-symbols-outlined text-4xl text-secondary animate-spin">progress_activity</span>
              </div>
            ) : filteredSellers.length === 0 ? (
              <div className="text-center py-20">
                <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">storefront</span>
                <p className="mt-4 text-on-surface-variant font-body">No sellers found</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/15">
                {filteredSellers.map((seller) => {
                  const fullName = `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || 'No name';
                  const sellerLocationCount = pickupLocations[seller.id]?.length || 0;
                  const defaultSellerLocation = pickupLocations[seller.id]?.find((location) => location.is_default) || null;

                  return (
                    <button
                      key={seller.id}
                      type="button"
                      onClick={() => setSelectedSellerId(seller.id)}
                      className={`w-full text-left p-5 transition-all hover:bg-primary/[0.03] ${selectedSellerId === seller.id ? 'bg-primary/[0.05]' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-bold ${seller.is_banned ? 'bg-red-50 text-red-600' : seller.is_own_seller ? 'bg-primary/10 text-primary' : 'bg-emerald-50 text-emerald-700'}`}>
                            {(seller.first_name?.[0] || seller.email?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-brand text-lg font-bold text-primary leading-tight">{fullName}</p>
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${seller.is_own_seller ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-700'}`}>
                                {seller.is_own_seller ? 'Own Seller' : 'Marketplace'}
                              </span>
                              {seller.is_banned && (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-red-100 text-red-700">Banned</span>
                              )}
                            </div>
                            <p className="text-sm text-on-surface-variant mt-1">{seller.email || 'No email'}</p>
                            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-on-surface-variant">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                                {sellerProducts[seller.id] || 0} products
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">place</span>
                                {sellerLocationCount} pickup locations
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                {new Date(seller.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            {defaultSellerLocation && (
                              <p className="mt-2 text-xs text-secondary font-semibold">
                                Default: {defaultSellerLocation.warehouse_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSellerId(seller.id);
                              openLocationModal();
                            }}
                            className="px-3 py-2 rounded-xl bg-secondary text-white text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                          >
                            Add pickup
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleOwnSeller(seller);
                              }}
                              className="w-9 h-9 rounded-xl border border-outline-variant/20 bg-surface-container-low flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors"
                              title="Toggle seller type"
                            >
                              <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleBan(seller);
                              }}
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${seller.is_banned ? 'border-green-100 bg-green-50 text-green-600 hover:bg-green-500 hover:text-white' : 'border-red-100 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white'}`}
                              title={seller.is_banned ? 'Unban seller' : 'Ban seller'}
                            >
                              <span className="material-symbols-outlined text-[18px]">{seller.is_banned ? 'lock_open' : 'block'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-surface-container-low rounded-[2rem] border border-outline-variant/20 overflow-hidden">
            <div className="p-6 border-b border-outline-variant/20 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary mb-1">Selected Seller</p>
                <h2 className="font-brand text-2xl text-primary">
                  {selectedSeller ? `${selectedSeller.first_name || ''} ${selectedSeller.last_name || ''}`.trim() || selectedSeller.email : 'No seller selected'}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">Pickup locations are managed here.</p>
              </div>
              {selectedSeller && (
                <button
                  type="button"
                  onClick={() => openLocationModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  Add Location
                </button>
              )}
            </div>

            {!selectedSeller ? (
              <div className="p-8 text-center text-on-surface-variant">Select a seller to view pickup locations.</div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Seller Type</p>
                    <p className="mt-2 font-semibold text-primary">{selectedSeller.is_own_seller ? 'Own seller' : 'Marketplace seller'}</p>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Pickup Locations</p>
                    <p className="mt-2 font-semibold text-primary">{sellerLocations.length}</p>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
                  <div className="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant/60">Pickup Locations</p>
                      <p className="text-sm text-on-surface-variant">Mark one location as default for fulfillment.</p>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-secondary">{sellerLocations.length} total</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {sellerLocations.length === 0 ? (
                      <div className="text-center py-12 text-on-surface-variant">
                        <span className="material-symbols-outlined text-5xl block mb-3 text-on-surface-variant/30">place</span>
                        <p>No pickup locations yet.</p>
                        <button
                          type="button"
                          onClick={() => openLocationModal()}
                          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-base">add</span>
                          Add first location
                        </button>
                      </div>
                    ) : sellerLocations.map((location) => (
                      <div key={location.id} className="rounded-2xl border border-outline-variant/20 bg-white p-4 shadow-sm">
                        {(() => {
                          const syncedAtMs = location.velocity_warehouse_synced_at ? Date.parse(location.velocity_warehouse_synced_at) : NaN;
                          const updatedAtMs = location.updated_at ? Date.parse(location.updated_at) : NaN;
                          const needsSync = !location.velocity_warehouse_id || Number.isNaN(syncedAtMs) || Number.isNaN(updatedAtMs) || updatedAtMs > syncedAtMs;
                          return (
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-primary">{location.warehouse_name}</h3>
                              {location.is_default && (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-primary/10 text-primary">Default</span>
                              )}
                              {location.velocity_warehouse_id ? (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                  Synced: {location.velocity_warehouse_id}
                                </span>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                                  Not synced
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-on-surface-variant">
                              {location.warehouse_contact_person}{location.warehouse_contact_number ? ` • ${location.warehouse_contact_number}` : ''}
                            </p>
                            <p className="mt-2 text-sm text-on-surface leading-6">
                              {location.street_address}<br />
                              {location.city}, {location.state} {location.pincode}
                            </p>
                            <p className="mt-2 text-sm text-on-surface-variant">Email: {location.warehouse_email_id}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 md:justify-end">
                            {!location.is_default && (
                              <button
                                type="button"
                                onClick={() => setDefaultLocation(location)}
                                className="px-3 py-2 rounded-xl border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-colors"
                              >
                                Set default
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openLocationModal(location)}
                              className="px-3 py-2 rounded-xl border border-outline-variant/20 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:bg-surface-container transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => syncLocationToVelocity(location)}
                              disabled={syncingLocationId === location.id || !needsSync}
                              className="px-3 py-2 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {syncingLocationId === location.id ? 'Syncing...' : needsSync ? 'Sync now' : 'Synced'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteLocation(location)}
                              className="px-3 py-2 rounded-xl border border-red-100 bg-red-50 text-red-600 text-xs font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Products</p>
                    <p className="mt-2 font-semibold text-primary">{sellerProducts[selectedSeller.id] || 0} assigned products</p>
                  </div>
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Default Location</p>
                    <p className="mt-2 font-semibold text-primary">{defaultLocation ? defaultLocation.warehouse_name : 'No default set'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {locationModalOpen && selectedSeller && (
          <PickupLocationModal
            seller={selectedSeller}
            location={editingLocation}
            saving={savingLocation}
            onClose={() => {
              setLocationModalOpen(false);
              setEditingLocation(null);
            }}
            onSave={saveLocation}
          />
        )}
      </div>
    </div>
  );
}
