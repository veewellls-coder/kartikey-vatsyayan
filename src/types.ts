export interface Client {
  id: string;
  name: string;
  gstin?: string;
  address?: string;
  state?: string;
  phone?: string;
  email?: string;
  createdAt: string;
}

export interface CourierEntry {
  id: string;
  sNo: string;
  date: string;
  clientId: string;
  clientName: string;
  courierName: string;
  docketNo: string;
  weight: number;
  destination: string;
  vWeight: number;
  mode: string;
  comments: string;
  amount: number;
  gstRate: number;
  totalAmount: number;
  invoiceId?: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  date: string;
  clientId: string;
  clientName: string;
  clientGstin?: string;
  subtotal: number;
  gstTotal: number;
  grandTotal: number;
  status: 'unpaid' | 'paid';
  entryIds: string[];
}

export interface LedgerTransaction {
  id: string;
  clientId: string;
  date: string;
  type: 'sale' | 'purchase' | 'payment' | 'receipt';
  amount: number;
  description: string;
  referenceId?: string;
}
