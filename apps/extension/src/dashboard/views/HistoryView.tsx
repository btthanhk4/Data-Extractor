import { useCallback, useEffect, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import type { HistoryEntry, Settings } from '@swde/shared';
import { clearHistory, listHistory } from '../../services/history';
import { Badge, Button, Card, Switch } from '../../components/ui';

export function HistoryView({
  settings,
  updateSettings,
}: {
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const refresh = useCallback(() => void listHistory().then(setEntries), []);
  useEffect(refresh, [refresh]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Extraction history</h2>
          <p className="text-sm text-muted">
            Only metadata is kept: site, page path, title and counts. Extracted values are never
            stored.
          </p>
        </div>
        <Button
          size="sm"
          variant="danger"
          disabled={entries.length === 0}
          onClick={() => {
            if (confirm('Clear all extraction history?')) void clearHistory().then(refresh);
          }}
          icon={<Trash2 className="h-3.5 w-3.5" />}
        >
          Clear history
        </Button>
      </div>
      <Card className="px-4 py-2">
        <Switch
          label="Keep extraction history"
          description="Stored locally in this browser, up to 200 entries."
          checked={settings.historyEnabled}
          onChange={(v) => void updateSettings({ historyEnabled: v })}
        />
      </Card>
      <Card>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-subtle">
            <History className="h-5 w-5" aria-hidden />
            No exports recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border text-xs text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Page</th>
                  <th className="px-4 py-2 font-medium">Dataset</th>
                  <th className="px-4 py-2 text-right font-medium">Rows</th>
                  <th className="px-4 py-2 font-medium">Format</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-xs text-muted">
                      {new Date(e.at).toLocaleString()}
                    </td>
                    <td className="max-w-xs px-4 py-2">
                      <span className="block truncate">{e.title || e.path}</span>
                      <span className="block truncate text-xs text-subtle">
                        {e.origin}
                        {e.path}
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2">{e.dataset}</td>
                    <td className="tabular px-4 py-2 text-right">
                      {e.rows.toLocaleString('en-US')}
                      {e.pages > 1 && <span className="text-xs text-subtle"> · {e.pages}p</span>}
                    </td>
                    <td className="px-4 py-2">
                      <Badge>{e.format.toUpperCase()}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
