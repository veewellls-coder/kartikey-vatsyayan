/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  Users, 
  Truck, 
  FileText, 
  LayoutDashboard, 
  BookOpen, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Plus,
  Search,
  ChevronRight,
  TrendingUp,
  Package,
  CreditCard,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Toaster } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Components
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import CourierEntries from './components/CourierEntries';
import Invoices from './components/Invoices';
import Ledger from './components/Ledger';
import SettingsPage from './components/Settings';

import { api } from './lib/api';

function Sidebar({ isOpen, setIsOpen, logoUrl }: { isOpen: boolean; setIsOpen: (val: boolean) => void; logoUrl?: string }) {
  const location = useLocation();
  
  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Clients', icon: Users, path: '/clients' },
    { name: 'Courier Entries', icon: Truck, path: '/entries' },
    { name: 'Invoices', icon: FileText, path: '/invoices' },
    { name: 'Ledger', icon: BookOpen, path: '/ledger' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ x: isOpen ? 0 : -280 }}
        className={cn(
          "fixed top-0 left-0 bottom-0 w-[280px] bg-white border-r border-slate-200 z-50 transition-all duration-300 lg:translate-x-0",
          !isOpen && "lg:w-[80px]"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-bottom border-slate-100">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
                  S
                </div>
              )}
              {isOpen && (
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="ml-3 font-semibold text-slate-900 truncate"
                >
                  SpeedX ERP
                </motion.span>
              )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={cn(
                    "flex items-center px-3 py-2 rounded-lg transition-colors group",
                    isActive 
                      ? "bg-indigo-50 text-indigo-600" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                  {isOpen && (
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="ml-3 font-medium"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center px-3 py-2 text-slate-600">
              <Settings className="w-5 h-5 text-slate-400" />
              {isOpen && <span className="ml-3 font-medium">Local Mode</span>}
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

export default function App() {
  console.log('App is rendering');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetchSettings();
    window.addEventListener('settingsUpdated', fetchSettings);
    return () => window.removeEventListener('settingsUpdated', fetchSettings);
  }, []);

  async function fetchSettings() {
    try {
      const data = await api.get('/settings');
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-slate-50">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} logoUrl={settings?.logo_url} />
        
        <main className={cn(
          "transition-all duration-300 min-h-screen",
          sidebarOpen ? "lg:ml-[280px]" : "lg:ml-[80px]"
        )}>
          {/* Header */}
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900">Admin User</p>
                <p className="text-xs text-slate-500">Local Database</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-slate-100 flex items-center justify-center text-slate-500 font-bold">
                A
              </div>
            </div>
          </header>

          {/* Content Area */}
          <div className="p-6 max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/entries" element={<CourierEntries />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}


