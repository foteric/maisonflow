// Location: src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './lib/supabase';

interface Property {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  property_id: string;
  unit_name: string;
  base_rent: number;
  occupant_name: string | null;
  occupant_phone: string | null;
  is_vacant: boolean;
}

interface PaymentRecord {
  id: string;
  unit_id: string;
  amount_paid: number;
  billing_month: string; // ISO format string: '2026-05-01', '2026-06-01'
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userName, setUserName] = useState('');
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  
  // Collections matching updated SQL tables
  const [properties, setProperties] = useState<Property[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  
  // Navigation State
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Modals
  const [isPropModalOpen, setIsPropModalOpen] = useState(false);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  // Forms: Properties
  const [newPropName, setNewPropName] = useState('');

  // Forms: Units
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitRent, setNewUnitRent] = useState('');
  const [newOccupantName, setNewOccupantName] = useState('');
  const [newOccupantPhone, setNewOccupantPhone] = useState('');

  // Forms: Payments (Standardized value mapping to 'YYYY-MM-DD' dates)
  const [activeUnitForPayment, setActiveUnitForPayment] = useState<Unit | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [currentBillingMonth, setCurrentBillingMonth] = useState('2026-06-01');

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      console.error('Authentication termination error:', error);
    }
  };

  const fetchData = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.push('/auth');
        return;
      }

      // Check for user identity profile metadata
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      setUserName(profile?.full_name || session.user.email || 'User');

      // Fetch from properties table
      const { data: propData } = await supabase
        .from('properties')
        .select('id, name')
        .order('created_at', { ascending: false });
      setProperties(propData || []);

      // Fetch from units table
      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .order('created_at', { ascending: false });
      setAllUnits(unitData || []);

      // Fetch from payments table
      const { data: paymentData } = await supabase
        .from('payments')
        .select('*');
      setPayments(paymentData || []);

    } catch (error) {
      console.error("Ledger database schema synchronization failure:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  const closeModalsResetErrors = () => {
    setIsPropModalOpen(false);
    setIsUnitModalOpen(false);
    setIsPaymentModalOpen(false);
    setErrorFeedback(null);
  };

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPropName.trim() || submitting) return;
    setErrorFeedback(null);

    const propertyExists = properties.some(
      p => p.name.toLowerCase().trim() === newPropName.toLowerCase().trim()
    );
    if (propertyExists) {
      setErrorFeedback(`A building asset named "${newPropName}" already exists.`);
      return;
    }

    try {
      setSubmitting(true);
      await supabase.from('properties').insert([{ name: newPropName.trim() }]);
      setNewPropName('');
      closeModalsResetErrors();
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim() || !selectedPropertyId || submitting) return;
    setErrorFeedback(null);

    const unitExists = allUnits.some(
      u => u.property_id === selectedPropertyId && 
      u.unit_name.toLowerCase().trim() === newUnitName.toLowerCase().trim()
    );
    if (unitExists) {
      setErrorFeedback(`Unit configuration "${newUnitName}" already exists here.`);
      return;
    }

    try {
      setSubmitting(true);
      const hasTenant = newOccupantName.trim().length > 0;
      
      const { error } = await supabase.from('units').insert([{
        property_id: selectedPropertyId,
        unit_name: newUnitName.trim(),
        base_rent: parseFloat(newUnitRent) || 0,
        occupant_name: hasTenant ? newOccupantName.trim() : null,
        occupant_phone: hasTenant ? newOccupantPhone.trim() : null,
        is_vacant: !hasTenant
      }]);

      if (error) throw error;

      setNewUnitName('');
      setNewUnitRent('');
      setNewOccupantName('');
      setNewOccupantPhone('');
      closeModalsResetErrors();
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUnitForPayment || submitting) return;

    try {
      setSubmitting(true);
      const paidAmount = parseFloat(paymentAmount) || 0;

      const { error } = await supabase.from('payments').insert([{
        unit_id: activeUnitForPayment.id,
        amount_paid: paidAmount,
        billing_month: currentBillingMonth
      }]);

      if (error) throw error;

      setPaymentAmount('');
      setActiveUnitForPayment(null);
      closeModalsResetErrors();
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // UI Processing Layout Calculations
  const activeProperty = properties.find(p => p.id === selectedPropertyId);
  const filteredUnits = allUnits.filter(u => u.property_id === selectedPropertyId);
  
  const visibleUnitIds = selectedPropertyId ? filteredUnits.map(u => u.id) : allUnits.map(u => u.id);
  const scopingPayments = payments.filter(p => visibleUnitIds.includes(p.unit_id) && p.billing_month === currentBillingMonth);

  // Stats Counters
  const totalOccupants = selectedPropertyId 
    ? filteredUnits.filter(u => u.occupant_name).length 
    : allUnits.filter(u => u.occupant_name).length;

  const portfolioCollected = scopingPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  
  const portfolioExpected = selectedPropertyId 
    ? filteredUnits.reduce((sum, u) => sum + Number(u.base_rent), 0)
    : allUnits.reduce((sum, u) => sum + Number(u.base_rent), 0);

  const outstandingArrears = Math.max(0, portfolioExpected - portfolioCollected);

  // Display human-readable dates inside headers
  const getReadableMonthLabel = (isoStr: string) => {
    if (isoStr === '2026-05-01') return 'May 2026';
    if (isoStr === '2026-07-01') return 'July 2026';
    return 'June 2026';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500 text-sm gap-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span>Connecting database telemetry pipelines...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <span className="text-xl font-bold tracking-tight text-gray-900 cursor-pointer" onClick={() => { setSelectedPropertyId(null); setErrorFeedback(null); }}>MaisonFlow</span>
        <button onClick={handleSignOut} className="text-sm font-medium text-red-600 hover:text-red-700 bg-transparent border-0 cursor-pointer">
          Sign Out
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
              <span className="hover:text-blue-600 cursor-pointer" onClick={() => { setSelectedPropertyId(null); setErrorFeedback(null); }}>Portfolio Overview</span>
              {activeProperty && <span> / {activeProperty.name}</span>}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">
              {activeProperty ? `Ledger Matrix: ${activeProperty.name}` : `Welcome back, ${userName}!`}
            </h2>
          </div>
          {activeProperty && (
            <button onClick={() => { setSelectedPropertyId(null); setErrorFeedback(null); }} className="text-sm text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg cursor-pointer">
              ⬅ Back to Overview
            </button>
          )}
        </div>

        {/* Financial KPI Dashboard Widgets */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{activeProperty ? "Active Occupants Here" : "Total Occupants Registered"}</p>
            <p className="text-3xl font-bold text-emerald-600 mt-2">{totalOccupants}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Collected Revenue ({getReadableMonthLabel(currentBillingMonth)})</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{portfolioCollected.toLocaleString()} RWF</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Outstanding Arrears Balance</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{outstandingArrears.toLocaleString()} RWF</p>
          </div>
        </div>

        {!selectedPropertyId ? (
          /* MATRIX ROW VIEW A: ACTIVE PROPERTIES PORTFOLIO */
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-gray-900">Your Property Portfolio</h3>
              <button onClick={() => setIsPropModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer transition">
                ＋ Add Structure
              </button>
            </div>

            {properties.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No structures registered yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 uppercase font-semibold text-xs tracking-wider">
                      <th className="py-3 px-4">Structure Name</th>
                      <th className="py-3 px-4 text-center">Configured Units</th>
                      <th className="py-3 px-4 text-right">Action Interface</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700">
                    {properties.map((item) => {
                      const unitCount = allUnits.filter(u => u.property_id === item.id).length;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/80 transition">
                          <td className="py-4 px-4 font-semibold text-gray-900">{item.name}</td>
                          <td className="py-4 px-4 text-center font-medium">{unitCount} segments</td>
                          <td className="py-4 px-4 text-right">
                            <button onClick={() => setSelectedPropertyId(item.id)} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold py-1.5 px-3 rounded-md cursor-pointer transition">
                              Manage Units ➔
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
        ) : (
          /* MATRIX ROW VIEW B: UNITS AND REAL-TIME SETTLEMENT LOGGING */
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-semibold text-gray-900">Internal Units Matrix</h3>
                <p className="text-xs text-gray-400 mt-0.5">Log collected payments, track tenant balances, and update vacancy status.</p>
              </div>
              <button onClick={() => setIsUnitModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer transition">
                ＋ Segment New Unit
              </button>
            </div>

            {filteredUnits.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">No segments configured yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 uppercase font-semibold text-xs tracking-wider">
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4">Base Rent</th>
                      <th className="py-3 px-4">Occupant</th>
                      <th className="py-3 px-4">Payment Status ({getReadableMonthLabel(currentBillingMonth)})</th>
                      <th className="py-3 px-4 text-right">Financial Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700">
                    {filteredUnits.map((unit) => {
                      const unitMonthPayments = scopingPayments.filter(p => p.unit_id === unit.id);
                      const totalPaidForMonth = unitMonthPayments.reduce((sum, p) => sum + p.amount_paid, 0);
                      
                      let paymentStatus = 'Unpaid';
                      if (totalPaidForMonth >= unit.base_rent) paymentStatus = 'Paid';
                      else if (totalPaidForMonth > 0) paymentStatus = 'Partial';

                      return (
                        <tr key={unit.id} className="hover:bg-gray-50/50">
                          <td className="py-4 px-4 font-semibold text-gray-900">{unit.unit_name}</td>
                          <td className="py-4 px-4 text-gray-900 font-medium">{Number(unit.base_rent).toLocaleString()} RWF</td>
                          <td className="py-4 px-4">
                            {unit.occupant_name ? (
                              <div>
                                <p className="font-medium text-gray-900">{unit.occupant_name}</p>
                                <p className="text-xs text-gray-400 font-mono">{unit.occupant_phone}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 italic">Vacant</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {unit.occupant_name ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                paymentStatus === 'Partial' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                'bg-red-50 text-red-700 border border-red-100'
                              }`}>
                                {paymentStatus} ({totalPaidForMonth.toLocaleString()} RWF)
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right">
                            {unit.occupant_name ? (
                              <button 
                                onClick={() => { setActiveUnitForPayment(unit); setIsPaymentModalOpen(true); }}
                                className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold py-1.5 px-3 rounded-md cursor-pointer transition"
                              >
                                💵 Log Payment
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300 italic">No actions</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: REGISTER NEW STRUCTURE */}
      {isPropModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register New Structure</h3>
            
            {errorFeedback && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-medium rounded-lg">
                ⚠️ {errorFeedback}
              </div>
            )}

            <form onSubmit={handleAddProperty} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Structure Name</label>
                <input type="text" required placeholder="e.g. FIT Plaza" value={newPropName} onChange={(e) => setNewPropName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black hover:border-gray-300" />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={closeModalsResetErrors} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:bg-blue-400">
                  {submitting ? 'Saving Asset...' : 'Save Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SEGMENT NEW UNIT */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Segment New Rental Unit</h3>
            
            {errorFeedback && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-medium rounded-lg">
                ⚠️ {errorFeedback}
              </div>
            )}

            <form onSubmit={handleAddUnit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Unit Label / Number</label>
                <input type="text" required placeholder="e.g. shop1" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black hover:border-gray-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Assigned Rent (RWF / Month)</label>
                <input type="number" required placeholder="e.g. 200000" value={newUnitRent} onChange={(e) => setNewUnitRent(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black hover:border-gray-300" />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Occupant (Optional)</h4>
                <div className="flex flex-col gap-3">
                  <input type="text" placeholder="Tenant Full Name" value={newOccupantName} onChange={(e) => setNewOccupantName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black hover:border-gray-300" />
                  <input type="text" placeholder="Phone Line (e.g. 0793458964)" value={newOccupantPhone} onChange={(e) => setNewOccupantPhone(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black hover:border-gray-300" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={closeModalsResetErrors} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:bg-emerald-400">
                  {submitting ? 'Configuring Unit...' : 'Confirm Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG REVENUE PAYMENT */}
      {isPaymentModalOpen && activeUnitForPayment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Record Rent Collection</h3>
            <p className="text-xs text-gray-400 mb-4">Logging payment for {activeUnitForPayment.occupant_name} ({activeUnitForPayment.unit_name})</p>
            <form onSubmit={handleRecordPayment} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Select Billing Period</label>
                <select value={currentBillingMonth} onChange={(e) => setCurrentBillingMonth(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black cursor-pointer">
                  <option value="2026-05-01">May 2026</option>
                  <option value="2026-06-01">June 2026</option>
                  <option value="2026-07-01">July 2026</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Amount Transferred (RWF)</label>
                <input type="number" required placeholder={`Target full rent: ${activeUnitForPayment.base_rent.toLocaleString()} RWF`} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black focus:outline-emerald-600" />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={closeModalsResetErrors} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:bg-emerald-400">
                  {submitting ? 'Processing Ledger...' : 'Commit Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}