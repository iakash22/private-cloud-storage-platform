import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vaultstack/ui';

interface SectionPlaceholderPageProps {
  title: string;
  description: string;
}

export function SectionPlaceholderPage({ title, description }: SectionPlaceholderPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">
          This workspace is organization-scoped and will only show resources permitted for your
          current role.
        </p>
      </CardContent>
    </Card>
  );
}
