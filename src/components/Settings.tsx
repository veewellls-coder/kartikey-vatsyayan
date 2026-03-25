import React, { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Save, Building2, MapPin, Phone, Mail, CreditCard, Download, Upload, Database, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../lib/api';
import { toast } from 'sonner';

export default function Settings() {
  const [settings, setSettings] = useState({
    company_name: '',
    company_address: '',
    company_gstin: '',
    company_phone: '',
    company_email: '',
    company_state: 'Uttar Pradesh',
    logo_url: '',
    bank_name: '',
    bank_account: '',
    bank_ifsc: '',
    bank_branch: '',
    terms_and_conditions: '',
    declaration: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const data = await api.get('/settings');
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await api.post('/settings', settings);
      window.dispatchEvent(new CustomEvent('settingsUpdated'));
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleBackup() {
    setBackingUp(true);
    try {
      const data = await api.get('/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Courier_ERP_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded successfully!');
    } catch (error) {
      console.error('Backup error:', error);
      toast.error('Failed to create backup.');
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmRestore = window.confirm('WARNING: Restoring will OVERWRITE all current data. Are you sure you want to proceed?');
    if (!confirmRestore) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setRestoring(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const backupData = JSON.parse(evt.target?.result as string);
        await api.post('/restore', backupData);
        toast.success('Data restored successfully! Reloading...');
        setTimeout(() => window.location.reload(), 2000);
      } catch (error: any) {
        console.error('Restore error:', error);
        toast.error(`Restore failed: ${error.message || 'Invalid file format'}`);
      } finally {
        setRestoring(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500000) { // 500KB limit for base64
      toast.error('Logo file is too large. Please use an image smaller than 500KB.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = evt.target?.result as string;
      setSettings({ ...settings, logo_url: base64 });
      toast.success('Logo uploaded successfully!');
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Company Profile</h1>
          <p className="text-slate-500">Manage your business details for invoices</p>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <form onSubmit={handleSave} className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                  <Building2 className="w-4 h-4" />
                  Company Name
                </label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  value={settings.company_name}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  placeholder="e.g. SPEEDX EXTERPRISES"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                  <CreditCard className="w-4 h-4" />
                  GSTIN/UIN
                </label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  value={settings.company_gstin}
                  onChange={(e) => setSettings({ ...settings, company_gstin: e.target.value })}
                  placeholder="e.g. 07AAAAA0000A1Z5"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                  <Phone className="w-4 h-4" />
                  Phone Number
                </label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  value={settings.company_phone}
                  onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </label>
                <input 
                  type="email" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  value={settings.company_email}
                  onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                  placeholder="e.g. contact@speedx.com"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                  <Building2 className="w-4 h-4" />
                  Company Logo (PNG)
                </label>
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-sm"
                      value={settings.logo_url}
                      onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                      placeholder="Enter logo URL or upload below..."
                    />
                    <div className="relative">
                      <input 
                        type="file" 
                        ref={logoInputRef}
                        onChange={handleLogoUpload}
                        accept="image/png, image/jpeg"
                        className="hidden"
                      />
                      <button 
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Upload PNG/JPG Logo
                      </button>
                    </div>
                  </div>
                  {settings.logo_url && (
                    <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center p-2">
                      <img 
                        src={settings.logo_url} 
                        alt="Logo Preview" 
                        className="max-w-full max-h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                  <MapPin className="w-4 h-4" />
                  Company State
                </label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  value={settings.company_state}
                  onChange={(e) => setSettings({ ...settings, company_state: e.target.value })}
                >
                  <option value="Andhra Pradesh">Andhra Pradesh</option>
                  <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                  <option value="Assam">Assam</option>
                  <option value="Bihar">Bihar</option>
                  <option value="Chhattisgarh">Chhattisgarh</option>
                  <option value="Goa">Goa</option>
                  <option value="Gujarat">Gujarat</option>
                  <option value="Haryana">Haryana</option>
                  <option value="Himachal Pradesh">Himachal Pradesh</option>
                  <option value="Jharkhand">Jharkhand</option>
                  <option value="Karnataka">Karnataka</option>
                  <option value="Kerala">Kerala</option>
                  <option value="Madhya Pradesh">Madhya Pradesh</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Manipur">Manipur</option>
                  <option value="Meghalaya">Meghalaya</option>
                  <option value="Mizoram">Mizoram</option>
                  <option value="Nagaland">Nagaland</option>
                  <option value="Odisha">Odisha</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Sikkim">Sikkim</option>
                  <option value="Tamil Nadu">Tamil Nadu</option>
                  <option value="Telangana">Telangana</option>
                  <option value="Tripura">Tripura</option>
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                  <option value="Uttarakhand">Uttarakhand</option>
                  <option value="West Bengal">West Bengal</option>
                  <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
                  <option value="Chandigarh">Chandigarh</option>
                  <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
                  <option value="Delhi">Delhi</option>
                  <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                  <option value="Ladakh">Ladakh</option>
                  <option value="Lakshadweep">Lakshadweep</option>
                  <option value="Puducherry">Puducherry</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                <MapPin className="w-4 h-4" />
                Company Address
              </label>
              <textarea 
                rows={10}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium resize-none"
                value={settings.company_address}
                onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
                placeholder="Enter full business address..."
              />

              <div className="mt-8 space-y-6">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Bank Details</h3>
                
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">Bank Name</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                    value={settings.bank_name}
                    onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })}
                    placeholder="e.g. HDFC Bank"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">Account Number</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                    value={settings.bank_account}
                    onChange={(e) => setSettings({ ...settings, bank_account: e.target.value })}
                    placeholder="e.g. 50100012345678"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">IFSC Code</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                      value={settings.bank_ifsc}
                      onChange={(e) => setSettings({ ...settings, bank_ifsc: e.target.value })}
                      placeholder="e.g. HDFC0001234"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">Branch</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                      value={settings.bank_branch}
                      onChange={(e) => setSettings({ ...settings, bank_branch: e.target.value })}
                      placeholder="e.g. Sector 45, Noida"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-6">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Invoice Footer Details</h3>
                
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">Terms & Conditions</label>
                  <textarea 
                    rows={4}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium resize-none"
                    value={settings.terms_and_conditions}
                    onChange={(e) => setSettings({ ...settings, terms_and_conditions: e.target.value })}
                    placeholder="Enter terms and conditions (one per line)..."
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic">Tip: Enter each term on a new line.</p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">Declaration</label>
                  <textarea 
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium resize-none"
                    value={settings.declaration}
                    onChange={(e) => setSettings({ ...settings, declaration: e.target.value })}
                    placeholder="Enter declaration text..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-8 border-t border-slate-100">
            <div>
              {message.text && (
                <motion.p 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "text-sm font-medium",
                    message.type === 'success' ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {message.text}
                </motion.p>
              )}
            </div>
            <button 
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <h4 className="text-amber-800 font-bold mb-1">Important Note</h4>
        <p className="text-amber-700 text-sm">
          These details will appear on all generated invoices. Make sure the GSTIN and Address are accurate as per your legal registration.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Data Management</h3>
              <p className="text-sm text-slate-500">Backup and restore your full database</p>
            </div>
          </div>
        </div>
        
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h4 className="font-bold text-slate-900 flex items-center gap-2">
              <Download className="w-4 h-4 text-indigo-600" />
              Full Backup
            </h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Download a complete copy of your database including all clients, entries, invoices, and settings. Keep this file safe as a backup.
            </p>
            <button 
              onClick={handleBackup}
              disabled={backingUp}
              className="w-full md:w-auto px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              {backingUp ? 'Creating Backup...' : 'Download Full Backup'}
            </button>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-slate-900 flex items-center gap-2">
              <Upload className="w-4 h-4 text-rose-600" />
              Restore Data
            </h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Upload a previously downloaded backup file to restore your data. <span className="text-rose-600 font-bold italic">Warning: This will replace all current data!</span>
            </p>
            <div className="relative">
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleRestore}
                accept=".json"
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={restoring}
                className="w-full md:w-auto px-6 py-3 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Upload className="w-5 h-5" />
                {restoring ? 'Restoring...' : 'Restore from File'}
              </button>
            </div>
          </div>
        </div>

        <div className="px-8 py-4 bg-rose-50 border-t border-rose-100 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 leading-relaxed">
            Restoring data is a destructive operation. It will permanently delete all your existing clients, entries, and invoices before importing the backup. Always take a fresh backup before performing a restore.
          </p>
        </div>
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
