import React, { useState, useEffect } from 'react';
import { BookOpen, Search, ArrowUpRight, ArrowDownLeft, Calendar, User, CreditCard, Filter, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LedgerTransaction, Client } from '../types';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '../lib/api';
import * as XLSX from 'xlsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Ledger() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      fetchTransactions(selectedClientId);
    } else {
      setTransactions([]);
      setBalance(0);
    }
  }, [selectedClientId]);

  async function fetchClients() {
    try {
      const data = await api.get('/clients');
      setClients(data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTransactions(clientId: string) {
    try {
      const data = await api.get(`/ledger/${clientId}`);
      setTransactions(data);
      
      // Calculate balance
      const total = data.reduce((acc: number, curr: LedgerTransaction) => {
        if (curr.type === 'sale' || curr.type === 'purchase') return acc + curr.amount;
        if (curr.type === 'payment' || curr.type === 'receipt') return acc - curr.amount;
        return acc;
      }, 0);
      setBalance(total);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const exportToExcel = () => {
    if (!selectedClient) return;

    const data = transactions.map(t => ({
      'Date': format(new Date(t.date), 'dd/MM/yyyy'),
      'Description': t.description,
      'Type': t.type,
      'Debit (Dr)': (t.type === 'sale' || t.type === 'purchase') ? t.amount : 0,
      'Credit (Cr)': (t.type === 'receipt' || t.type === 'payment') ? t.amount : 0,
    }));

    // Add summary rows
    data.push({
      'Date': '',
      'Description': 'TOTALS',
      'Type': '',
      'Debit (Dr)': transactions.filter(t => t.type === 'sale' || t.type === 'purchase').reduce((acc, curr) => acc + curr.amount, 0),
      'Credit (Cr)': transactions.filter(t => t.type === 'receipt' || t.type === 'payment').reduce((acc, curr) => acc + curr.amount, 0),
    });

    data.push({
      'Date': '',
      'Description': 'CLOSING BALANCE',
      'Type': '',
      'Debit (Dr)': balance > 0 ? Math.abs(balance) : 0,
      'Credit (Cr)': balance <= 0 ? Math.abs(balance) : 0,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `Ledger_${selectedClient.name.replace(/\s+/g, '_')}_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Ledger</h1>
          <p className="text-slate-500">Track transaction history and outstanding balances</p>
        </div>
        <div className="flex items-center gap-4">
          {selectedClientId && (
            <button 
              onClick={exportToExcel}
              className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
            >
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Export Ledger
            </button>
          )}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="">-- Select Client --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedClientId ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Current Balance</p>
              <p className={cn(
                "text-3xl font-bold mt-1",
                balance > 0 ? "text-red-600" : "text-emerald-600"
              )}>
                ₹{Math.abs(balance).toLocaleString()} {balance > 0 ? 'Dr' : 'Cr'}
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Total Sales</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                ₹{transactions
                  .filter(t => t.type === 'sale')
                  .reduce((acc, curr) => acc + curr.amount, 0)
                  .toLocaleString()}
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Total Payments</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                ₹{transactions
                  .filter(t => t.type === 'receipt' || t.type === 'payment')
                  .reduce((acc, curr) => acc + curr.amount, 0)
                  .toLocaleString()}
              </p>
            </div>
          </div>

          {/* Transaction List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Transaction History</h3>
              <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
                <Filter className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Debit (Dr)</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 font-medium">{t.description}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                          t.type === 'sale' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-red-600">
                        {(t.type === 'sale' || t.type === 'purchase') ? `₹${t.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                        {(t.type === 'receipt' || t.type === 'payment') ? `₹${t.amount.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        No transactions found for this client.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 border-dashed p-20 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Select a Client</h3>
          <p className="text-slate-500 max-w-xs mx-auto">
            Please select a client from the dropdown to view their transaction history and ledger.
          </p>
        </div>
      )}
    </div>
  );
}
