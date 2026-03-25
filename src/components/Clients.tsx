import React, { useState, useEffect } from 'react';
import { Plus, Search, User, Phone, Mail, MapPin, CreditCard, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Client } from '../types';
import { api } from '../lib/api';
import { ConfirmationModal } from './ui/ConfirmationModal';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  
  const initialClientState = {
    name: '',
    gstin: '',
    address: '',
    state: 'Uttar Pradesh',
    phone: '',
    email: ''
  };

  const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", 
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", 
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", 
    "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", 
    "Lakshadweep", "Puducherry"
  ];

  const [newClient, setNewClient] = useState(initialClientState);

  useEffect(() => {
    fetchClients();
  }, []);

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

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingClientId) {
        await api.put(`/clients/${editingClientId}`, newClient);
      } else {
        await api.post('/clients', newClient);
      }
      setNewClient(initialClientState);
      setEditingClientId(null);
      setIsModalOpen(false);
      fetchClients();
    } catch (error) {
      console.error('Error saving client:', error);
    }
  }

  async function handleDeleteClient(id: string) {
    setClientToDelete(id);
    setIsDeleteModalOpen(true);
  }

  async function confirmDeleteClient() {
    if (!clientToDelete) return;
    try {
      await api.delete(`/clients/${clientToDelete}`);
      toast.success('Client deleted successfully');
      fetchClients();
    } catch (error: any) {
      toast.error(error.message || 'Error deleting client');
    }
  }

  function openEditModal(client: Client) {
    setEditingClientId(client.id);
    setNewClient({
      name: client.name,
      gstin: client.gstin || '',
      address: client.address || '',
      state: client.state || 'Uttar Pradesh',
      phone: client.phone || '',
      email: client.email || ''
    });
    setIsModalOpen(true);
  }

  function openAddModal() {
    setEditingClientId(null);
    setNewClient(initialClientState);
    setIsModalOpen(true);
  }

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.gstin?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500">Manage your business clients and their details</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <Plus className="w-5 h-5" />
          Add Client
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input 
          type="text" 
          placeholder="Search clients by name or GSTIN..." 
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClients.map((client) => (
          <motion.div
            key={client.id}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <User className="w-6 h-6" />
              </div>
              <div className="flex flex-col items-end gap-2">
                {client.gstin && (
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-md uppercase tracking-wider">
                    GST: {client.gstin}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => openEditModal(client)}
                    className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                    title="Edit Client"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteClient(client.id)}
                    className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                    title="Delete Client"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-4">{client.name}</h3>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                {client.phone || 'N/A'}
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                {client.email || 'N/A'}
              </div>
              <div className="flex items-start gap-3 text-sm text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex flex-col">
                  <span className="line-clamp-2">{client.address || 'N/A'}</span>
                  <span className="text-xs font-bold text-slate-400 mt-1 uppercase">{client.state || 'Uttar Pradesh'}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Client Modal */}
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
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {editingClientId ? 'Edit Client' : 'Add New Client'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>

                <form onSubmit={handleAddClient} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Client Name *</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">GSTIN</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={newClient.gstin}
                      onChange={(e) => setNewClient({ ...newClient, gstin: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Phone</label>
                      <input 
                        type="tel" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        value={newClient.phone}
                        onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                      <input 
                        type="email" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        value={newClient.email}
                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Address</label>
                    <textarea 
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                      value={newClient.address}
                      onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">State</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={newClient.state}
                      onChange={(e) => setNewClient({ ...newClient, state: e.target.value })}
                    >
                      {indianStates.map(state => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                  >
                    {editingClientId ? 'Update Client' : 'Save Client'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDeleteClient}
        title="Delete Client"
        message="Are you sure you want to delete this client? This will fail if they have existing entries or invoices."
        confirmText="Delete"
      />
    </div>
  );
}
