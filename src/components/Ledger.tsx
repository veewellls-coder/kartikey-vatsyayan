import React, { useState, useEffect } from 'react';
import { BookOpen, Search, ArrowUpRight, ArrowDownLeft, Calendar, User, CreditCard, Filter, FileSpreadsheet, Plus, X, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LedgerTransaction, Client } from '../types';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '../lib/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Ledger() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'invoice' as LedgerTransaction['type'],
    amount: '',
    description: '',
    paymentMode: 'Cash'
  });

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
      // Filter to only show 'invoice' and 'receipt' as requested
      const filteredData = data.filter((t: LedgerTransaction) => t.type === 'invoice' || t.type === 'receipt');
      setTransactions(filteredData);
      
      // Calculate balance based on filtered transactions
      const total = filteredData.reduce((acc: number, curr: LedgerTransaction) => {
        if (curr.type === 'invoice') return acc + curr.amount;
        if (curr.type === 'receipt') return acc - curr.amount;
        return acc;
      }, 0);
      setBalance(total);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) return;
    
    setIsSubmitting(true);
    try {
      await api.post('/ledger', {
        ...formData,
        clientId: selectedClientId,
        amount: parseFloat(formData.amount)
      });
      setIsModalOpen(false);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'invoice',
        amount: '',
        description: '',
        paymentMode: 'Cash'
      });
      fetchTransactions(selectedClientId);
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Failed to add transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const filteredTransactions = transactions.filter(t => {
    const date = parseISO(t.date);
    return isWithinInterval(date, {
      start: startOfDay(parseISO(startDate)),
      end: endOfDay(parseISO(endDate))
    });
  });

  const currentBalance = filteredTransactions.reduce((acc, curr) => {
    if (curr.type === 'invoice') return acc + curr.amount;
    if (curr.type === 'receipt') return acc - curr.amount;
    return acc;
  }, 0);

  const exportToExcel = () => {
    if (!selectedClient) return;

    const data = filteredTransactions.map(t => ({
      'Date': format(new Date(t.date), 'dd/MM/yyyy'),
      'Description': t.description,
      'Type': t.type,
      'Payment Mode': t.paymentMode || '-',
      'Debit (Dr)': t.type === 'invoice' ? t.amount : 0,
      'Credit (Cr)': t.type === 'receipt' ? t.amount : 0,
    }));

    // Add summary rows
    data.push({
      'Date': '',
      'Description': 'TOTALS',
      'Type': '',
      'Payment Mode': '',
      'Debit (Dr)': filteredTransactions.filter(t => t.type === 'invoice').reduce((acc, curr) => acc + curr.amount, 0),
      'Credit (Cr)': filteredTransactions.filter(t => t.type === 'receipt').reduce((acc, curr) => acc + curr.amount, 0),
    });

    data.push({
      'Date': '',
      'Description': 'CLOSING BALANCE',
      'Type': '',
      'Payment Mode': '',
      'Debit (Dr)': currentBalance > 0 ? Math.abs(currentBalance) : 0,
      'Credit (Cr)': currentBalance <= 0 ? Math.abs(currentBalance) : 0,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `Ledger_${selectedClient.name.replace(/\s+/g, '_')}_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  const exportToPDF = () => {
    if (!selectedClient) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('CLIENT LEDGER', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
    
    // Client Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Client Details:', 14, 45);
    doc.setFontSize(10);
    doc.text(`Name: ${selectedClient.name}`, 14, 52);
    doc.text(`GSTIN: ${selectedClient.gstin || 'N/A'}`, 14, 58);
    doc.text(`Period: ${format(parseISO(startDate), 'dd/MM/yyyy')} to ${format(parseISO(endDate), 'dd/MM/yyyy')}`, 14, 64);

    // Summary
    const totalInvoiced = filteredTransactions.filter(t => t.type === 'invoice').reduce((acc, curr) => acc + curr.amount, 0);
    const totalReceipts = filteredTransactions.filter(t => t.type === 'receipt').reduce((acc, curr) => acc + curr.amount, 0);

    autoTable(doc, {
      startY: 75,
      head: [['Date', 'Description', 'Type', 'Mode', 'Debit (Dr)', 'Credit (Cr)']],
      body: filteredTransactions.map(t => [
        format(new Date(t.date), 'dd/MM/yyyy'),
        t.description,
        t.type.toUpperCase(),
        t.paymentMode || '-',
        t.type === 'invoice' ? `₹${t.amount.toLocaleString()}` : '-',
        t.type === 'receipt' ? `₹${t.amount.toLocaleString()}` : '-'
      ]),
      foot: [
        ['', 'TOTALS', '', '', `₹${totalInvoiced.toLocaleString()}`, `₹${totalReceipts.toLocaleString()}`],
        ['', 'CLOSING BALANCE', '', '', currentBalance > 0 ? `₹${Math.abs(currentBalance).toLocaleString()} Dr` : '-', currentBalance <= 0 ? `₹${Math.abs(currentBalance).toLocaleString()} Cr` : '-']
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold' },
      styles: { fontSize: 8 }
    });

    doc.save(`Ledger_${selectedClient.name.replace(/\s+/g, '_')}_${format(new Date(), 'ddMMyyyy')}.pdf`);
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
            <>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">From</span>
                  <input 
                    type="date" 
                    className="text-xs font-medium text-slate-600 bg-transparent border-none p-0 focus:ring-0"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="w-px h-8 bg-slate-100 mx-1" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">To</span>
                  <input 
                    type="date" 
                    className="text-xs font-medium text-slate-600 bg-transparent border-none p-0 focus:ring-0"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-sm"
              >
                <Plus className="w-5 h-5" />
                Add Transaction
              </button>
              <button 
                onClick={exportToPDF}
                className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
              >
                <FileText className="w-5 h-5 text-indigo-600" />
                Export PDF
              </button>
              <button 
                onClick={exportToExcel}
                className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Export Excel
              </button>
            </>
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
                currentBalance > 0 ? "text-red-600" : "text-emerald-600"
              )}>
                ₹{Math.abs(currentBalance).toLocaleString()} {currentBalance > 0 ? 'Dr' : 'Cr'}
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Total Invoiced</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                ₹{filteredTransactions
                  .filter(t => t.type === 'invoice')
                  .reduce((acc, curr) => acc + curr.amount, 0)
                  .toLocaleString()}
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Total Receipts</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                ₹{filteredTransactions
                  .filter(t => t.type === 'receipt')
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
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Mode</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Debit (Dr)</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 font-medium">{t.description}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                          t.type === 'invoice' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {t.paymentMode || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-red-600">
                        {t.type === 'invoice' ? `₹${t.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                        {t.type === 'receipt' ? `₹${t.amount.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No transactions found for the selected period.
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

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-900">Add Ledger Entry</h2>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-white rounded-full text-slate-400 transition-colors shadow-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddTransaction} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                    <input 
                      type="date" 
                      required
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                    <select 
                      required
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    >
                      <option value="invoice">Invoice (Debit)</option>
                      <option value="receipt">Receipt (Credit)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount (₹)</label>
                  <input 
                    type="number" 
                    required
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-lg"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                  <textarea 
                    required
                    placeholder="Enter transaction details..."
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 h-24 resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {(formData.type === 'receipt' || formData.type === 'payment') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Payment Mode</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      value={formData.paymentMode}
                      onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Adding...' : 'Add Transaction'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
