import { useMemo, useRef, useState } from 'react';
import { AppShell, Sidebar, Header, LangToggle, Toast, type NavModItem } from '@gci/design-system';
import { LangContext, dictionaries, type Lang } from '@gci/i18n';
import { modules } from './config/navigation';
import { Home } from './pages/Home';

function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dict = dictionaries[lang];

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  };

  const navMods: NavModItem[] = useMemo(
    () =>
      modules.map((m) => ({
        code: m.code,
        name: dict.nav[m.nameKey],
        count: m.count,
        badgeColor: m.badgeColor,
        badgeBg: m.badgeBg,
        href: m.url,
        onClick: m.url ? undefined : () => flash(dict.toast.enterModule(dict.nav[m.nameKey])),
      })),
    [dict],
  );

  const dateLine = new Date()
    .toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .toUpperCase()
    .replace(/\//g, '.');

  return (
    <LangContext.Provider value={{ lang, dict, setLang }}>
      <AppShell
        sidebar={
          <Sidebar
            navTop={{ code: 'WS', name: dict.nav.workspace }}
            navMods={navMods}
            workspaceLabel={dict.nav.workspaceSection}
            modulesLabel={dict.nav.modulesSection}
            userName="Chris"
            userRole={dict.profile.owner}
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
        <Home onFlash={flash} />
      </AppShell>
      <Toast message={toast} />
    </LangContext.Provider>
  );
}

export default App;
