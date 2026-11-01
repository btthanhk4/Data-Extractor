import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  FlaskConical,
  KeyRound,
  Minus,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import type { Feature } from '@swde/licensing';
import { FEATURE_LABELS, FREE_FEATURES, PRO_FEATURES } from '@swde/licensing';
import { useLicense } from '../../hooks/useLicense';
import { useOnline } from '../../hooks/useSettings';
import { PURCHASE_URL, SUPPORT_URL } from '../../services/license';
import { Badge, Button, Card, Input, Notice, cx } from '../../components/ui';

const STATUS_TEXT = {
  free: 'Free plan',
  active: 'Pro — active',
  expired: 'License needs re-verification',
  revoked: 'License revoked',
  invalid: 'License invalid',
  'device-mismatch': 'License belongs to another device',
} as const;

export function LicenseView({ highlight }: { highlight: Feature | null }) {
  const { state, entitlements, busy, error, activate, deactivate, ready } = useLicense();
  const online = useOnline();
  const [key, setKey] = useState('');
  const mode = state?.mode ?? __LICENSE_MODE__;
  const isPro = entitlements.plan === 'pro';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">License</h2>
        <p className="text-sm text-muted">
          Free features never require an account or a connection. Pro is a one-time purchase.
        </p>
      </div>

      {/* Compile-time check so the test keys never appear in production bundles. */}
      {__LICENSE_MODE__ === 'mock' && (
        <Notice
          tone="warning"
          icon={<FlaskConical className="h-4 w-4" />}
          title="Development licensing (mock)"
        >
          This is a development build. Licenses are simulated locally and no payment is involved.
          Test keys: <code className="font-mono">SWDE-DEV-PRO</code>,{' '}
          <code className="font-mono">SWDE-DEV-REVOKED</code>,{' '}
          <code className="font-mono">SWDE-DEV-LIMIT</code>,{' '}
          <code className="font-mono">SWDE-DEV-EXPIRED</code>.
        </Notice>
      )}
      {!online && (
        <Notice tone="neutral" icon={<WifiOff className="h-4 w-4" />} title="You are offline">
          Extraction and CSV export keep working. An active Pro license stays valid offline until
          its verification window ends.
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            {isPro ? (
              <ShieldCheck className="h-5 w-5 text-pro" aria-hidden />
            ) : (
              <KeyRound className="h-5 w-5 text-subtle" aria-hidden />
            )}
            <h3 className="text-sm font-semibold" data-testid="license-status">
              {ready ? STATUS_TEXT[state?.status ?? 'free'] : 'Checking…'}
            </h3>
          </div>
          {state?.message && <p className="mt-2 text-xs text-warning">{state.message}</p>}
          {isPro && state && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-subtle">Key</dt>
              <dd className="font-mono">•••• {state.keyHint ?? ''}</dd>
              <dt className="text-subtle">Expires</dt>
              <dd>
                {state.licenseExpiresAt
                  ? new Date(state.licenseExpiresAt).toLocaleDateString()
                  : 'Never (lifetime)'}
              </dd>
              <dt className="text-subtle">Verified until</dt>
              <dd>
                {state.tokenExpiresAt ? new Date(state.tokenExpiresAt).toLocaleDateString() : '—'}
              </dd>
            </dl>
          )}

          {isPro ? (
            <Button
              className="mt-4"
              variant="danger"
              size="sm"
              loading={busy}
              onClick={() => void deactivate()}
            >
              Deactivate on this device
            </Button>
          ) : (
            <form
              className="mt-4 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void activate(key).then((ok) => ok && setKey(''));
              }}
            >
              <label className="text-xs font-medium text-muted" htmlFor="license-key">
                License key
              </label>
              <Input
                id="license-key"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={mode === 'unconfigured'}
              />
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={!key.trim() || mode === 'unconfigured' || !online}
              >
                Activate
              </Button>
              {error && (
                <p
                  className="flex items-start gap-1.5 text-xs text-danger"
                  role="alert"
                  data-testid="license-error"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
              {mode === 'unconfigured' && (
                <p className="text-xs text-subtle">
                  License activation is not available in this build yet. All Free features work
                  normally.
                </p>
              )}
            </form>
          )}

          {!isPro && (
            <div className="mt-4 border-t border-border pt-4">
              {PURCHASE_URL ? (
                <a
                  href={PURCHASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-pro hover:underline"
                >
                  <Sparkles className="h-4 w-4" aria-hidden /> Get Pro — $9.99 one-time
                </a>
              ) : (
                <p className="text-xs text-subtle">Pro purchases are not open yet.</p>
              )}
            </div>
          )}
          {SUPPORT_URL && (
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-xs text-subtle hover:text-fg"
            >
              Contact support
            </a>
          )}
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-sunken text-xs text-subtle">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Feature</th>
                <th className="w-16 px-2 py-2 font-medium">Free</th>
                <th className="w-16 px-2 py-2 font-medium">
                  <Badge tone="pro">Pro</Badge>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...FREE_FEATURES, ...PRO_FEATURES].map((f) => {
                const free = FREE_FEATURES.includes(f);
                return (
                  <tr key={f} className={cx(highlight === f && 'bg-pro/5')}>
                    <td className="px-4 py-2">{FEATURE_LABELS[f]}</td>
                    <td className="px-2 py-2 text-center">
                      {free ? (
                        <Check className="mx-auto h-4 w-4 text-success" aria-label="Included" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-subtle" aria-label="Not included" />
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Check className="mx-auto h-4 w-4 text-pro" aria-label="Included" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
