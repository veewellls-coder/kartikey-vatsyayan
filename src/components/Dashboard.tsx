import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Package, CreditCard } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalClients: 0,
    totalEntries: 0,
    totalInvoices: 0,
    totalRevenue: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await api.get('/stats');
        setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const cards = [
    { name: 'Total Clients', value: stats.totalClients, icon: Users, color: 'bg-blue-500' },
    { name: 'Total Entries', value: stats.totalEntries, icon: Package, color: 'bg-indigo-500' },
    { name: 'Total Invoices', value: stats.totalInvoices, icon: CreditCard, color: 'bg-emerald-500' },
    { name: 'Total Revenue', value: `₹${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'bg-amber-500' },
  ];

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Welcome back to your SpeedX ERP</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <motion.div
            key={card.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.color} p-3 rounded-xl text-white`}>
                <card.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500">{card.name}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity or Charts could go here */}
    </div>
  );
}
