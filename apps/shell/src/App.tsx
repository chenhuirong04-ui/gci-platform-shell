import { useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { AppShell, Sidebar, Header, LangToggle, Toast, type NavSection } from '@gci/design-system';
import { LangContext, dictionaries, type Lang } from '@gci/i18n';
import { sections as sectionDefs } from './config/navigation';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { AccessDenied } from './pages/AccessDenied';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { StartupLoading, StartupError } from './components/StartupScreen';
import { AIPage } from './pages/AIPage';
import { InvoicePage } from './pages/InvoicePage';
import { Systems } from './pages/Systems';
import { Actions } from './pages/Actions';
import { Decisions } from './pages/Decisions';
import { Commitments } from './pages/Commitments';
import { Tasks } from './pages/Tasks';
import { EmailAssistant } from './pages/EmailAssistant';
import { BusinessAssistant } from './pages/BusinessAssistant';
import { CrmCustomers } from './pages/CrmCustomers';
import { SupportInbox } from './pages/SupportInbox';
import { MiaLeads } from './pages/MiaLeads';
import { MiaLeadDetail } from './pages/MiaLeadDetail';
import TradeModule from '../../../modules/trade/TradeModule';
import CrmModule from '../../../modules/crm/CrmModule';
import QuotationModule from '../../../modules/quotation/QuotationModule';
import { BusinessSolutionsModule } from '../../../modules/business-solutions/BusinessSolutionsModule';
import SuppliersModule from '../../../modules/suppliers/SuppliersModule';
import { DemoEntry } from './pages/DemoEntry';
import { IS_DEMO_MODE } from '../../../modules/crm/demo/demoMode';

// ── Inner shell (requires auth context already mounted) ──────────────────────
function Shell() {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('gci_platform_language_v1');
    return saved === 'en' || saved === 'zh' ? saved : 'zh';
  });
  const setLang = (l: Lang) => {
    localStorage.setItem('gci_platform_language_v1', l);
    setLangState(l);
  };
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dict = dictionaries[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const currentUrl = location.pathname + location.search;
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const { loading, session, profile, signOut, error: authError, retry: retryAuth } = useAuth();

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  };

  const sections: NavSection[] = useMemo(
    () =>
      sectionDefs.map((section) => ({
        label: dict.nav[section.labelKey],
        items: section.items.map((m) => ({
          code: m.code,
          name: dict.nav[m.nameKey],
          count: m.count,
          badgeColor: m.badgeColor,
          badgeBg: m.badgeBg,
          path: m.path,
          active: m.path ? currentUrl === m.path : undefined,
          onClick: m.path
            ? () => navigate(m.path!)
            : () => flash(dict.toast.enterModule(dict.nav[m.nameKey])),
        })),
      })),
    [dict, currentUrl, navigate],
  );

  const dateLine = new Date()
    .toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .toUpperCase()
    .replace(/\//g, '.');

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  // Public routes — rendered without the shell layout
  if (location.pathname === '/login') {
    return (
      <LangContext.Provider value={{ lang, dict, setLang }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </LangContext.Provider>
    );
  }

  // Still checking session on first load — Task 16.1: a visible state, not
  // a silent `return null` (which is what produced the black-screen bug).
  if (loading) return <StartupLoading />;

  // The initial session restore itself failed (network error etc, not a
  // "not logged in" case) — offer a manual retry instead of a permanent
  // blank page.
  if (authError && !session) return <StartupError message={authError} onRetry={retryAuth} />;

  // Not authenticated — redirect to login
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const visibleModules = profile?.modules ?? [];
  const displayName = profile?.display_name ?? 'User';
  const roleLabel = profile?.role_label ?? '';

  return (
    <LangContext.Provider value={{ lang, dict, setLang }}>
      <AppShell
        sidebar={
          <Sidebar
            navTop={{ code: 'WS', name: dict.nav.workspace, active: location.pathname === '/', onClick: () => navigate('/') }}
            workspaceLabel={dict.nav.workspaceSection}
            sections={sections}
            userName={displayName}
            userRole={roleLabel}
            visibleModules={visibleModules}
            onSignOut={handleSignOut}
          />
        }
        header={
          <Header
            eyebrow={dict.header.eyebrow}
            dateLine={dateLine}
            searchPlaceholder={dict.header.searchPlaceholder}
            syncedLabel={dict.header.synced}
            trailing={<LangToggle lang={lang} onChange={setLang} />}
          />
        }
      >
        <Routes>
          <Route path="/" element={<Home onFlash={flash} />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/invoice" element={<InvoicePage />} />
          <Route path="/systems" element={<Systems />} />
          <Route path="/actions" element={<Actions />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/commitments" element={<Commitments />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/email-assistant" element={<EmailAssistant />} />
          <Route path="/business-assistant" element={<BusinessAssistant />} />
          <Route
            path="/crm-customers"
            element={
              <ProtectedRoute module="crm">
                <CrmCustomers />
              </ProtectedRoute>
            }
          />
          <Route path="/support-inbox" element={<SupportInbox />} />
          <Route path="/mia-leads" element={<MiaLeads />} />
          <Route path="/mia-leads/:leadId" element={<MiaLeadDetail />} />
          <Route path="/access-denied" element={<AccessDenied />} />

          <Route
            path="/crm/*"
            element={
              <ProtectedRoute module="crm">
                <CrmModule initialTab={searchParams.get('tab') as any} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trade/*"
            element={
              // finance and warehouse users land here via ?tab=finance / ?tab=inventory
              <ProtectedRoute module={['trade', 'finance', 'warehouse']}>
                <TradeModule initialTab={searchParams.get('tab') as any} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quotation/*"
            element={
              searchParams.get('mode') === 'service-quote'
                ? <Navigate to="/business-solutions" replace />
                : (
                  <ProtectedRoute module="quotation">
                    <QuotationModule initialMode={searchParams.get('mode') as any} initialView={searchParams.get('view') as any} />
                  </ProtectedRoute>
                )
            }
          />
          <Route
            path="/suppliers/*"
            element={
              <ProtectedRoute module={['trade', 'quotation', 'crm']}>
                <SuppliersModule />
              </ProtectedRoute>
            }
          />
          <Route
            path="/business-solutions/*"
            element={
              <ProtectedRoute module={['quotation', 'crm']}>
                <BusinessSolutionsModule lang={lang as any} />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AppShell>
      <Toast message={toast} />
    </LangContext.Provider>
  );
}

// ── Root — mounts AuthProvider outside BrowserRouter's routes ────────────────
function App() {
  if (IS_DEMO_MODE) {
    return window.location.pathname === '/demo'
      ? <DemoEntry />
      : <Navigate to="/demo" replace />;
  }

  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

export default App;
