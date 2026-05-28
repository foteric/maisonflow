// Location: src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './lib/supabase';

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
}

interface Property {
  id: string;
  name: string;
  location: string;
}

interface Tenant {
  id: string;
  full_name: string;
  phone_number: string;
  rent_amount: number;
  property_id: string;
}

interface LedgerEntry {
  tenant_id: string;
  amount_paid: number;
  billing_month: string;
}

export default function DashboardHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  
  // Workspace Navigation State
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Form Toggles & Input States
  const [showPropForm, setShowPropForm] = useState(false);
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const [propertyName, setPropertyName] = useState('');
  const [propertyLocation, setPropertyLocation] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantRent, setTenantRent] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');

  // Automatically compute active billing cycle based on current system time (e.g., '2026-05-01')
  const getActiveBillingMonth = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };

  const currentBillingMonth = getActiveBillingMonth();

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth');
        return;
      }

      // Fetch Profile
      const { data: pData } = await supabase.from('profiles').select('id, full_name, role').eq('id', session.user.id).single();
      setProfile(pData);

      // Fetch Properties
      const { data: propData } = await supabase.from('properties').select('id, name, location').order('created_at', { ascending: false });
      setProperties(propData || []);

      // Fetch Tenants 
      const { data: tenantData } = await supabase.from('tenants').select('id, full_name, phone_number, rent_amount, property_id');
      setTenants(tenantData || []);

      // Fetch current month's payment history directly from the ledger
      const { data: ledgerData } = await supabase
        .from('payment_ledger')
        .select('tenant_id, amount_paid, billing_month')
        .eq('billing_month', currentBillingMonth);
      setLedger(ledgerData || []);

    } catch (err) {
      console.error("Flight systems error tracking data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyName || !propertyLocation || !profile) return;
    setFormLoading(true);
    try {
      const { error } = await supabase.from('properties').insert([{ name: propertyName, location: propertyLocation, landlord_id: profile.id }]);
      if (error) throw error;
      setPropertyName(''); setPropertyLocation(''); setShowPropForm(false);
      await fetchData();
    } catch (err) {
      alert('Failed to register property asset.');
    } finally { setFormLoading(false); }
  };

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPropId = selectedProperty ? selectedProperty.id : selectedPropertyId;
    if (!tenantName || !tenantPhone || !tenantRent || !targetPropId || !profile) {
      alert('Please complete all input fields.');
      return;
    }
    setFormLoading(true);
    try {
      const { error } = await supabase.from('tenants').insert([
        {
          full_name: tenantName,
          phone_number: tenantPhone,
          rent_amount: parseInt(tenantRent),
          property_id: targetPropId,
          landlord_id: profile.id
        }
      ]);
      if (error) throw error;
      setTenantName(''); setTenantPhone(''); setTenantRent(''); setSelectedPropertyId(''); setShowTenantForm(false);
      await fetchData();
    } catch (err) {
      alert('Failed to log occupant.');
    } finally { setFormLoading(false); }
  };

  // Upgraded Ledger Interface Actions
  const togglePaymentStatus = async (tenantId: string, currentAmount: number, isCurrentlyPaid: boolean) => {
    try {
      if (!isCurrentlyPaid) {
        // Log transaction row into ledger
        const { error } = await supabase
          .from('payment_ledger')
          .insert([
            {
              tenant_id: tenantId,
              amount_paid: currentAmount,
              billing_month: currentBillingMonth
            }
          ]);
        if (error) throw error;
      } else {
        // Sever transaction row from ledger
        const { error } = await supabase
          .from('payment_ledger')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('billing_month', currentBillingMonth);
        if (error) throw error;
      }

      await fetchData(); // Smoothly recalculate frontend financials
    } catch (err) {
      console.error(err);
      alert('Ledger alteration mapping fault.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  // Context Compilers 
  const currentTenantsScope = selectedProperty ? tenants.filter(t => t.property_id === selectedProperty.id) : tenants;
  
  // Compute financial states in-memory directly from live transaction records
  const totalRevenueCollected = currentTenantsScope.reduce((sum, t) => {
    const hasPaid = ledger.some(l => l.tenant_id === t.id);
    return sum + (hasPaid ? t.rent_amount : 0);
  }, 0);

  const targetExpectedRevenue = currentTenantsScope.reduce((sum, t) => sum + t.rent_amount, 0);

  // Format system month labels cleanly for display headers (e.g., "May 2026")
  const formatDisplayMonth = (isoDate: string) => {
    const [year, month] = isoDate.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
    return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="animate-pulse text-sm text-slate-500 font-medium">Calibrating engine instrumentation...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Navigation Systems Control Deck */}
      <nav className="bg-white border-b border-slate-200/80 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-xs">
        <div className="flex items-center gap-3">
          <span onClick={() => setSelectedProperty(null)} className="text-xl font-black tracking-tight text-slate-900 cursor-pointer select-none">MaisonFlow</span>
          {selectedProperty && (
            <span className="text-xs bg-slate-100 text-slate-500 font-bold px-2.5 py-1 rounded-md border border-slate-200 uppercase tracking-wider">
              Workspace Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full border border-blue-100/50 uppercase tracking-wider">
            {profile?.role} Mode
          </span>
          <button onClick={handleSignOut} className="text-sm font-semibold text-slate-500 hover:text-red-600 transition cursor-pointer">
            Sign Out
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 sm:p-8 space-y-8">
        
        {/* WORKSPACE VIEW: MANAGEMENT TERMINAL FOR SPECIFIC PROPERTY */}
        {selectedProperty ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <button onClick={() => { setSelectedProperty(null); setShowTenantForm(false); }} className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1 mb-2">
                  ← Back to Main Portfolio
                </button>
                <h2 className="text-3xl font-black tracking-tight text-slate-900">{selectedProperty.name}</h2>
                <p className="text-sm text-slate-400 font-medium mt-0.5">📍 {selectedProperty.location} • <span className="text-blue-600 font-bold">{formatDisplayMonth(currentBillingMonth)} Cycle</span></p>
              </div>
              <button onClick={() => setShowTenantForm(!showTenantForm)} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition cursor-pointer self-start sm:self-center">
                {showTenantForm ? 'Close Intake' : '＋ Add Room Occupant'}
              </button>
            </div>

            {showTenantForm && (
              <form onSubmit={handleAddTenant} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4 max-w-xl">
                <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">Occupant Lease Setup</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="Full Legal Name" required value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                  <input type="text" placeholder="Contact Mobile Phone" required value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                  <input type="number" placeholder="Contracted Rent (RWF)" required value={tenantRent} onChange={(e) => setTenantRent(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                </div>
                <button type="submit" disabled={formLoading} className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider">{formLoading ? 'Saving...' : 'Lock Lease Agreement'}</button>
              </form>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-xs">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Occupancy Count</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{currentTenantsScope.length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-xs">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Collected ({formatDisplayMonth(currentBillingMonth)})</p>
                <p className="text-3xl font-black text-emerald-600 mt-1">{totalRevenueCollected.toLocaleString()} RWF</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-xs">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outstanding Balance</p>
                <p className="text-3xl font-black text-amber-600 mt-1">{(targetExpectedRevenue - totalRevenueCollected).toLocaleString()} RWF</p>
              </div>
            </div>

            {/* Dynamic Transaction Ledger Component */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">Active Leases & Dynamic Ledger</h3>
              </div>
              {currentTenantsScope.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400 font-medium">No tenants linked to this structure yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/20">
                        <th className="p-4 pl-6">Tenant Name</th>
                        <th className="p-4">Phone Contact</th>
                        <th className="p-4">Monthly Rate</th>
                        <th className="p-4">Status ({formatDisplayMonth(currentBillingMonth)})</th>
                        <th className="p-4 pr-6 text-right">Ledger Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm font-medium">
                      {currentTenantsScope.map(t => {
                        // Check inline if this tenant has a recorded entry for the current cycle
                        const isPaidThisMonth = ledger.some(l => l.tenant_id === t.id);
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/40 transition">
                            <td className="p-4 pl-6 font-bold text-slate-900">{t.full_name}</td>
                            <td className="p-4 font-mono text-slate-500 text-xs">{t.phone_number}</td>
                            <td className="p-4 text-slate-900">{t.rent_amount.toLocaleString()} RWF</td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold tracking-wide uppercase ${isPaidThisMonth ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-amber-50 text-amber-700 border border-amber-200/60'}`}>
                                {isPaidThisMonth ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="p-4 pr-6 text-right">
                              <button onClick={() => togglePaymentStatus(t.id, t.rent_amount, isPaidThisMonth)} className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition tracking-wider cursor-pointer ${isPaidThisMonth ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                                Mark As {isPaidThisMonth ? 'Pending' : 'Paid'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          
          /* GLOBAL PORTFOLIO SUMMARY TERMINAL VIEW */
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 pb-5">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-slate-900">Welcome back, {profile?.full_name}!</h2>
                <p className="text-slate-400 font-medium text-sm mt-0.5">Real-time portfolio metrics engine.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowPropForm(!showPropForm); setShowTenantForm(false); }} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm cursor-pointer transition">
                  {showPropForm ? 'Close Setup' : '＋ Add Structure'}
                </button>
                {properties.length > 0 && (
                  <button onClick={() => { setShowTenantForm(!showTenantForm); setShowPropForm(false); }} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm cursor-pointer transition">
                    {showTenantForm ? 'Close Setup' : '＋ Add Occupant'}
                  </button>
                )}
              </div>
            </div>

            {showPropForm && (
              <form onSubmit={handleAddProperty} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4 max-w-xl">
                <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">Property Asset Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="Building/Estate Name" required value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                  <input type="text" placeholder="Location Neighborhood" required value={propertyLocation} onChange={(e) => setPropertyLocation(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                </div>
                <button type="submit" disabled={formLoading} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider">{formLoading ? 'Saving...' : 'Deploy Structure Asset'}</button>
              </form>
            )}

            {showTenantForm && (
              <form onSubmit={handleAddTenant} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4 max-w-xl">
                <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">Global Occupant Setup</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="Full Legal Name" required value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                  <input type="text" placeholder="Contact Mobile Phone" required value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                  <input type="number" placeholder="Contracted Rent (RWF)" required value={tenantRent} onChange={(e) => setTenantRent(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500" />
                  <select required value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-black bg-white focus:outline-blue-500">
                    <option value="">Attach to Property...</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={formLoading} className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider">{formLoading ? 'Saving...' : 'Complete Asset Assignment'}</button>
              </form>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-xs hover:border-blue-200 transition">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Properties</p>
                <p className="text-3xl font-black text-blue-600 mt-1">{properties.length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-xs hover:border-emerald-200 transition">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Occupants</p>
                <p className="text-3xl font-black text-emerald-600 mt-1">{tenants.length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-xs hover:border-slate-300 transition">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expected Portfolio Revenue</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{targetExpectedRevenue.toLocaleString()} RWF</p>
              </div>
            </div>

            <div>
              <h3 className="text-md font-black text-slate-900 uppercase tracking-wider mb-4 text-xs">Your Property Portfolio</h3>
              {properties.length === 0 ? (
                <div className="bg-white text-center py-12 rounded-xl border border-dashed border-slate-200"><p className="text-sm text-slate-400 font-medium">No properties setup yet.</p></div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {properties.map((item) => {
                    const propertyTenantsCount = tenants.filter(t => t.property_id === item.id).length;
                    return (
                      <div key={item.id} className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-slate-300/80 transition-all">
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-base tracking-tight">{item.name}</h4>
                          <p className="text-xs text-slate-400 font-semibold mt-0.5">📍 {item.location}</p>
                        </div>
                        <div className="mt-5 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                          <span className={`font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm ${propertyTenantsCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"}`}>
                            👥 {propertyTenantsCount} {propertyTenantsCount === 1 ? 'Tenant' : 'Tenants'}
                          </span>
                          <button onClick={() => setSelectedProperty(item)} className="text-blue-600 hover:text-blue-700 font-bold transition hover:underline bg-transparent border-0 cursor-pointer">
                            Manage →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}