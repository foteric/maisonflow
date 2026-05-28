// Location: src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './lib/supabase';

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

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  
  // Core Collections
  const [structures, setStructures] = useState<Structure[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  
  // Navigation State
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);

  // Modals Toggles
  const [isStructModalOpen, setIsStructModalOpen] = useState(false);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  
  // Forms: Structures
  const [newStructName, setNewStructName] = useState('');
  const [newStructType, setNewStructType] = useState('Apartment Block');
  const [newStructRevenue, setNewStructRevenue] = useState('');

  // Forms: Units
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitRent, setNewUnitRent] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');

  const fetchData = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.push('/auth');
        return;
      }

      // Fetch User Name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      setUserName(profile?.full_name || session.user.email || 'User');

      // Fetch Structures
      const { data: structData, error: structErr } = await supabase
        .from('structures')
        .select('id, name, structure_type, monthly_revenue')
        .order('created_at', { ascending: false });
      if (structErr) throw structErr;
      setStructures(structData || []);

      // Fetch All Units for Telemetry calculations
      const { data: unitData, error: unitErr } = await supabase
        .from('units')
        .select('*')
        .order('created_at', { ascending: false });
      if (unitErr) throw unitErr;
      setAllUnits(unitData || []);

    } catch (error) {
      console.error("Critical telemetry synchronization error:", error);
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

      const { error } = await supabase.from('structures').insert([
        {
          user_id: session.user.id,
          name: newStructName,
          structure_type: newStructType,
          monthly_revenue: parseFloat(newStructRevenue) || 0,
        },
      ]);
      if (error) throw error;

      setNewStructName('');
      setNewStructRevenue('');
      setIsStructModalOpen(false);
      fetchData();
    } catch (err) {
      console.error("Structure execution error:", err);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim() || !selectedStructureId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const hasTenant = newTenantName.trim().length > 0;

      const { error } = await supabase.from('units').insert([
        {
          structure_id: selectedStructureId,
          user_id: session.user.id,
          name: newUnitName,
          rent_amount: parseFloat(newUnitRent) || 0,
          tenant_name: hasTenant ? newTenantName : null,
          tenant_phone: hasTenant ? newTenantPhone : null,
          is_occupied: hasTenant,
        },
      ]);
      if (error) throw error;

      setNewUnitName('');
      setNewUnitRent('');
      setNewTenantName('');
      setNewTenantPhone('');
      setIsUnitModalOpen(false);
      fetchData();
    } catch (err) {
      console.error("Unit formulation error:", err);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  // High-Level Global Calculations
  const activeStructure = structures.find(s => s.id === selectedStructureId);
  const filteredUnits = allUnits.filter(u => u.structure_id === selectedStructureId);
  
  const totalOccupants = allUnits.filter(u => u.is_occupied).length;
  const portfolioRevenue = structures.reduce((sum, s) => sum + Number(s.monthly_revenue), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500 text-sm gap-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span>Syncing telemetry matrix...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <span className="text-xl font-bold tracking-tight text-gray-900 cursor-pointer" onClick={() => setSelectedStructureId(null)}>MaisonFlow</span>
        <button onClick={handleSignOut} className="text-sm font-medium text-red-600 hover:text-red-700 bg-transparent border-0 cursor-pointer">
          Sign Out
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Context Tracking Banner */}
        <div className="mb-8 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
              <span className="hover:text-blue-600 cursor-pointer" onClick={() => setSelectedStructureId(null)}>Portfolio</span>
              {activeStructure && <span> / {activeStructure.name}</span>}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">
              {activeStructure ? `Managing: ${activeStructure.name}` : `Welcome back, ${userName}!`}
            </h2>
          </div>
          {activeStructure && (
            <button 
              onClick={() => setSelectedStructureId(null)}
              className="text-sm text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg cursor-pointer"
            >
              ⬅ Back to Overview
            </button>
          )}
        </div>

        {/* Global Telemetry Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Active Structures</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{structures.length}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Occupants Registered</p>
            <p className="text-3xl font-bold text-gray-900 mt-2 text-emerald-600">{totalOccupants}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Expected Portfolio Revenue</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{portfolioRevenue.toLocaleString()} RWF</p>
          </div>
        </div>

        {/* MAIN CONTROLLER VIEW */}
        {!selectedStructureId ? (
          /* VIEW A: STRUCTURES DASHBOARD OVERVIEW */
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-gray-900">Your Property Portfolio</h3>
              <button 
                onClick={() => setIsStructModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer transition"
              >
                ＋ Add Structure
              </button>
            </div>

            {structures.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No structures setup yet. Click "Add Structure" to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 uppercase font-semibold text-xs tracking-wider">
                      <th className="py-3 px-4">Structure Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-center">Units Configured</th>
                      <th className="py-3 px-4 text-right">Target Base Revenue</th>
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
                          <td className="py-4 px-4 text-center font-medium text-gray-700">{unitCount} units</td>
                          <td className="py-4 px-4 text-right text-gray-900 font-medium">{Number(item.monthly_revenue).toLocaleString()} RWF</td>
                          <td className="py-4 px-4 text-right">
                            <button 
                              onClick={() => setSelectedStructureId(item.id)}
                              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold py-1.5 px-3 rounded-md cursor-pointer transition"
                            >
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
          /* VIEW B: DRILL-DOWN INDIVIDUAL UNITS MANAGEMENT */
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-semibold text-gray-900">Internal Units Matrix</h3>
                <p className="text-xs text-gray-400 mt-0.5">Track individual rooms, layout leases, and capacity allocations.</p>
              </div>
              <button 
                onClick={() => setIsUnitModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer transition"
              >
                ＋ Segment New Unit
              </button>
            </div>

            {filteredUnits.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
                This structure has no segments configured. Click "Segment New Unit" to add your first room, floor, or storefront.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 uppercase font-semibold text-xs tracking-wider">
                      <th className="py-3 px-4">Unit Label</th>
                      <th className="py-3 px-4">Standard Rent</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Current Occupant</th>
                      <th className="py-3 px-4 text-right">Contact Line</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700">
                    {filteredUnits.map((unit) => (
                      <tr key={unit.id} className="hover:bg-gray-50/50">
                        <td className="py-4 px-4 font-semibold text-gray-900">{unit.name}</td>
                        <td className="py-4 px-4 text-gray-900 font-medium">{Number(unit.rent_amount).toLocaleString()} RWF</td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${unit.is_occupied ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                            {unit.is_occupied ? 'Occupied' : 'Vacant'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-gray-700 font-medium">{unit.tenant_name || <span className="text-gray-300 italic">No Occupant linked</span>}</td>
                        <td className="py-4 px-4 text-right text-gray-500 font-mono">{unit.tenant_phone || '—'}</td>
                      </tr>
                    ))}
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
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register New Structure</h3>
            <form onSubmit={handleAddStructure} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Structure Name / Alias</label>
                <input 
                  type="text" required placeholder="e.g. Nyarugenge Plaza" value={newStructName} onChange={(e) => setNewStructName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Category Type</label>
                <select value={newStructType} onChange={(e) => setNewStructType(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black focus:outline-blue-600">
                  <option value="Apartment Block">Apartment Block</option>
                  <option value="Standalone Commercial">Standalone Commercial</option>
                  <option value="Residential House">Residential House</option>
                  <option value="Mixed-Use Facility">Mixed-Use Facility</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Total Target Monthly Revenue (RWF)</label>
                <input 
                  type="number" placeholder="e.g. 1500000" value={newStructRevenue} onChange={(e) => setNewStructRevenue(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setIsStructModalOpen(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition">Save Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SEGMENT NEW UNIT */}
      {isUnitModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Segment New Rental Unit</h3>
            <form onSubmit={handleAddUnit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Unit Label / Number</label>
                <input 
                  type="text" required placeholder="e.g. Room 101, Ground Floor Shop B" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Assigned Base Rent (RWF / Month)</label>
                <input 
                  type="number" required placeholder="e.g. 150000" value={newUnitRent} onChange={(e) => setNewUnitRent(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                />
              </div>

              <div className="border-t border-gray-100 pt-3 mt-1">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Occupant Allocation (Optional)</h4>
                <p className="text-xs text-gray-400 mb-3">Leave blank if this specific unit is currently vacant.</p>
                
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tenant Full Name</label>
                    <input 
                      type="text" placeholder="e.g. Jean Paul Nkurunziza" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Primary Phone Number</label>
                    <input 
                      type="text" placeholder="e.g. 078XXXXXXX" value={newTenantPhone} onChange={(e) => setNewTenantPhone(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setIsUnitModalOpen(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg cursor-pointer transition">Confirm Unit Segment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}