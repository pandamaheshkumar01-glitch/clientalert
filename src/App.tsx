import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  BarChart3,
  Bell,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase';
import { BootstrapPayload, Client, Invoice, InvoiceItem, OwnerSettings } from './types';
import { DashboardView } from './components/DashboardView';
import { ClientsView } from './components/ClientsView';
import { InvoicesView } from './components/InvoicesView';
import { AlertsView } from './components/AlertsView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { PublicInvoicePage } from './components/PublicInvoicePage';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

type NavTab = 'dashboard' | 'clients' | 'invoices' | 'alerts' | 'reports' | 'settings';

export default function App() {
  const pathMatch =
    typeof window !== 'undefined' ? window.location.pathname.match(/^\/i\/([a-zA-Z0-9_-]+)$/) : null;
  if (pathMatch) {
    return <PublicInvoicePage publicToken={pathMatch[1]} />;
  }
  return <OwnerWorkspace />;
}

function OwnerWorkspace() {

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [idToken, setIdToken] = useState<string>('');
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState('');

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [createInvoiceClientId, setCreateInvoiceClientId] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const tok = await u.getIdToken();
        setIdToken(tok);
      } else {
        setIdToken('');
        setData(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const currentUser = auth.currentUser;
      const freshToken = currentUser ? await currentUser.getIdToken() : idToken;
      const resp = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
          ...(init?.headers || {}),
        },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${resp.status})`);
      }
      return resp.json();
    },
    [idToken]
  );

  const fetchWorkspace = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoadingData((prev) => (data ? prev : true));
    setErrorMsg('');
    try {
      const payload = (await authedFetch('/api/app/bootstrap')) as BootstrapPayload;
      setData(payload);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load workspace');
    } finally {
      setLoadingData(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (user && idToken) {
      fetchWorkspace();
      const timer = setInterval(fetchWorkspace, 20000);
      return () => clearInterval(timer);
    }
  }, [user, idToken, fetchWorkspace]);

  const handleSignIn = async () => {
    setErrorMsg('');
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in cancelled');
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-sm text-slate-400">
        Initializing ClientAlert…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-[#121826] p-8 shadow-2xl space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xl font-extrabold tracking-tight text-white">
                Client<span className="text-amber-400">Alert</span>
              </span>
              <PWAInstallButton compact />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-white leading-snug">
              Billing, payment reminders & delivery tracking in one place
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Send GST bills via WhatsApp & Email, monitor live read receipts, collect UPI & Razorpay payments, and automate polite-to-firm reminders.
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors min-h-[48px]"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-800/80">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Owner-isolated workspace with encrypted PostgreSQL storage.</span>
          </div>
        </div>
        <OfflineIndicator />
      </div>
    );
  }

  if (loadingData && !data) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-sm text-slate-400">
        Loading your invoices and client ledger…
      </div>
    );
  }

  const unreadAlertsCount = data?.notifications.filter((n) => !n.isRead).length || 0;

  // Mutation Handlers
  const handleSaveClient = async (payload: Partial<Client>, id?: number) => {
    if (id) {
      await authedFetch(`/api/app/clients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast('Client updated');
    } else {
      const created = await authedFetch('/api/app/clients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSelectedClientId(created.id);
      showToast('Client added');
    }
    await fetchWorkspace();
  };

  const handleDeleteClient = async (id: number) => {
    await authedFetch(`/api/app/clients/${id}`, { method: 'DELETE' });
    setSelectedClientId(null);
    showToast('Client deleted');
    await fetchWorkspace();
  };

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    const res = await authedFetch('/api/app/clients/import', {
      method: 'POST',
      body: JSON.stringify({ clients: rows }),
    });
    showToast(`Imported ${res.importedCount} clients`);
    await fetchWorkspace();
    return res.importedCount;
  };

  const handleCreateInvoice = async (payload: {
    clientId: number;
    issueDate: string;
    dueDate: string;
    items: InvoiceItem[];
    taxRate: number;
    discount: number;
    reminderOffsets: number[];
    notes: string;
    sendImmediately: boolean;
  }) => {
    const created = await authedFetch('/api/app/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setActiveTab('invoices');
    setSelectedInvoiceId(created.id);
    showToast(payload.sendImmediately ? 'Bill created & sent' : 'Invoice draft saved');
    await fetchWorkspace();
  };

  const handleDeleteInvoice = async (id: number) => {
    await authedFetch(`/api/app/invoices/${id}`, { method: 'DELETE' });
    setSelectedInvoiceId(null);
    showToast('Invoice deleted');
    await fetchWorkspace();
  };

  const handleSendBill = async (invoiceId: number, channel?: 'whatsapp' | 'email' | 'sms') => {
    await authedFetch(`/api/app/invoices/${invoiceId}/send`, {
      method: 'POST',
      body: JSON.stringify({ channel }),
    });
    showToast('Bill dispatched & logged');
    await fetchWorkspace();
  };

  const handleSendReminder = async (
    invoiceId: number,
    templateKey = 'reminder_friendly',
    channel?: 'whatsapp' | 'email' | 'sms'
  ) => {
    await authedFetch(`/api/app/invoices/${invoiceId}/remind`, {
      method: 'POST',
      body: JSON.stringify({ templateKey, channel }),
    });
    showToast('Payment reminder sent');
    await fetchWorkspace();
  };

  const handleRecordPayment = async (
    invoiceId: number,
    payload: { amount: number; method: string; referenceNo: string; note: string }
  ) => {
    await authedFetch(`/api/app/invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('Payment recorded & receipt sent');
    await fetchWorkspace();
  };

  const handleQuickMarkPaid = async (invoice: Invoice) => {
    await handleRecordPayment(invoice.id, {
      amount: invoice.balance,
      method: 'UPI',
      referenceNo: '',
      note: '1-tap full payment mark',
    });
  };

  const handleSimulateWebhook = async (payload: {
    messageLogId?: number;
    invoiceId?: number;
    event: 'delivered' | 'read' | 'failed' | 'razorpay_paid';
  }) => {
    await authedFetch('/api/app/webhooks/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast(`Webhook event "${payload.event}" processed`);
    await fetchWorkspace();
  };

  const handleSaveSettings = async (payload: Partial<OwnerSettings>) => {
    await authedFetch('/api/app/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    showToast('Settings saved');
    await fetchWorkspace();
  };

  const handleSaveTemplate = async (id: number, body: string) => {
    await authedFetch(`/api/app/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
    });
    showToast('Template saved');
    await fetchWorkspace();
  };

  const handleMarkRead = async (id: number) => {
    await authedFetch(`/api/app/notifications/${id}/read`, { method: 'POST' });
    await fetchWorkspace();
  };

  const handleMarkAllRead = async () => {
    await authedFetch('/api/app/notifications/read-all', { method: 'POST' });
    showToast('All alerts marked read');
    await fetchWorkspace();
  };

  const handleRunScheduler = async () => {
    const res = await authedFetch('/api/app/scheduler/run', { method: 'POST' });
    await fetchWorkspace();
    return res;
  };

  const handleGenerateDailySummary = async () => {
    await authedFetch('/api/app/daily-summary', { method: 'POST' });
    showToast('9 AM IST Daily Summary added to Alerts');
    await fetchWorkspace();
  };

  const handleNavigateFromLink = (link: string) => {
    if (link.startsWith('/invoices/')) {
      const id = Number(link.split('/')[2]);
      setActiveTab('invoices');
      if (Number.isFinite(id)) setSelectedInvoiceId(id);
    } else if (link.startsWith('/clients/')) {
      const id = Number(link.split('/')[2]);
      setActiveTab('clients');
      if (Number.isFinite(id)) setSelectedClientId(id);
    } else {
      setActiveTab('dashboard');
    }
  };

  const desktopNavItems: Array<{
    id: NavTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', Icon: Users },
    { id: 'invoices', label: 'Invoices', Icon: FileText },
    { id: 'alerts', label: 'Alerts', Icon: Bell, badge: unreadAlertsCount },
    { id: 'reports', label: 'Reports', Icon: BarChart3 },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  const mobileBottomTabs: typeof desktopNavItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', Icon: Users },
    { id: 'invoices', label: 'Invoices', Icon: FileText },
    { id: 'alerts', label: 'Alerts', Icon: Bell, badge: unreadAlertsCount },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r border-slate-800/80 bg-[#0E131E] p-4 justify-between z-30">
        <div className="space-y-6">
          <div className="px-2 pt-1">
            <span className="text-xl font-extrabold tracking-tight text-white">
              Client<span className="text-amber-400">Alert</span>
            </span>
          </div>

          <nav className="space-y-1">
            {desktopNavItems.map(({ id, label, Icon, badge }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {label}
                  </span>
                  {badge ? (
                    <span className="font-mono-num text-xs font-semibold text-amber-400">
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <PWAInstallButton />
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {data?.settings?.businessName || user.displayName || 'Owner'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Compact Sticky Header (52px) */}
      <header className="md:hidden sticky top-0 z-30 h-[52px] flex items-center justify-between gap-4 px-4 border-b border-slate-800/80 bg-[#0E131E]/95 backdrop-blur-md">
        <span className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
          Client<span className="text-amber-400">Alert</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('invoices');
              setShowCreateInvoiceModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Bill
          </button>
          <button
            type="button"
            onClick={() => signOut(auth)}
            aria-label="Sign Out"
            className="p-2 text-slate-400 hover:text-white"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-1 md:pl-60 pb-24 md:pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {errorMsg && (
            <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {data && activeTab === 'dashboard' && (
            <DashboardView
              clients={data.clients}
              invoices={data.invoices}
              payments={data.payments}
              onCreateInvoice={() => {
                setCreateInvoiceClientId(data.clients[0]?.id || null);
                setActiveTab('invoices');
                setShowCreateInvoiceModal(true);
              }}
              onOpenInvoice={(invId) => {
                setActiveTab('invoices');
                setSelectedInvoiceId(invId);
              }}
              onQuickRemind={(invId) => handleSendReminder(invId, 'reminder_firm')}
              onQuickMarkPaid={handleQuickMarkPaid}
              onNavigateReports={() => setActiveTab('reports')}
            />
          )}

          {data && activeTab === 'clients' && (
            <ClientsView
              clients={data.clients}
              invoices={data.invoices}
              payments={data.payments}
              messageLogs={data.messageLogs}
              selectedClientId={selectedClientId}
              onSelectClient={setSelectedClientId}
              onSaveClient={handleSaveClient}
              onDeleteClient={handleDeleteClient}
              onBulkImport={handleBulkImport}
              onCreateInvoiceForClient={(cId) => {
                setCreateInvoiceClientId(cId);
                setActiveTab('invoices');
                setShowCreateInvoiceModal(true);
              }}
              onOpenInvoice={(invId) => {
                setActiveTab('invoices');
                setSelectedInvoiceId(invId);
              }}
              onSendReminder={(invId) => handleSendReminder(invId, 'reminder_friendly')}
            />
          )}

          {data && activeTab === 'invoices' && (
            <InvoicesView
              clients={data.clients}
              invoices={data.invoices}
              payments={data.payments}
              reminders={data.reminders}
              messageLogs={data.messageLogs}
              settings={data.settings}
              selectedInvoiceId={selectedInvoiceId}
              onSelectInvoice={setSelectedInvoiceId}
              showCreateModal={showCreateInvoiceModal}
              initialClientId={createInvoiceClientId}
              onCloseCreateModal={() => setShowCreateInvoiceModal(false)}
              onOpenCreateModal={() => setShowCreateInvoiceModal(true)}
              onCreateInvoice={handleCreateInvoice}
              onDeleteInvoice={handleDeleteInvoice}
              onSendBill={handleSendBill}
              onSendReminder={handleSendReminder}
              onRecordPayment={handleRecordPayment}
              onSimulateWebhook={handleSimulateWebhook}
            />
          )}

          {data && activeTab === 'alerts' && (
            <AlertsView
              notifications={data.notifications}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
              onRunScheduler={handleRunScheduler}
              onGenerateDailySummary={handleGenerateDailySummary}
              onNavigateFromLink={handleNavigateFromLink}
            />
          )}

          {data && activeTab === 'reports' && (
            <ReportsView
              clients={data.clients}
              invoices={data.invoices}
              settings={data.settings}
              onOpenClient={(cId) => {
                setActiveTab('clients');
                setSelectedClientId(cId);
              }}
            />
          )}

          {data && activeTab === 'settings' && (
            <SettingsView
              settings={data.settings}
              templates={data.templates}
              onSaveSettings={handleSaveSettings}
              onSaveTemplate={handleSaveTemplate}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (5 tabs, <= 64px height) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 pb-safe border-t border-slate-800/90 bg-[#0E131E]/95 backdrop-blur-md grid grid-cols-5 items-center">
        {mobileBottomTabs.map(({ id, label, Icon, badge }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`relative flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                active ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium mt-1 whitespace-nowrap">{label}</span>
              {badge ? (
                <span className="absolute top-1.5 right-3 text-[10px] font-bold text-amber-400 font-mono-num">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-50 rounded-xl border border-emerald-500/40 bg-[#121826] px-4 py-2.5 text-xs font-medium text-emerald-300 shadow-2xl">
          {toast}
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
