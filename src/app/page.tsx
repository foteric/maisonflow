// Location: src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './lib/supabase'; // Points to your build-safe lib folder

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  // 1. Check if a user is actively signed in when the page loads
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // No active keys? Bounce them back to the login screen immediately
        router.push('/auth');
        return;
      }

      // Fetch the user's name from your profiles table matching their auth ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();

      if (profile?.full_name) {
        setUserName(profile.full_name);
      } else {
        setUserName(session.user.email || 'User');
      }
      setLoading(false);
    };

    checkUser();
  }, [router]);

  // 2. Dynamic Sign Out Engine
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth'); // Redirect straight to login screen
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
        Loading your real-time portfolio metrics...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">MaisonFlow</h1>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleSignOut} 
            className="text-sm font-medium text-red-600 hover:text-red-700 cursor-pointer bg-transparent border-0"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, {userName}!</h2>
          <p className="text-sm text-gray-500 mt-1">Real-time portfolio metrics engine.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Active Properties</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">0</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Occupants</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">0</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Expected Portfolio Revenue</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">0 RWF</p>
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-900">Your Property Portfolio</h3>
            <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer transition">
              ＋ Add Structure
            </button>
          </div>
          <div className="text-center py-12 text-gray-400 text-sm">
            No properties setup yet. Click "Add Structure" to register your first house or block.
          </div>
        </div>
      </main>
    </div>
  );
}