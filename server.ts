import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import bodyParser from 'body-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite Database
const db = new Database('courier_erp.db');

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gstin TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    state TEXT,
    createdAt TEXT
  );
`);

try {
  db.exec('ALTER TABLE invoices ADD COLUMN paymentDate TEXT');
  db.exec('ALTER TABLE invoices ADD COLUMN paymentMode TEXT');
} catch (e) {}

try {
  db.exec('ALTER TABLE ledger_transactions ADD COLUMN paymentMode TEXT');
} catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS courier_entries (
    id TEXT PRIMARY KEY,
    sNo TEXT,
    date TEXT NOT NULL,
    clientId TEXT NOT NULL,
    clientName TEXT,
    courierName TEXT,
    docketNo TEXT NOT NULL,
    weight REAL,
    destination TEXT,
    vWeight REAL,
    mode TEXT,
    comments TEXT,
    amount REAL,
    gstRate REAL,
    totalAmount REAL,
    invoiceId TEXT,
    createdAt TEXT,
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoiceNo TEXT NOT NULL,
    date TEXT NOT NULL,
    clientId TEXT NOT NULL,
    clientName TEXT,
    clientGstin TEXT,
    subtotal REAL,
    gstTotal REAL,
    grandTotal REAL,
    status TEXT DEFAULT 'unpaid',
    paymentDate TEXT,
    paymentMode TEXT,
    createdAt TEXT,
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS invoice_entries (
    invoiceId TEXT,
    entryId TEXT,
    PRIMARY KEY (invoiceId, entryId),
    FOREIGN KEY (invoiceId) REFERENCES invoices(id),
    FOREIGN KEY (entryId) REFERENCES courier_entries(id)
  );

  CREATE TABLE IF NOT EXISTS ledger_transactions (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    paymentMode TEXT,
    referenceId TEXT,
    createdAt TEXT,
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Initialize default settings
  INSERT OR IGNORE INTO settings (key, value) VALUES ('company_name', 'SPEEDX EXTERPRISES');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('company_address', '123, Business Park, Sector 45\nNew Delhi - 110001');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('company_gstin', '07AAAAA0000A1Z5');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('company_phone', '+91 98765 43210');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('company_email', 'contact@speedx.com');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('company_state', 'Uttar Pradesh');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('bank_name', '');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('bank_account', '');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('bank_ifsc', '');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('bank_branch', '');

  -- Initialize default 'Cash' client
  INSERT OR IGNORE INTO clients (id, name, createdAt) VALUES ('CASH', 'Cash', '2024-01-01T00:00:00.000Z');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json());

  // --- API Routes ---

  // Settings / Company Profile
  app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  });

  app.post('/api/settings', (req, res) => {
    const settings = req.body;
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        upsert.run(key, value);
      }
    });

    transaction();
    res.json({ success: true });
  });

  // Clients
  app.get('/api/clients', (req, res) => {
    const clients = db.prepare('SELECT * FROM clients ORDER BY createdAt DESC').all();
    res.json(clients);
  });

  app.get('/api/clients/:id', (req, res) => {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  });

  app.post('/api/clients', (req, res) => {
    const { name, gstin, address, state, phone, email } = req.body;
    const id = Math.random().toString(36).substring(2, 15);
    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO clients (id, name, gstin, address, state, phone, email, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, gstin, address, state || 'Uttar Pradesh', phone, email, createdAt);
    res.json({ id, name, gstin, address, state, phone, email, createdAt });
  });

  app.put('/api/clients/:id', (req, res) => {
    const { id } = req.params;
    const { name, gstin, address, state, phone, email } = req.body;
    
    const transaction = db.transaction(() => {
      db.prepare('UPDATE clients SET name = ?, gstin = ?, address = ?, state = ?, phone = ?, email = ? WHERE id = ?')
        .run(name, gstin, address, state, phone, email, id);
      
      // Also update clientName in courier_entries and invoices for denormalized data
      db.prepare('UPDATE courier_entries SET clientName = ? WHERE clientId = ?').run(name, id);
      db.prepare('UPDATE invoices SET clientName = ? WHERE clientId = ?').run(name, id);
    });

    transaction();
    res.json({ id, name, gstin, address, phone, email });
  });

  app.delete('/api/clients/:id', (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM clients WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        res.status(400).json({ error: 'Cannot delete client with existing entries or invoices.' });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Courier Entries
  app.get('/api/entries', (req, res) => {
    const entries = db.prepare('SELECT * FROM courier_entries ORDER BY date DESC LIMIT 100').all();
    res.json(entries);
  });

  app.get('/api/entries/unbilled/:clientId', (req, res) => {
    const entries = db.prepare('SELECT * FROM courier_entries WHERE clientId = ? AND invoiceId IS NULL').all(req.params.clientId);
    res.json(entries);
  });

  app.post('/api/entries', (req, res) => {
    const entry = req.body;
    const id = Math.random().toString(36).substring(2, 15);
    const createdAt = new Date().toISOString();
    
    const transaction = db.transaction(() => {
      // Insert entry
      db.prepare(`
        INSERT INTO courier_entries (
          id, sNo, date, clientId, clientName, courierName, docketNo, 
          weight, destination, vWeight, mode, comments, amount, 
          gstRate, totalAmount, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, entry.sNo, entry.date, entry.clientId, entry.clientName, 
        entry.courierName, entry.docketNo, entry.weight, entry.destination, 
        entry.vWeight, entry.mode, entry.comments, entry.amount, 
        entry.gstRate, entry.totalAmount, createdAt
      );

      // Insert ledger transaction
      const ledgerId = Math.random().toString(36).substring(2, 15);
      db.prepare(`
        INSERT INTO ledger_transactions (id, clientId, date, type, amount, description, referenceId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ledgerId, entry.clientId, entry.date, 'sale', entry.totalAmount, 
        `Courier Entry: ${entry.docketNo} (${entry.courierName})`, id, createdAt
      );
    });

    transaction();
    res.json({ id, ...entry, createdAt });
  });

  // Update Courier Entry
  app.put('/api/entries/:id', (req, res) => {
    const { id } = req.params;
    const entry = req.body;
    
    const transaction = db.transaction(() => {
      // Update entry
      db.prepare(`
        UPDATE courier_entries SET 
          sNo = ?, date = ?, clientId = ?, clientName = ?, courierName = ?, 
          docketNo = ?, weight = ?, destination = ?, vWeight = ?, 
          mode = ?, comments = ?, amount = ?, gstRate = ?, totalAmount = ?
        WHERE id = ?
      `).run(
        entry.sNo, entry.date, entry.clientId, entry.clientName, 
        entry.courierName, entry.docketNo, entry.weight, entry.destination, 
        entry.vWeight, entry.mode, entry.comments, entry.amount, 
        entry.gstRate, entry.totalAmount, id
      );

      // Update ledger transaction
      db.prepare(`
        UPDATE ledger_transactions SET 
          clientId = ?, date = ?, amount = ?, description = ?
        WHERE referenceId = ?
      `).run(
        entry.clientId, entry.date, entry.totalAmount, 
        `Courier Entry: ${entry.docketNo} (${entry.courierName})`, id
      );
    });

    transaction();
    res.json({ id, ...entry });
  });

  // Delete Courier Entry
  app.delete('/api/entries/:id', (req, res) => {
    const { id } = req.params;
    
    try {
      const entry = db.prepare('SELECT invoiceId FROM courier_entries WHERE id = ?').get(id) as any;
      if (!entry) {
        return res.json({ success: true });
      }

      if (entry.invoiceId) {
        return res.status(400).json({ error: 'Cannot delete a billed entry. Please delete the invoice first.' });
      }

      const transaction = db.transaction(() => {
        // Delete ledger transaction first
        db.prepare('DELETE FROM ledger_transactions WHERE referenceId = ?').run(id);
        // Delete from invoice_entries just in case
        db.prepare('DELETE FROM invoice_entries WHERE entryId = ?').run(id);
        // Delete entry
        db.prepare('DELETE FROM courier_entries WHERE id = ?').run(id);
      });

      transaction();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting entry:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Invoices
  app.get('/api/invoices', (req, res) => {
    const invoices = db.prepare('SELECT * FROM invoices ORDER BY date DESC').all();
    res.json(invoices);
  });

  app.get('/api/invoices/:id', (req, res) => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    
    const entries = db.prepare(`
      SELECT ce.* FROM courier_entries ce
      JOIN invoice_entries ie ON ce.id = ie.entryId
      WHERE ie.invoiceId = ?
    `).all(req.params.id);
    
    res.json({ ...invoice, entries });
  });

  app.post('/api/invoices', (req, res) => {
    const invoice = req.body;
    const id = Math.random().toString(36).substring(2, 15);
    const createdAt = new Date().toISOString();
    const status = invoice.status || 'unpaid';
    const paymentDate = status === 'paid' ? (invoice.paymentDate || invoice.date) : null;
    const paymentMode = status === 'paid' ? (invoice.paymentMode || 'Cash') : null;

    const transaction = db.transaction(() => {
      // Create invoice
      db.prepare(`
        INSERT INTO invoices (
          id, invoiceNo, date, clientId, clientName, clientGstin, 
          subtotal, gstTotal, grandTotal, status, paymentDate, paymentMode, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, invoice.invoiceNo, invoice.date, invoice.clientId, 
        invoice.clientName, invoice.clientGstin, invoice.subtotal, 
        invoice.gstTotal, invoice.grandTotal, status, paymentDate, paymentMode, createdAt
      );

      // Update entries
      const updateEntry = db.prepare('UPDATE courier_entries SET invoiceId = ? WHERE id = ?');
      const insertInvoiceEntry = db.prepare('INSERT INTO invoice_entries (invoiceId, entryId) VALUES (?, ?)');
      
      for (const entryId of invoice.entryIds) {
        updateEntry.run(id, entryId);
        insertInvoiceEntry.run(id, entryId);
      }

      // Add to ledger (invoice entry)
      db.prepare(`
        INSERT INTO ledger_transactions (id, clientId, date, type, amount, description, referenceId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Math.random().toString(36).substring(2, 15),
        invoice.clientId,
        invoice.date,
        'invoice',
        invoice.grandTotal,
        `Invoice #${invoice.invoiceNo}`,
        id,
        createdAt
      );

      // If paid, add receipt entry
      if (status === 'paid') {
        db.prepare(`
          INSERT INTO ledger_transactions (id, clientId, date, type, amount, description, paymentMode, referenceId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Math.random().toString(36).substring(2, 15),
          invoice.clientId,
          paymentDate,
          'receipt',
          invoice.grandTotal,
          `Payment received for Invoice: ${invoice.invoiceNo}`,
          paymentMode,
          id,
          createdAt
        );
      }
    });

    transaction();
    res.json({ id, ...invoice, createdAt });
  });

  app.put('/api/invoices/:id', (req, res) => {
    const { id } = req.params;
    const { invoiceNo, date, status, paymentDate, paymentMode } = req.body;
    const createdAt = new Date().toISOString();
    
    const transaction = db.transaction(() => {
      // Get current invoice to check status change
      const currentInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!currentInvoice) throw new Error('Invoice not found');

      // Update invoice
      db.prepare(`
        UPDATE invoices 
        SET invoiceNo = ?, date = ?, status = ?, paymentDate = ?, paymentMode = ? 
        WHERE id = ?
      `).run(invoiceNo || currentInvoice.invoiceNo, date || currentInvoice.date, status, paymentDate, paymentMode, id);

      // If status changed to 'paid', create a receipt transaction in ledger
      if (status === 'paid' && currentInvoice.status !== 'paid') {
        const ledgerId = Math.random().toString(36).substring(2, 15);
        db.prepare(`
          INSERT INTO ledger_transactions (id, clientId, date, type, amount, description, paymentMode, referenceId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ledgerId, 
          currentInvoice.clientId, 
          paymentDate || new Date().toISOString().split('T')[0], 
          'receipt', 
          currentInvoice.grandTotal, 
          `Payment received for Invoice: ${currentInvoice.invoiceNo}`, 
          paymentMode, 
          id, 
          createdAt
        );
      }
    });

    try {
      transaction();
      res.json({ id, invoiceNo, date, status, paymentDate, paymentMode });
    } catch (error: any) {
      console.error('Error updating invoice:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/invoices/:id', (req, res) => {
    const { id } = req.params;
    
    const transaction = db.transaction(() => {
      // Reset invoiceId in courier_entries
      db.prepare('UPDATE courier_entries SET invoiceId = NULL WHERE invoiceId = ?').run(id);
      // Delete from invoice_entries join table
      db.prepare('DELETE FROM invoice_entries WHERE invoiceId = ?').run(id);
      // Delete the invoice
      db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    });

    transaction();
    res.json({ success: true });
  });

  app.post('/api/entries/bulk', (req, res) => {
    const entries = req.body;
    const createdAt = new Date().toISOString();
    
    const transaction = db.transaction(() => {
      const insertEntry = db.prepare(`
        INSERT INTO courier_entries (
          id, sNo, date, clientId, clientName, courierName, docketNo, 
          weight, destination, vWeight, mode, comments, amount, 
          gstRate, totalAmount, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const insertLedger = db.prepare(`
        INSERT INTO ledger_transactions (id, clientId, date, type, amount, description, referenceId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entry of entries) {
        const id = Math.random().toString(36).substring(2, 15);
        const ledgerId = Math.random().toString(36).substring(2, 15);
        
        insertEntry.run(
          id, entry.sNo, entry.date, entry.clientId, entry.clientName, 
          entry.courierName, entry.docketNo, entry.weight, entry.destination, 
          entry.vWeight, entry.mode, entry.comments, entry.amount, 
          entry.gstRate, entry.totalAmount, createdAt
        );

        insertLedger.run(
          ledgerId, entry.clientId, entry.date, 'sale', entry.totalAmount, 
          `Courier Entry: ${entry.docketNo} (${entry.courierName})`, id, createdAt
        );
      }
    });

    transaction();
    res.json({ success: true });
  });

  // Ledger
  app.get('/api/ledger/:clientId', (req, res) => {
    const transactions = db.prepare('SELECT * FROM ledger_transactions WHERE clientId = ? ORDER BY date DESC').all(req.params.clientId);
    res.json(transactions);
  });

  // Dashboard Stats
  app.get('/api/stats', (req, res) => {
    const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
    const totalEntries = db.prepare('SELECT COUNT(*) as count FROM courier_entries').get().count;
    const totalInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count;
    const totalRevenue = db.prepare('SELECT SUM(grandTotal) as sum FROM invoices').get().sum || 0;
    
    res.json({ totalClients, totalEntries, totalInvoices, totalRevenue });
  });

  // Backup & Restore
  app.get('/api/backup', (req, res) => {
    try {
      const backup = {
        clients: db.prepare('SELECT * FROM clients').all(),
        entries: db.prepare('SELECT * FROM courier_entries').all(),
        invoices: db.prepare('SELECT * FROM invoices').all(),
        invoiceEntries: db.prepare('SELECT * FROM invoice_entries').all(),
        ledger: db.prepare('SELECT * FROM ledger_transactions').all(),
        settings: db.prepare('SELECT * FROM settings').all(),
        version: '1.0',
        timestamp: new Date().toISOString()
      };
      res.json(backup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/restore', (req, res) => {
    const backup = req.body;
    
    if (!backup.clients || !backup.entries || !backup.settings) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    try {
      const transaction = db.transaction(() => {
        // Clear all tables
        db.prepare('DELETE FROM invoice_entries').run();
        db.prepare('DELETE FROM ledger_transactions').run();
        db.prepare('DELETE FROM courier_entries').run();
        db.prepare('DELETE FROM invoices').run();
        db.prepare('DELETE FROM clients').run();
        db.prepare('DELETE FROM settings').run();

        // Restore Settings
        const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        for (const s of backup.settings) {
          insertSetting.run(s.key, s.value);
        }

        // Restore Clients
        const insertClient = db.prepare('INSERT INTO clients (id, name, gstin, address, state, phone, email, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const c of backup.clients) {
          insertClient.run(c.id, c.name, c.gstin, c.address, c.state, c.phone, c.email, c.createdAt);
        }

        // Restore Entries
        const insertEntry = db.prepare(`
          INSERT INTO courier_entries (
            id, sNo, date, clientId, clientName, courierName, docketNo, 
            weight, destination, vWeight, mode, comments, amount, 
            gstRate, totalAmount, invoiceId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const e of backup.entries) {
          insertEntry.run(
            e.id, e.sNo, e.date, e.clientId, e.clientName, e.courierName, e.docketNo,
            e.weight, e.destination, e.vWeight, e.mode, e.comments, e.amount,
            e.gstRate, e.totalAmount, e.invoiceId, e.createdAt
          );
        }

        // Restore Invoices
        const insertInvoice = db.prepare(`
          INSERT INTO invoices (
            id, invoiceNo, date, clientId, clientName, clientGstin, 
            subtotal, gstTotal, grandTotal, status, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const i of backup.invoices) {
          insertInvoice.run(
            i.id, i.invoiceNo, i.date, i.clientId, i.clientName, i.clientGstin,
            i.subtotal, i.gstTotal, i.grandTotal, i.status, i.createdAt
          );
        }

        // Restore Invoice Entries
        const insertInvoiceEntry = db.prepare('INSERT INTO invoice_entries (invoiceId, entryId) VALUES (?, ?)');
        for (const ie of backup.invoiceEntries) {
          insertInvoiceEntry.run(ie.invoiceId, ie.entryId);
        }

        // Restore Ledger
        const insertLedger = db.prepare(`
          INSERT INTO ledger_transactions (id, clientId, date, type, amount, description, referenceId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of backup.ledger) {
          insertLedger.run(l.id, l.clientId, l.date, l.type, l.amount, l.description, l.referenceId, l.createdAt);
        }
      });

      transaction();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Restore error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Vite / Static Files ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
