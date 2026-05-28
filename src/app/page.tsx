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

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  
  // App states
  const [structures, setStructures] = useState<Structure[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form states
  const [newStructureName, setNewStructureName] = useState('');
  const [newStructureType, setNewStructureType] = useState('Apartment Block');
  const [newRevenue, setNewRevenue] = useState('');

  // Fetch user session and database records
  const fetchData = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.push('/auth');
        return;
      }

      // Fetch Profile Name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      setUserName(profile?.full_name || session.user.email || 'User');

      // Fetch Real-Time Structures
      const { data: structuresData, error: structError } = await supabase
        .from('structures')
        .select('id, name, structure_type, monthly_revenue')
        .order('created_at', { ascending: false });

      if (structError) throw structError;
      setStructures(structuresData || []);

    } catch (error) {
      console.error("Dashboard data load failure:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  // Create a new structure asset
  const handleAddStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStructureName.trim()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from('structures').insert([
        {
          user_id: session.user.id,
          name: newStructureName,
          structure_type: newStructureType,
          monthly_revenue: parseFloat(newRevenue) || 0,
        },
      ]);

      if (error) throw error;

      // Reset form and close modal
      setNewStructureName('');
      setNewRevenue('');
      setIsModalOpen(false);
      
      // Refresh the dashboard display
      fetchData();
    } catch (err) {
      console.error("Failed to add asset:", err);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  // Calculate high-level metrics
  const totalRevenue = structures.reduce((sum, item) => sum + Number(item.monthly_revenue), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500 text-sm gap-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span>Loading real-time portfolio metrics...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">MaisonFlow</h1>
        <button onClick={handleSignOut} className="text-sm font-medium text-red-600 hover:text-red-700 bg-transparent border-0 cursor-pointer">
          Sign Out
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, {userName}!</h2>
          <p className="text-sm text-gray-500 mt-1">Real-time portfolio metrics engine.</p>
        </div>

        {/* Metrics Blocks */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Active Properties</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{structures.length}</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Occupants</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">0</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Expected Monthly Revenue</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{totalRevenue.toLocaleString()} RWF</p>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">Your Property Portfolio</h3>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer transition"
            >
              ＋ Add Structure
            </button>
          </div>

          {structures.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No properties setup yet. Click "Add Structure" to register your first house or block.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm text-left">
                <thead>
                  <tr className="text-gray-400 uppercase font-semibold text-xs tracking-wider">
                    <th className="py-3 px-4">Structure Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Expected Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {structures.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-4 px-4 font-medium text-gray-900">{item.name}</td>
                      <td className="py-4 px-4">{item.structure_type}</td>
                      <td className="py-4 px-4 text-right text-blue-600 font-medium">{Number(item.monthly_revenue).toLocaleString()} RWF</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* POPUP MODAL COMPONENT */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Register New Structure</h3>
            <form onSubmit={handleAddStructure} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Structure Name / Alias</label>
                <input 
                  type="text" required placeholder="e.g. Nyarugenge Plaza, Kacyiru Court B"
                  value={newStructureName} onChange={(e) => setNewStructureName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Category Type</label>
                <select 
                  value={newStructureType} onChange={(e) => setNewStructureType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 text-black focus:outline-blue-600"
                >
                  <option value="Apartment Block">Apartment Block</option>
                  <option value="Standalone Commercial">Standalone Commercial</option>
                  <option value="Residential House">Residential House</option>
                  <option value="Mixed-Use Facility">Mixed-Use Facility</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Total Target Monthly Revenue (RWF)</label>
                <input 
                  type="number" placeholder="e.g. 1500000"
                  value={newRevenue} onChange={(e) => setNewRevenue(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 focus:bg-white text-black focus:outline-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button 
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}