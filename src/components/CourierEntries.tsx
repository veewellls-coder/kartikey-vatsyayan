import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Truck, Calendar, User, MapPin, Scale, Info, ChevronDown, Edit2, Trash2, Upload, FileSpreadsheet, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { CourierEntry, Client } from '../types';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { ConfirmationModal } from './ui/ConfirmationModal';
import * as XLSX from 'xlsx';

export default function CourierEntries() {
  const [entries, setEntries] = useState<CourierEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [filterParty, setFilterParty] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDocket, setFilterDocket] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initialEntryState = {
    sNo: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    clientId: '',
    clientName: '',
    courierName: '',
    docketNo: '',
    weight: 0,
    destination: '',
    vWeight: 0,
    mode: 'Surface',
    comments: '',
    amount: 0,
    gstRate: 18
  };

  const [newEntry, setNewEntry] = useState(initialEntryState);

  useEffect(() => {
    fetchEntries();
    fetchClients();
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchEntries() {
    try {
      const data = await api.get('/entries');
      setEntries(data);
    } catch (error) {
      console.error('Error fetching entries:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchClients() {
    try {
      const data = await api.get('/clients');
      setClients(data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!newEntry.clientId) {
      toast.error('Please select a client');
      return;
    }

    const amount = isNaN(newEntry.amount) ? 0 : newEntry.amount;
    const gstRate = isNaN(newEntry.gstRate) ? 0 : newEntry.gstRate;
    const weight = isNaN(newEntry.weight) ? 0 : newEntry.weight;
    const vWeight = isNaN(newEntry.vWeight) ? 0 : newEntry.vWeight;
    const totalAmount = amount + (amount * gstRate / 100);
    
    try {
      if (editingEntryId) {
        await api.put(`/entries/${editingEntryId}`, {
          ...newEntry,
          amount,
          gstRate,
          weight,
          vWeight,
          totalAmount
        });
      } else {
        await api.post('/entries', {
          ...newEntry,
          amount,
          gstRate,
          weight,
          vWeight,
          totalAmount
        });
      }
      
      setNewEntry({
        ...initialEntryState,
        sNo: editingEntryId ? newEntry.sNo : (parseInt(newEntry.sNo) + 1).toString(),
      });
      setEditingEntryId(null);
      setClientSearch('');
      setIsModalOpen(false);
      fetchEntries();
    } catch (error) {
      console.error('Error saving entry:', error);
    }
  }

  async function handleDelete(id: string) {
    const entry = entries.find(e => e.id === id);
    if (entry?.invoiceId) {
      toast.error('Cannot delete a billed entry. Please delete the invoice first.');
      return;
    }
    setEntryToDelete(id);
    setIsDeleteModalOpen(true);
  }

  const confirmDelete = async () => {
    if (!entryToDelete) return;
    try {
      await api.delete(`/entries/${entryToDelete}`);
      toast.success('Entry deleted successfully');
      fetchEntries();
    } catch (error: any) {
      console.error('Error deleting entry:', error);
      toast.error(error.message || 'Failed to delete entry');
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      setImportData(data);
      setIsImportModalOpen(true);
    };
    reader.readAsBinaryString(file);
  };

  const processImport = async () => {
    try {
      const columnAliases = {
        sNo: ['sno', 's.no', 'serial', 'no', 'sr no', 'sr.no'],
        date: ['date', 'entry date', 'booking date'],
        client: ['client', 'party', 'party name', 'customer', 'consignor'],
        courier: ['courier', 'courier name', 'service', 'company'],
        docket: ['docket', 'docket no', 'awb', 'tracking', 'consignment no'],
        weight: ['weight', 'actual weight', 'wt'],
        destination: ['destination', 'city', 'to', 'place'],
        vWeight: ['vweight', 'volumetric weight', 'v weight', 'dim weight'],
        mode: ['mode', 'type', 'shipment type'],
        comments: ['comments', 'remarks', 'note', 'description'],
        amount: ['amount', 'rate', 'price', 'charges'],
        gstRate: ['gstrate', 'gst', 'tax', 'gst %']
      };

      const getValue = (row: any, aliases: string[]) => {
        const key = Object.keys(row).find(k => 
          aliases.includes(k.toLowerCase().trim())
        );
        return key ? row[key] : undefined;
      };

      // 1. Identify all unique client names from import data
      const uniqueClientNames: string[] = Array.from(new Set(importData.map(row => 
        getValue(row, columnAliases.client)?.toString().trim()
      ).filter(Boolean))) as string[];

      // 2. Find which clients are missing
      const existingClients = await api.get('/clients');
      const missingClientNames = uniqueClientNames.filter(name => 
        !existingClients.find((c: any) => c.name.toLowerCase() === name.toLowerCase())
      );

      // 3. Create missing clients
      if (missingClientNames.length > 0) {
        toast.info(`Creating ${missingClientNames.length} new clients...`);
        for (const name of missingClientNames) {
          await api.post('/clients', { name });
        }
        // Refresh clients list
        await fetchClients();
      }

      // 4. Re-fetch clients to get all IDs
      const allClients = await api.get('/clients');

      // 5. Format entries
      const formattedEntries = importData.map(row => {
        const clientName = getValue(row, columnAliases.client)?.toString().trim() || '';
        const client = allClients.find((c: any) => c.name.toLowerCase() === clientName.toLowerCase());
        
        if (!client && clientName) {
          throw new Error(`Failed to resolve client: ${clientName}`);
        }

        const amount = parseFloat(getValue(row, columnAliases.amount)) || 0;
        const gstRate = parseFloat(getValue(row, columnAliases.gstRate)) || 18;
        const totalAmount = amount + (amount * gstRate / 100);
        
        // Handle Excel date format
        let dateVal = getValue(row, columnAliases.date);
        let formattedDate = format(new Date(), 'yyyy-MM-dd');
        
        if (dateVal) {
          if (typeof dateVal === 'number') {
            // Excel serial date
            const date = new Date((dateVal - 25569) * 86400 * 1000);
            formattedDate = format(date, 'yyyy-MM-dd');
          } else {
            try {
              const date = new Date(dateVal);
              if (!isNaN(date.getTime())) {
                formattedDate = format(date, 'yyyy-MM-dd');
              }
            } catch (e) {
              console.error('Date parsing error:', e);
            }
          }
        }

        return {
          sNo: getValue(row, columnAliases.sNo)?.toString() || '',
          date: formattedDate,
          clientId: client?.id || '',
          clientName: client?.name || clientName || 'Unknown',
          courierName: getValue(row, columnAliases.courier) || '',
          docketNo: getValue(row, columnAliases.docket)?.toString() || '',
          weight: parseFloat(getValue(row, columnAliases.weight)) || 0,
          destination: getValue(row, columnAliases.destination) || '',
          vWeight: parseFloat(getValue(row, columnAliases.vWeight)) || 0,
          mode: getValue(row, columnAliases.mode) || 'Surface',
          comments: getValue(row, columnAliases.comments) || '',
          amount,
          gstRate,
          totalAmount
        };
      }).filter(entry => entry.clientId); // Only import entries with a valid client
      
      if (formattedEntries.length === 0) {
        throw new Error('No valid entries found to import.');
      }

      await api.post('/entries/bulk', formattedEntries);
      setIsImportModalOpen(false);
      setImportData([]);
      toast.success(`${formattedEntries.length} entries imported successfully!`);
      fetchEntries();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error.message}`);
    }
  };

  function openEditModal(entry: CourierEntry) {
    setEditingEntryId(entry.id);
    setNewEntry({
      sNo: entry.sNo,
      date: entry.date,
      clientId: entry.clientId,
      clientName: entry.clientName,
      courierName: entry.courierName,
      docketNo: entry.docketNo,
      weight: entry.weight,
      destination: entry.destination,
      vWeight: entry.vWeight,
      mode: entry.mode,
      comments: entry.comments,
      amount: entry.amount,
      gstRate: entry.gstRate
    });
    setClientSearch(entry.clientName);
    setIsModalOpen(true);
  }

  function openNewModal() {
    setEditingEntryId(null);
    setNewEntry({
      ...initialEntryState,
      sNo: entries.length > 0 ? (Math.max(...entries.map(e => parseInt(e.sNo) || 0)) + 1).toString() : '1'
    });
    setClientSearch('');
    setIsModalOpen(true);
  }

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredEntries = entries.filter(entry => {
    const matchesParty = entry.clientName.toLowerCase().includes(filterParty.toLowerCase());
    const matchesMonth = filterMonth === '' || format(new Date(entry.date), 'yyyy-MM') === filterMonth;
    const matchesDocket = entry.docketNo.toLowerCase().includes(filterDocket.toLowerCase());
    return matchesParty && matchesMonth && matchesDocket;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Courier Entries</h1>
          <p className="text-slate-500">Daily shipment logs and tracking</p>
        </div>
        <div className="flex gap-3">
          <label className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
            <Upload className="w-5 h-5" />
            Import Excel
            <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
          </label>
          <button 
            onClick={openNewModal}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Plus className="w-5 h-5" />
            New Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Filter by Party Name..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            value={filterParty}
            onChange={(e) => setFilterParty(e.target.value)}
          />
        </div>
        <div className="relative">
          <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Filter by Docket No..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            value={filterDocket}
            onChange={(e) => setFilterDocket(e.target.value)}
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="month"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">S.No</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Party Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Courier</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Docket</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Weight</th>
                 <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Destination</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Comments</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 text-sm text-slate-600">{entry.sNo}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{format(new Date(entry.date), 'dd/MM/yy')}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{entry.clientName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{entry.courierName}</td>
                    <td className="px-6 py-4 text-sm font-mono text-indigo-600">{entry.docketNo}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{entry.weight}kg</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{entry.destination}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 italic truncate max-w-[150px]">{entry.comments || '-'}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">₹{entry.totalAmount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openEditModal(entry)}
                          className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                          title="Edit Entry"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                          title="Delete Entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-slate-300" />
                      <p className="font-medium">No entries found matching your filters</p>
                      <button 
                        onClick={() => { setFilterParty(''); setFilterMonth(''); setFilterDocket(''); }}
                        className="text-indigo-600 text-sm hover:underline"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Confirmation Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Confirm Import</h3>
                  <p className="text-slate-500">You are about to import {importData.length} entries.</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl mb-6">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Excel should contain columns like:
                  <span className="block mt-2 font-mono text-xs font-bold text-indigo-600">
                    Date, Party Name, Courier, Docket No, Weight, Destination, Amount
                  </span>
                  <span className="block mt-1 text-[10px] text-slate-400 italic">
                    * New clients will be created automatically.
                  </span>
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={processImport}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  Import Data
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Entry Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {editingEntryId ? 'Edit Courier Entry' : 'New Courier Entry'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>

                <form onSubmit={handleAddEntry} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">S.No</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={newEntry.sNo}
                        onChange={(e) => setNewEntry({ ...newEntry, sNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Date</label>
                      <input 
                        required
                        type="date" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={newEntry.date}
                        onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                      />
                    </div>
                    <div className="relative" ref={dropdownRef}>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Party Name *</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          required
                          type="text" 
                          placeholder="Search client..."
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          value={clientSearch || newEntry.clientName}
                          onFocus={() => setShowClientDropdown(true)}
                          onChange={(e) => {
                            setClientSearch(e.target.value);
                            setNewEntry({ ...newEntry, clientName: e.target.value, clientId: '' });
                            setShowClientDropdown(true);
                          }}
                        />
                      </div>
                      
                      <AnimatePresence>
                        {showClientDropdown && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto"
                          >
                            {/* Quick Cash Option */}
                            <button
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors flex items-center justify-between group border-b border-slate-100"
                              onClick={() => {
                                setNewEntry({ ...newEntry, clientId: 'CASH', clientName: 'Cash' });
                                setClientSearch('Cash');
                                setShowClientDropdown(false);
                              }}
                            >
                              <span className="font-bold text-indigo-600">Cash Invoice</span>
                              <ChevronDown className="w-4 h-4 text-indigo-400 group-hover:text-indigo-500 -rotate-90" />
                            </button>

                            {filteredClients.filter(c => c.id !== 'CASH').map(client => (
                              <button
                                key={client.id}
                                type="button"
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                                onClick={() => {
                                  setNewEntry({ ...newEntry, clientId: client.id, clientName: client.name });
                                  setClientSearch(client.name);
                                  setShowClientDropdown(false);
                                }}
                              >
                                <span className="font-medium text-slate-700">{client.name}</span>
                                <ChevronDown className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 -rotate-90" />
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Courier Details */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Courier Service</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={newEntry.courierName}
                        onChange={(e) => setNewEntry({ ...newEntry, courierName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Docket No *</label>
                      <input 
                        required
                        type="text" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={newEntry.docketNo}
                        onChange={(e) => setNewEntry({ ...newEntry, docketNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Destination</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={newEntry.destination}
                        onChange={(e) => setNewEntry({ ...newEntry, destination: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Weight & Amount */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Weight (kg)</label>
                        <input 
                          type="number" step="0.01"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          value={isNaN(newEntry.weight) ? '' : newEntry.weight}
                          onChange={(e) => setNewEntry({ ...newEntry, weight: e.target.value === '' ? NaN : parseFloat(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">V-Weight</label>
                        <input 
                          type="number" step="0.01"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          value={isNaN(newEntry.vWeight) ? '' : newEntry.vWeight}
                          onChange={(e) => setNewEntry({ ...newEntry, vWeight: e.target.value === '' ? NaN : parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Amount (₹)</label>
                        <input 
                          type="number" 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          value={isNaN(newEntry.amount) ? '' : newEntry.amount}
                          onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value === '' ? NaN : parseFloat(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">GST %</label>
                        <select 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          value={isNaN(newEntry.gstRate) ? 18 : newEntry.gstRate}
                          onChange={(e) => setNewEntry({ ...newEntry, gstRate: parseInt(e.target.value) })}
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Mode</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={newEntry.mode}
                        onChange={(e) => setNewEntry({ ...newEntry, mode: e.target.value })}
                      >
                        <option value="Surface">Surface</option>
                        <option value="Air">Air</option>
                        <option value="Express">Express</option>
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Comments</label>
                    <textarea 
                      rows={2}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                      value={newEntry.comments}
                      onChange={(e) => setNewEntry({ ...newEntry, comments: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-3 flex items-center justify-between bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <div>
                      <p className="text-sm text-slate-500">Total Amount (Inc. GST)</p>
                      <p className="text-3xl font-bold text-slate-900">₹{((isNaN(newEntry.amount) ? 0 : newEntry.amount) + ((isNaN(newEntry.amount) ? 0 : newEntry.amount) * (isNaN(newEntry.gstRate) ? 0 : newEntry.gstRate) / 100)).toFixed(2)}</p>
                    </div>
                    <button 
                      type="submit"
                      className="bg-indigo-600 text-white font-bold px-12 py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                    >
                      {editingEntryId ? 'Update Entry' : 'Save Entry'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Entry"
        message="Are you sure you want to delete this entry? This will also remove it from the ledger."
        confirmText="Delete"
      />
    </div>
  );
}
