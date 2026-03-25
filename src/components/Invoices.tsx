import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, CheckCircle, Clock, Download, Printer, X, ChevronRight, FileSpreadsheet, Upload, Trash2, Edit2, Calendar, Eye, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Invoice, Client, CourierEntry } from '../types';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '../lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ConfirmationModal } from './ui/ConfirmationModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getDirectImageUrl = (url: string) => {
  if (!url) return url;
  
  // Handle Google Drive links
  const driveMatch = url.match(/\/(?:d|open\?id)=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  
  return url;
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const directUrl = getDirectImageUrl(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image: ' + directUrl));
    img.src = directUrl;
  });
};

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [unbilledEntries, setUnbilledEntries] = useState<CourierEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [invoiceStatus, setInvoiceStatus] = useState<'paid' | 'unpaid'>('unpaid');

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [filterParty, setFilterParty] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  useEffect(() => {
    fetchInvoices();
    fetchClients();
    fetchSettings();
    window.addEventListener('settingsUpdated', fetchSettings);
    return () => window.removeEventListener('settingsUpdated', fetchSettings);
  }, []);

  async function fetchSettings() {
    try {
      const data = await api.get('/settings');
      setCompanySettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }

  useEffect(() => {
    if (selectedClientId) {
      fetchUnbilledEntries(selectedClientId);
    } else {
      setUnbilledEntries([]);
    }
  }, [selectedClientId]);

  async function fetchInvoices() {
    try {
      const data = await api.get('/invoices');
      setInvoices(data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
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

  async function fetchUnbilledEntries(clientId: string) {
    try {
      const data = await api.get(`/entries/unbilled/${clientId}`);
      setUnbilledEntries(data);
    } catch (error) {
      console.error('Error fetching unbilled entries:', error);
    }
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();

    if (editingInvoice) {
      try {
        await api.put(`/invoices/${editingInvoice.id}`, {
          invoiceNo,
          date: invoiceDate,
          status: invoiceStatus
        });
        setIsModalOpen(false);
        setEditingInvoice(null);
        fetchInvoices();
      } catch (error) {
        console.error('Error updating invoice:', error);
      }
      return;
    }

    if (!selectedClientId || selectedEntryIds.length === 0) {
      toast.error('Select client and entries');
      return;
    }

    const selectedEntries = unbilledEntries.filter(e => selectedEntryIds.includes(e.id));
    const subtotal = selectedEntries.reduce((acc, curr) => acc + curr.amount, 0);
    const grandTotal = selectedEntries.reduce((acc, curr) => acc + curr.totalAmount, 0);
    const gstTotal = grandTotal - subtotal;
    const client = clients.find(c => c.id === selectedClientId);

    try {
      await api.post('/invoices', {
        invoiceNo,
        date: invoiceDate,
        clientId: selectedClientId,
        clientName: client?.name || '',
        clientGstin: client?.gstin || '',
        subtotal,
        gstTotal,
        grandTotal,
        entryIds: selectedEntryIds
      });

      setIsModalOpen(false);
      setSelectedClientId('');
      setSelectedEntryIds([]);
      setInvoiceNo('');
      fetchInvoices();
    } catch (error) {
      console.error('Error creating invoice:', error);
    }
  }

  async function handleDeleteInvoice(id: string) {
    setInvoiceToDelete(id);
    setIsDeleteModalOpen(true);
  }

  async function confirmDeleteInvoice() {
    if (!invoiceToDelete) return;
    try {
      await api.delete(`/invoices/${invoiceToDelete}`);
      toast.success('Invoice deleted successfully');
      fetchInvoices();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast.error(error.message || 'Failed to delete invoice');
    }
  }

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setInvoiceNo(invoice.invoiceNo);
    setInvoiceDate(format(new Date(invoice.date), 'yyyy-MM-dd'));
    setInvoiceStatus(invoice.status);
    setSelectedClientId(invoice.clientId);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingInvoice(null);
    setInvoiceNo('');
    setInvoiceDate(format(new Date(), 'yyyy-MM-dd'));
    setInvoiceStatus('unpaid');
    setSelectedClientId('');
    setSelectedEntryIds([]);
    setIsModalOpen(true);
  };

  const toggleEntrySelection = (id: string) => {
    setSelectedEntryIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const generatePDF = async (invoice: Invoice, action: 'download' | 'view' = 'download') => {
    try {
      const details = await api.get(`/invoices/${invoice.id}`);
      const client = await api.get(`/clients/${invoice.clientId}`);
      const doc = new jsPDF();
      
      const companyName = companySettings?.company_name || "SPEEDX EXTERPRISES";
      const companyAddress = companySettings?.company_address || "123, Business Park, Sector 45\nNew Delhi - 110001";
      const companyGstin = companySettings?.company_gstin || "07AAAAA0000A1Z5";
      const companyPhone = companySettings?.company_phone || "+91 98765 43210";
      const companyState = (companySettings?.company_state || "Uttar Pradesh").trim();
      
      const bankName = companySettings?.bank_name || "";
      const bankAccount = companySettings?.bank_account || "";
      const bankIfsc = companySettings?.bank_ifsc || "";
      const bankBranch = companySettings?.bank_branch || "";

      const clientState = (client?.state || "Uttar Pradesh").trim();
      const isIntraState = clientState.toLowerCase() === companyState.toLowerCase();
      
      // Helper for number to words (simplified)
      const numberToWords = (num: number) => {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        
        const format = (n: number): string => {
          if (n < 20) return a[n];
          if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + a[n % 10] : '');
          if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + format(n % 100) : '');
          return '';
        };
        
        const whole = Math.floor(num);
        const fraction = Math.round((num - whole) * 100);
        let res = format(whole) + 'Rupees ';
        if (fraction > 0) res += 'and ' + format(fraction) + 'Paise ';
        return res + 'Only';
      };

      // Border
      doc.rect(10, 10, 190, 277);
      
      // Logo
      if (companySettings?.logo_url) {
        try {
          const img = await loadImage(companySettings.logo_url);
          doc.addImage(img, 'PNG', 15, 12, 15, 15);
        } catch (e) {
          console.error('Error adding logo to PDF:', e);
        }
      }
      
      // Header
      doc.setFillColor(240, 240, 240);
      doc.rect(10, 10, 190, 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('TAX INVOICE', 105, 18, { align: 'center' });
      doc.line(10, 22, 200, 22);
      
      // Company & Invoice Info Grid
      doc.setFontSize(10);
      doc.text(companyName, 15, 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(companyAddress, 15, 33);
      doc.text(`GSTIN: ${companyGstin}`, 15, 45);
      doc.text(`Phone: ${companyPhone}`, 15, 50);
      
      doc.line(105, 22, 105, 55); // Vertical divider
      
      doc.setFont('helvetica', 'bold');
      doc.text('Invoice No.', 110, 28);
      doc.text('Dated', 160, 28);
      doc.setFont('helvetica', 'normal');
      doc.text(invoice.invoiceNo, 110, 33);
      doc.text(format(new Date(invoice.date), 'dd-MMM-yyyy'), 160, 33);
      
      doc.line(105, 38, 200, 38);
      doc.setFont('helvetica', 'bold');
      doc.text('Terms of Payment', 110, 43);
      doc.setFont('helvetica', 'normal');
      doc.text('Bank Transfer / Cheque', 110, 48);
      
      doc.line(10, 55, 200, 55);
      
      // Bill To & Ship To
      doc.setFillColor(245, 245, 245);
      doc.rect(10, 55, 95, 30, 'F'); // Bill To Box
      doc.rect(105, 55, 95, 30, 'F'); // Ship To Box
      doc.line(105, 55, 105, 85); // Middle divider
      
      // Bill To
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Bill To (Buyer)', 15, 60);
      doc.setFontSize(10);
      doc.text(invoice.clientName, 15, 66);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      if (invoice.clientGstin) doc.text(`GSTIN/UIN: ${invoice.clientGstin}`, 15, 72);
      if (client?.state) doc.text(`State: ${client.state}`, 15, 77);
      if (client?.phone) doc.text(`Phone: ${client.phone}`, 15, 82);

      // Ship To
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Ship To (Consignee)', 110, 60);
      doc.setFontSize(10);
      doc.text(invoice.clientName, 110, 66);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      if (client?.address) {
        const addrLines = doc.splitTextToSize(client.address, 85);
        doc.text(addrLines, 110, 72);
      } else {
        doc.text('Same as Billing Address', 110, 72);
      }
      
      doc.line(10, 85, 200, 85);
      
      // Table
      const tableData = details.entries.map((e: CourierEntry, index: number) => {
        const amount = isNaN(e.amount) ? 0 : e.amount;
        const weight = isNaN(e.weight) ? 0 : e.weight;
        return [
          index + 1,
          `${e.date}\n${e.courierName} - ${e.docketNo}\nDest: ${e.destination}`,
          '9968', // HSN/SAC Code for Courier
          weight || '-',
          'Nos',
          (amount / (weight || 1)).toFixed(2),
          amount.toFixed(2)
        ];
      });
      
      autoTable(doc, {
        startY: 86,
        head: [['S.No', 'Description of Services', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Amount']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 80 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          5: { cellWidth: 20 },
          6: { cellWidth: 30, halign: 'right' }
        },
        margin: { left: 10, right: 10 }
      });
      
      let finalY = (doc as any).lastAutoTable.finalY;
      
      // Totals
      doc.line(10, finalY, 200, finalY);
      doc.setFont('helvetica', 'bold');
      doc.text('Total', 15, finalY + 5);
      doc.text(`Rs. ${invoice.subtotal.toFixed(2)}`, 195, finalY + 5, { align: 'right' });
      
      finalY += 10;
      doc.setFont('helvetica', 'normal');
      if (isIntraState) {
        doc.text('CGST @ 9%', 140, finalY);
        doc.text((invoice.gstTotal / 2).toFixed(2), 195, finalY, { align: 'right' });
        
        finalY += 5;
        doc.text('SGST @ 9%', 140, finalY);
        doc.text((invoice.gstTotal / 2).toFixed(2), 195, finalY, { align: 'right' });
      } else {
        doc.text('IGST @ 18%', 140, finalY);
        doc.text(invoice.gstTotal.toFixed(2), 195, finalY, { align: 'right' });
      }
      
      finalY += 8;
      doc.line(135, finalY - 5, 200, finalY - 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Grand Total', 140, finalY);
      doc.text(`Rs. ${invoice.grandTotal.toFixed(2)}`, 195, finalY, { align: 'right' });
      
      // HSN Summary Table
      finalY += 10;
      doc.setFontSize(8);
      doc.text('HSN/SAC Summary', 15, finalY);
      
      const hsnSummaryData = isIntraState ? [[
        '9968',
        invoice.subtotal.toFixed(2),
        '9%',
        (invoice.gstTotal / 2).toFixed(2),
        '9%',
        (invoice.gstTotal / 2).toFixed(2),
        invoice.gstTotal.toFixed(2)
      ]] : [[
        '9968',
        invoice.subtotal.toFixed(2),
        '18%',
        invoice.gstTotal.toFixed(2),
        '-',
        '-',
        invoice.gstTotal.toFixed(2)
      ]];

      autoTable(doc, {
        startY: finalY + 2,
        head: isIntraState 
          ? [['HSN/SAC', 'Taxable Value', 'CGST Rate', 'CGST Amt', 'SGST Rate', 'SGST Amt', 'Total Tax']]
          : [['HSN/SAC', 'Taxable Value', 'IGST Rate', 'IGST Amt', '-', '-', 'Total Tax']],
        body: hsnSummaryData,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        margin: { left: 10, right: 10 }
      });

      finalY = (doc as any).lastAutoTable.finalY + 8;

      // Bank Details below HSN
      if (bankName) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Bank Details:', 15, finalY);
        doc.setFont('helvetica', 'normal');
        doc.text(`Bank Name: ${bankName}`, 15, finalY + 5);
        doc.text(`Account No: ${bankAccount}`, 15, finalY + 10);
        doc.text(`IFSC Code: ${bankIfsc}`, 80, finalY + 5);
        doc.text(`Branch: ${bankBranch}`, 80, finalY + 10);
        finalY += 18;
      } else {
        finalY += 5;
      }
      
      // Amount in words
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Amount Chargeable (in words):', 15, finalY);
      doc.setFont('helvetica', 'bold');
      doc.text(numberToWords(invoice.grandTotal), 15, finalY + 5);
      
      // Footer
      const footerY = 245;
      doc.line(10, footerY, 200, footerY);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('Terms & Conditions:', 15, footerY + 5);
      doc.setFont('helvetica', 'normal');
      
      const terms = companySettings?.terms_and_conditions 
        ? companySettings.terms_and_conditions.split('\n').filter(t => t.trim())
        : [
            '1. All disputes are subject to local jurisdiction only.',
            '2. Payment should be made within 7 days of invoice date.',
            '3. Interest @ 18% p.a. will be charged for delayed payments.'
          ];
      
      terms.forEach((term, index) => {
        doc.text(term.startsWith(`${index + 1}.`) ? term : `${index + 1}. ${term}`, 15, footerY + 9 + (index * 4));
      });
      
      doc.setFont('helvetica', 'bold');
      doc.text('Declaration:', 15, footerY + 25);
      doc.setFont('helvetica', 'normal');
      const declaration = companySettings?.declaration || 'We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.';
      const declLines = doc.splitTextToSize(declaration, 85);
      doc.text(declLines, 15, footerY + 29);
      
      doc.line(105, footerY, 105, 287);
      doc.text('Customer\'s Seal and Signature', 40, 280);
      
      doc.setFont('helvetica', 'bold');
      doc.text(`for ${companyName}`, 140, footerY + 5);
      doc.text('Authorized Signatory', 140, 280);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.text('Thank you for your business!', 105, 285, { align: 'center' });
      
      if (action === 'view') {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        doc.save(`Invoice_${invoice.invoiceNo}.pdf`);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const exportToExcel = () => {
    const data = invoices.map(inv => ({
      'Invoice No': inv.invoiceNo,
      'Date': inv.date,
      'Client': inv.clientName,
      'GSTIN': inv.clientGstin,
      'Subtotal': inv.subtotal,
      'GST': inv.gstTotal,
      'Total': inv.grandTotal,
      'Status': inv.status
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, 'Invoices_Export.xlsx');
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
      const formattedEntries = importData.map(row => {
        const client = clients.find(c => c.name.toLowerCase() === row.Client?.toString().toLowerCase());
        if (!client) throw new Error(`Client not found: ${row.Client}`);
        
        const amount = parseFloat(row.Amount) || 0;
        const gstRate = parseFloat(row.GSTRate) || 18;
        const totalAmount = amount + (amount * gstRate / 100);
        
        return {
          sNo: row.SNo?.toString() || '',
          date: row.Date || format(new Date(), 'yyyy-MM-dd'),
          clientId: client.id,
          clientName: client.name,
          courierName: row.Courier || '',
          docketNo: row.Docket?.toString() || '',
          weight: parseFloat(row.Weight) || 0,
          destination: row.Destination || '',
          vWeight: parseFloat(row.VWeight) || 0,
          mode: row.Mode || 'Surface',
          comments: row.Comments || '',
          amount,
          gstRate,
          totalAmount
        };
      });
      
      await api.post('/entries/bulk', formattedEntries);
      setIsImportModalOpen(false);
      setImportData([]);
      toast.success('Entries imported successfully!');
    } catch (error: any) {
      toast.error(`Import failed: ${error.message}`);
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesParty = invoice.clientName.toLowerCase().includes(filterParty.toLowerCase());
    const matchesMonth = filterMonth === '' || format(new Date(invoice.date), 'yyyy-MM') === filterMonth;
    return matchesParty && matchesMonth;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500">Generate and manage billing for your clients</p>
        </div>
        <div className="flex gap-3">
          <label className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
            <Upload className="w-5 h-5" />
            Import Entries
            <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
          </label>
          <button 
            onClick={exportToExcel}
            className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Export Excel
          </button>
          <button 
            onClick={openCreateModal}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Plus className="w-5 h-5" />
            Create Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
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
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="month"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredInvoices.length > 0 ? (
          filteredInvoices.map((invoice) => (
            <motion.div
              key={invoice.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                  <FileText className="w-6 h-6" />
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  {invoice.status}
                </span>
              </div>
              
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-400 uppercase">Invoice #{invoice.invoiceNo}</p>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{invoice.clientName}</h3>
                <p className="text-sm text-slate-500">{format(new Date(invoice.date), 'MMMM dd, yyyy')}</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">Amount Due</p>
                  <p className="text-xl font-bold text-slate-900">₹{invoice.grandTotal.toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => generatePDF(invoice, 'view')}
                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                    title="View Invoice"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => openEditModal(invoice)}
                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Edit Invoice"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteInvoice(invoice.id)}
                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                    title="Delete Invoice"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => generatePDF(invoice, 'view')}
                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Print Invoice"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => generatePDF(invoice, 'download')}
                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Download PDF"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-12 bg-white rounded-2xl border border-slate-200 border-dashed text-center text-slate-500">
            <div className="flex flex-col items-center gap-2">
              <Search className="w-8 h-8 text-slate-300" />
              <p className="font-medium">No invoices found matching your filters</p>
              <button 
                onClick={() => { setFilterParty(''); setFilterMonth(''); }}
                className="text-indigo-600 text-sm hover:underline"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
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
              className="relative bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 overflow-y-auto">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>

                <form onSubmit={handleCreateInvoice} className="space-y-8">
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    {companySettings?.logo_url ? (
                      <img 
                        src={getDirectImageUrl(companySettings.logo_url)} 
                        alt="Company Logo" 
                        className="w-12 h-12 object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-slate-900">{companySettings?.company_name || 'Company Name'}</h3>
                      <p className="text-xs text-slate-500">Logo will appear on the generated PDF invoice</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice No</label>
                      <input 
                        required
                        type="text" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={invoiceNo}
                        onChange={(e) => setInvoiceNo(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Date</label>
                      <input 
                        required
                        type="date" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select Client</label>
                      <select 
                        required
                        disabled={!!editingInvoice}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                        value={selectedClientId}
                        onChange={(e) => setSelectedClientId(e.target.value)}
                      >
                        <option value="">-- Select Client --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    {editingInvoice && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Status</label>
                        <select 
                          required
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          value={invoiceStatus}
                          onChange={(e) => setInvoiceStatus(e.target.value as 'paid' | 'unpaid')}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {!editingInvoice && selectedClientId && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900">Select Unbilled Entries</h3>
                        <p className="text-sm text-slate-500">{selectedEntryIds.length} entries selected</p>
                      </div>
                      
                      <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-100/50 border-b border-slate-200">
                              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Select</th>
                              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Docket No</th>
                              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Destination</th>
                              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {unbilledEntries.map(entry => (
                              <tr 
                                key={entry.id} 
                                className={cn(
                                  "cursor-pointer transition-colors",
                                  selectedEntryIds.includes(entry.id) ? "bg-indigo-50/50" : "hover:bg-slate-100/50"
                                )}
                                onClick={() => toggleEntrySelection(entry.id)}
                              >
                                <td className="px-6 py-4">
                                  <div className={cn(
                                    "w-5 h-5 rounded border flex items-center justify-center transition-all",
                                    selectedEntryIds.includes(entry.id) ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-300"
                                  )}>
                                    {selectedEntryIds.includes(entry.id) && <CheckCircle className="w-3 h-3 text-white" />}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                                <td className="px-6 py-4 text-sm font-mono text-indigo-600">{entry.docketNo}</td>
                                <td className="px-6 py-4 text-sm text-slate-600">{entry.destination}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-900">₹{entry.totalAmount.toFixed(2)}</td>
                              </tr>
                            ))}
                            {unbilledEntries.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                  No unbilled entries found for this client.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-8 border-t border-slate-100">
                    <div className="text-right">
                      <p className="text-sm text-slate-500">Total Invoice Amount</p>
                      <p className="text-3xl font-bold text-slate-900">
                        ₹{editingInvoice 
                          ? editingInvoice.grandTotal.toLocaleString()
                          : unbilledEntries
                            .filter(e => selectedEntryIds.includes(e.id))
                            .reduce((acc, curr) => acc + curr.totalAmount, 0)
                            .toLocaleString()}
                      </p>
                    </div>
                    <button 
                      type="submit"
                      disabled={!editingInvoice && selectedEntryIds.length === 0}
                      className="bg-indigo-600 text-white font-bold px-12 py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingInvoice ? 'Update Invoice' : 'Generate Invoice'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Preview Modal */}
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
              className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 overflow-y-auto">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">Preview Import Data</h2>
                <p className="text-slate-500 mb-6">Review the data from Excel before saving. Ensure client names match exactly.</p>
                
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-2">Client</th>
                        <th className="px-4 py-2">Docket</th>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importData.map((row, i) => (
                        <tr key={i} className="border-t border-slate-200">
                          <td className="px-4 py-2">{row.Client}</td>
                          <td className="px-4 py-2">{row.Docket}</td>
                          <td className="px-4 py-2">{row.Date}</td>
                          <td className="px-4 py-2">{row.Amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-6 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button 
                  onClick={processImport}
                  className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                >
                  Confirm Import
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDeleteInvoice}
        title="Delete Invoice"
        message="Are you sure you want to delete this invoice? Linked entries will be unbilled."
        confirmText="Delete"
      />
    </div>
  );
}
