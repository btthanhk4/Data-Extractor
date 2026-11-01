import { Download, MousePointerClick, ScanSearch, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui';
import { Logo } from '../../components/Logo';

const STEPS = [
  {
    icon: MousePointerClick,
    title: 'Open any webpage',
    text: 'A product listing, a directory, search results or a page with a table.',
  },
  {
    icon: ScanSearch,
    title: 'Click the extension, then “Detect data”',
    text: 'Tables and repeating lists are found automatically. Pick the one you want.',
  },
  {
    icon: Download,
    title: 'Preview, clean and export',
    text: 'Rename or hide columns, remove duplicates, and download a CSV.',
  },
];

export function WelcomeView() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-10 text-center">
      <Logo size={48} />
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Welcome to Smart Web Data Extractor
        </h2>
        <p className="mt-2 text-sm text-muted">
          Turn webpages into clean spreadsheets without writing selectors or code.
        </p>
      </div>
      <div className="grid w-full gap-3 text-left sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-accent">
              <s.icon className="h-4 w-4" aria-hidden /> Step {i + 1}
            </div>
            <p className="text-[13px] font-medium">{s.title}</p>
            <p className="mt-1 text-xs text-muted">{s.text}</p>
          </Card>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-subtle">
        <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
        Your data stays on your device. Tip: press Alt+Shift+E to open the extension.
      </p>
    </div>
  );
}
