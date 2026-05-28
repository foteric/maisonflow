// Location: src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './lib/supabase'; // NOTE: If this stays red, change it to '../lib/supabase'

interface Structure {
  id: string;
  name: string;
  structure_type: string;
  monthly_revenue: number;
}

interface Unit {
  id: string;
  structure_id: string;
  name: string;
  rent_amount: number;
  tenant_name: string | null;
  tenant_phone: string | null;
  is_occupied: boolean;
}

interface LedgerRecord {
  id: string;
  unit_id: string;
  billing_period: string;
  amount_expected: number;
  amount_paid: number;
  payment_status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  
  // Collections
  const [structures, setStructures] = useState<Structure[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [ledger, setLedger] = useState<LedgerRecord[]>([]);
  
  // Navigation
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);

  // Modals
  const [isStructModalOpen, setIsStructModalOpen] = useState(false);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  // Forms: Structures
  const [newStructName, setNewStructName] = useState('');
  const [newStructType, setNewStructType] = useState('Apartment Block');
  const [newStructRevenue, setNewStructRevenue] = useState('');

  // Forms: Units
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitRent, setNewUnitRent] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');

  // Forms: Payments
  const [activeUnitForPayment, setActiveUnitForPayment] = useState<Unit | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [currentBillingMonth, setCurrentBillingMonth] = useState('May 2026');

  // Sign Out Handler
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      setUserName(profile?.full_name || session.user.email || 'User');

      const { data: structData } = await supabase
        .from('structures')
        .select('id, name, structure_type, monthly_revenue')
        .order('created_at', { ascending: false });
      setStructures(structData || []);

      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .order('created_at', { ascending: false });
      setAllUnits(unitData || []);

      const { data: ledgerData } = await supabase
        .from('rent_ledger')
        .select('*');
      setLedger(ledgerData || []);

    } catch (error) {
      console.error("Ledger engine synchronization failure:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  const handleAddStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStructName.trim()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from('structures').insert([{
        user_id: session.user.id,
        name: newStructName,
        structure_type: newStructType,
        monthly_revenue: parseFloat(newStructRevenue) || 0,
      }]);
      setNewStructName('');
      setNewStructRevenue('');
      setIsStructModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim() || !selectedStructureId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const hasTenant = newTenantName.trim().length > 0;
      
      const { data: insertedUnit, error } = await supabase.from('units').insert([{
        structure_id: selectedStructureId,
        user_id: session.user.id,
        name: newUnitName,
        rent_amount: parseFloat(newUnitRent) || 0,
        tenant_name: hasTenant ? newTenantName : null,
        tenant_phone: hasTenant ? newTenantPhone : null,
        is_occupied: hasTenant,
      }]).select().single();

      if (error) throw error;

      // If unit was added with an occupant, initialize a clean ledger line for them
      if (hasTenant && insertedUnit) {
        await supabase.from('rent_ledger').insert([{
          unit_id: insertedUnit.id,
          structure_id: selectedStructureId,
          user_id: session.user.id,
          billing_period: currentBillingMonth,
          amount_expected: parseFloat(newUnitRent) || 0,
          amount_paid: 0,
          payment_status: 'Unpaid'
        }]);
      }

      setNewUnitName('');
      setNewUnitRent('');
      setNewTenantName('');
      setNewTenantPhone('');
      setIsUnitModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUnitForPayment) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const paid = parseFloat(paymentAmount) || 0;
      const expected = activeUnitForPayment.rent_amount;
      let status = 'Unpaid';
      if (paid >= expected) status = 'Paid';
      else if (paid > 0) status = 'Partial';

      // Check if period already exists to update, or create fresh record
      const existingRecord = ledger.find(
        l => l.unit_id === activeUnitForPayment.id && l.billing_period === currentBillingMonth
      );

      if (existingRecord) {
        await supabase.from('rent_ledger')
          .update({ amount_paid: paid, payment_status: status })
          .eq('id', existingRecord.id);
      } else {
        await supabase.from('rent_ledger').insert([{
          unit_id: activeUnitForPayment.id,
          structure_id: selectedStructureId,
          user_id: session.user.id,
          billing_period: currentBillingMonth,
          amount_expected: expected,
          amount_paid: paid,
          payment_status: status
        }]);
      }

      setPaymentAmount('');
      setActiveUnitForPayment(null);
      setIsPaymentModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // High-Level Financial Compilations
  const activeStructure = structures.find(s => s.id === selectedStructureId);
  const filteredUnits = allUnits.filter(u => u.structure_id === selectedStructureId);
  
  const totalOccupants = allUnits.filter(u => u.is_occupied).length;
  const portfolioCollected = ledger.reduce((sum, r) => sum + Number(r.amount_paid), 0);
  const portfolioExpected = structures.reduce((sum, s) => sum + Number(s.monthly_revenue), 0);
  const outstandingArrears = Math.max(0, portfolioExpected - portfolioCollected);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500 text-sm gap-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span>Compiling financial telemetry ledger...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <span className="text-xl font-bold tracking-tight text-gray-900 cursor-pointer" onClick={() => setSelectedStructureId(null)}>MaisonFlow</span>
        <button onClick={handleSignOut} className="text-sm font-medium text-red-600 hover:text-red-700 bg-transparent border-0 cursor-pointer">
          Sign Out
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
              <span className="hover:text-blue-600 cursor-pointer" onClick={() => setSelectedStructureId(null)}>Portfolio Overview</span>
              {activeStructure && <span> / {activeStructure.name}</span>}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">
              {activeStructure ? `Ledger Matrix: ${activeStructure.name}` : `Welcome back, ${userName}!`}
            </h2>
          </div>
          {activeStructure && (
            <button onClick={() => setSelectedStructureId(null)} className="text-sm text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg cursor-pointer">
              ⬅ Back to Overview
            </button>
          )}
        </div>

        {/* Global Financial Dashboard Metrics */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Occupants Registered</p>
            <p className="text-3xl font-bold text-gray-900 mt-2 text-emerald-600">{totalOccupants}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Collected Revenue (RWF)</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{portfolioCollected.toLocaleString()} RWF</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Outstanding Arrears Portfolio</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{outstandingArrears.toLocaleString()} RWF</p>
          </div>
        </div>

        {/* MASTER SCREEN MATRIX */}
        {!selectedStructureId ? (
          /* TABLE VIEW A: ALL BUILDINGS */
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-gray-900">Your Property Portfolio</h3>
              <button onClick={() => setIsStructModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer transition">
                ＋ Add Structure
              </button>
            </div>

            {structures.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No structures registered yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 uppercase font-semibold text-xs tracking-wider">
                      <th className="py-3 px-4">Structure Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-center">Units</th>
                      <th className="py-3 px-4 text-right">Target Baseline</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700">
                    {structures.map((item) => {
                      const unitCount = allUnits.filter(u => u.structure_id === item.id).length;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/80 transition">
                          <td className="py-4 px-4 font-semibold text-gray-900">{item.name}</td>
                          <td className="py-4 px-4 text-gray-500">{item.structure_type}</td>
                          <td className="py-4 px-4 text-center font-medium">{unitCount} segments</td>
                          <td className="py-4 px-4 text-right font-medium">{Number(item.monthly_revenue).toLocaleString()} RWF</td>
                          <td className="py-4 px-4 text-right">
                            <button onClick={() => setSelectedStructureId(item.id)} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold py-1.5 px-3 rounded-md cursor-pointer transition">
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
          /* TABLE VIEW B: DRILL DOWN UNITS & RECORD COLLECTIONS */
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
                      <th className="py-3 px-4">Payment Status ({currentBillingMonth})</th>
                      <th className="py-3 px-4 text-right">Financial Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700">
                    {filteredUnits.map((unit) => {
                      const record = ledger.find(l => l.unit_id === unit.id && l.billing_period === currentBillingMonth);
                      return (
                        <tr key={unit.id} className="hover:bg-gray-50/50">
                          <td className="py-4 px-4 font-semibold text-gray-900">{unit.name}</td>
                          <td className="py-4 px-4 text-gray-900 font-medium">{Number(unit.rent_amount).toLocaleString()} RWF</td>
                          <td className="py-4 px-4">
                            {unit.is_occupied ? (
                              <div>
                                <p className="font-medium text-gray-900">{unit.tenant_name}</p>
                                <p className="text-xs text-gray-400 font-mono">{unit.tenant_phone}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 italic">Vacant</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {unit.is_occupied ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                record?.payment_status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                record?.payment_status === 'Partial' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                'bg-red-50 text-red-700 border border-red-100'
                              }`}>
                                {record?.payment_status || 'Unpaid'} ({((record?.amount_paid || 0)).toLocaleString()} RWF)
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right">
                            {unit.is_occupied ? (
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
      {isStructModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register New Structure</h3>
            <form onSubmit={handleAddStructure} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Structure Name</label>
                <input type="text" required placeholder="e.g. Nyarugenge Plaza" value={newStructName} onChange={(e) => setNewStructName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Category Type</label>
                <select value={newStructType} onChange={(e) => setNewStructType(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black">
                  <option value="Apartment Block">Apartment Block</option>
                  <option value="Standalone Commercial">Standalone Commercial</option>
                  <option value="Residential House">Residential House</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Target Monthly Baseline (RWF)</label>
                <input type="number" placeholder="e.g. 700000" value={newStructRevenue} onChange={(e) => setNewStructRevenue(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black" />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setIsStructModalOpen(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg">Save Asset</button>
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
            <form onSubmit={handleAddUnit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Unit Label / Number</label>
                <input type="text" required placeholder="e.g. Suite 101" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Assigned Rent (RWF / Month)</label>
                <input type="number" required placeholder="e.g. 150000" value={newUnitRent} onChange={(e) => setNewUnitRent(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black" />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Occupant (Optional)</h4>
                <div className="flex flex-col gap-3">
                  <input type="text" placeholder="Tenant Full Name" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black" />
                  <input type="text" placeholder="Phone Line (e.g. 078...)" value={newTenantPhone} onChange={(e) => setNewTenantPhone(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setIsUnitModalOpen(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Confirm Unit</button>
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
            <p className="text-xs text-gray-400 mb-4">Logging payment for {activeUnitForPayment.tenant_name} ({activeUnitForPayment.name})</p>
            <form onSubmit={handleRecordPayment} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Select Billing Period</label>
                <select value={currentBillingMonth} onChange={(e) => setCurrentBillingMonth(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black">
                  <option value="May 2026">May 2026</option>
                  <option value="June 2026">June 2026</option>
                  <option value="July 2026">July 2026</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Amount Transferred (RWF)</label>
                <input type="number" required placeholder={`Target full rent: ${activeUnitForPayment.rent_amount.toLocaleString()} RWF`} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black focus:outline-emerald-600" />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => { setActiveUnitForPayment(null); setIsPaymentModalOpen(false); }} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Commit Collection</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}