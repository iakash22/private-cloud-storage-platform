import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vaultstack/ui';

export function App() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>VaultStack</CardTitle>
          <CardDescription>
            Self-hosted private cloud storage management platform — Phase 0 foundation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            The dashboard shell is running. Business features such as authentication, storage,
            backups, and monitoring will be added in later phases.
          </p>
          <Button onClick={() => window.open(`${apiUrl}/health`, '_blank')}>
            Check API health
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
