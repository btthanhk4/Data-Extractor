import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bookmark, History, KeyRound, Settings as SettingsIcon, Table2 } from 'lucide-react';
import type { Feature } from '@swde/licensing';
import { isFeature } from '@swde/licensing';
import { Logo } from '../components/Logo';
import { Badge, cx } from '../components/ui';
import { initLicense, useLicense } from '../hooks/useLicense';
import { useSettings } from '../hooks/useSettings';
import { HistoryView } from './views/HistoryView';
import { LicenseView } from './views/LicenseView';
import { PresetsView } from './views/PresetsView';
import { PreviewView } from './views/PreviewView';
import { SettingsView } from './views/SettingsView';
import { WelcomeView } from './views/WelcomeView';

interface Route {
  path: string;
  params: URLSearchParams;
}

function parseHash(): Route {
  const raw = location.hash.replace(/^#/, '') || '/preview';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/preview', params: new URLSearchParams(query) };
}

function useHashRoute(): [Route, (route: string) => void] {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [route, (r) => (location.hash = r)];
}

const NAV: { path: string; label: string; icon: LucideIcon }[] = [
  { path: '/preview', label: 'Preview', icon: Table2 },
  { path: '/presets', label: 'Presets', icon: Bookmark },
  { path: '/history', label: 'History', icon: History },
  { path: '/license', label: 'License', icon: KeyRound },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function App() {
  const [route, navigate] = useHashRoute();
  const { settings, loaded, update } = useSettings();
  const plan = useLicense((s) => s.entitlements.plan);
  // Remember the last preview session so switching tabs and coming back keeps the data.
  const [sessionId, setSessionId] = useState<string | null>(() => parseHash().params.get('s'));

  useEffect(() => initLicense(), []);
  useEffect(() => {
    const s = route.params.get('s');
    if (route.path === '/preview' && s) setSessionId(s);
  }, [route]);

  const feature = route.params.get('feature');
  const highlight: Feature | null = isFeature(feature) ? feature : null;

  let view;
  switch (route.path) {
    case '/presets':
      view = <PresetsView navigate={navigate} />;
      break;
    case '/history':
      view = <HistoryView settings={settings} updateSettings={update} />;
      break;
    case '/license':
      view = <LicenseView highlight={highlight} />;
      break;
    case '/settings':
      view = <SettingsView key={String(loaded)} settings={settings} updateSettings={update} />;
      break;
    case '/welcome':
      view = <WelcomeView />;
      break;
    default:
      view = (
        <PreviewView
          sessionId={sessionId}
          settings={settings}
          settingsLoaded={loaded}
          updateSettings={update}
          navigate={navigate}
        />
      );
  }

  return (
    <div className="flex h-screen min-h-0">
      <nav
        className="flex w-52 shrink-0 flex-col border-r border-border bg-surface px-3 py-4"
        aria-label="Dashboard"
      >
        <div className="mb-6 flex items-center gap-2 px-2">
          <Logo size={26} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">Data Extractor</p>
            <p className="text-[11px] text-subtle">Dashboard</p>
          </div>
        </div>
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active =
              route.path === item.path ||
              (item.path === '/preview' &&
                !NAV.some((n) => n.path === route.path) &&
                route.path !== '/welcome');
            return (
              <li key={item.path}>
                <a
                  href={`#${item.path === '/preview' && sessionId ? `/preview?s=${sessionId}` : item.path}`}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'text-muted hover:bg-sunken hover:text-fg',
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto px-2">
          {plan === 'pro' ? <Badge tone="pro">Pro</Badge> : <Badge>Free plan</Badge>}
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-auto p-6">{view}</main>
    </div>
  );
}
