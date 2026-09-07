import { EmptyState } from '@vaultstack/ui';

export function SharesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Shares</h2>
        <p className="text-sm text-slate-500">Share dialog foundation for Phase 8 file sharing.</p>
      </div>
      <EmptyState
        title="Sharing is not enabled yet"
        description="Use the Share action on a file to preview the upcoming sharing workflow. Full share links and access policies arrive in Phase 8."
      />
    </div>
  );
}
