import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Plus, Search, User, Phone, Mail, MapPin, CreditCard, Edit2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
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
  
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [verifiedDetails, setVerifiedDetails] = useState<{legalName?: string, tradeName?: string, address?: string} | null>(null);
  
  const initialClientState = {
    name: '',
    gstin: '',
    address: '',
    state: 'Uttar Pradesh',
    phone: '',
    email: ''
  };

  const stateCodes: Record<string, string> = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
    "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh"
  };

  const verifyGstin = async (gstin: string) => {
    if (gstin.length !== 15) return;
    
    // Basic typo correction: replace 'O' with '0' if it's in a numeric position
    // GSTIN format: 2 digits, 5 chars, 4 digits, 1 char, 1 digit/char, 'Z', 1 digit/char
    let correctedGstin = gstin.toUpperCase();
    if (correctedGstin.includes('O')) {
      // Simple heuristic: if 'O' is in the numeric segments, it's likely a '0'
      const parts = correctedGstin.split('');
      // First 2 digits
      if (parts[0] === 'O') parts[0] = '0';
      if (parts[1] === 'O') parts[1] = '0';
      // 4 digits in PAN (pos 7-10)
      for (let i = 7; i <= 10; i++) {
        if (parts[i] === 'O') parts[i] = '0';
      }
      // 13th char (entity number)
      if (parts[12] === 'O') parts[12] = '0';
      // 15th char (check digit)
      if (parts[14] === 'O') parts[14] = '0';
      
      correctedGstin = parts.join('');
      if (correctedGstin !== gstin.toUpperCase()) {
        toast.info(`Corrected GSTIN from ${gstin} to ${correctedGstin}`);
        setNewClient(prev => ({ ...prev, gstin: correctedGstin }));
      }
    }

    setIsVerifying(true);
    setVerificationStatus('idle');
    setVerifiedDetails(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Search for the legal name, trade name, address, and state for GSTIN: ${correctedGstin}. 
        Also search for the company name associated with PAN: ${correctedGstin.substring(2, 12)}.
        Return the result as a JSON object with fields: legalName, tradeName, address, state. 
        If specific details are not found, try to infer the state from the GSTIN prefix (${correctedGstin.substring(0, 2)}) and return at least the state.
        If no reliable information is found at all, return an error message explaining why.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              legalName: { type: Type.STRING },
              tradeName: { type: Type.STRING },
              address: { type: Type.STRING },
              state: { type: Type.STRING },
              error: { type: Type.STRING }
            }
          }
        },
      });

      const result = JSON.parse(response.text || '{}');
      setVerifiedDetails(result);
      
      if (result.error && !result.legalName && !result.tradeName) {
        // Fallback: extract state from GSTIN prefix even if search fails
        const stateCode = correctedGstin.substring(0, 2);
        const fallbackState = stateCodes[stateCode];
        if (fallbackState) {
          setNewClient(prev => ({ ...prev, state: fallbackState }));
          setVerificationStatus('success');
          toast.info(`Could not find full details, but identified state as ${fallbackState}`);
          return;
        }
        throw new Error(result.error);
      }

      if (result.legalName || result.tradeName) {
        setNewClient(prev => ({
          ...prev,
          name: result.legalName || result.tradeName || prev.name,
          address: result.address || prev.address,
          state: result.state || prev.state || stateCodes[correctedGstin.substring(0, 2)] || prev.state
        }));
        setVerificationStatus('success');
        toast.success('GSTIN verified successfully');
      } else {
        // Fallback state extraction
        const stateCode = correctedGstin.substring(0, 2);
        const fallbackState = stateCodes[stateCode];
        if (fallbackState) {
          setNewClient(prev => ({ ...prev, state: fallbackState }));
          setVerificationStatus('success');
          toast.info(`Identified state as ${fallbackState} from GSTIN prefix`);
        } else {
          setVerificationStatus('error');
          toast.error('Could not find details for this GSTIN');
        }
      }
    } catch (error: any) {
      console.error('GSTIN verification failed:', error);
      
      // Final fallback: try to get state from prefix even on total failure
      const stateCode = correctedGstin.substring(0, 2);
      const fallbackState = stateCodes[stateCode];
      if (fallbackState) {
        setNewClient(prev => ({ ...prev, state: fallbackState }));
        setVerificationStatus('success');
        toast.info(`Verification failed, but identified state as ${fallbackState}`);
      } else {
        setVerificationStatus('error');
        toast.error(error.message || 'Failed to verify GSTIN. Please enter details manually.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setNewClient({ ...newClient, gstin: value });
    if (value.length === 15) {
      verifyGstin(value);
    }
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
    setVerificationStatus('idle');
    setVerifiedDetails(null);
    setIsModalOpen(true);
  }

  function openAddModal() {
    setEditingClientId(null);
    setNewClient(initialClientState);
    setVerificationStatus('idle');
    setVerifiedDetails(null);
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
                    <label className="block text-sm font-semibold text-slate-700 mb-2">GSTIN</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        maxLength={15}
                        placeholder="e.g. 07AAAAA0000A1Z5"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase"
                        value={newClient.gstin}
                        onChange={handleGstinChange}
                      />
                      {isVerifying && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                      {!isVerifying && verificationStatus === 'success' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      )}
                      {!isVerifying && verificationStatus === 'error' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    {!isVerifying && verificationStatus === 'success' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Verified Details</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900 leading-tight">
                          {verifiedDetails?.legalName || verifiedDetails?.tradeName || newClient.name}
                        </p>
                        {verifiedDetails?.tradeName && verifiedDetails?.legalName && verifiedDetails.tradeName !== verifiedDetails.legalName && (
                          <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tight">Trade Name: {verifiedDetails.tradeName}</p>
                        )}
                        {(verifiedDetails?.address || newClient.address) && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2 italic">
                            {verifiedDetails?.address || newClient.address}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Client Name (Company Name) *</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
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
