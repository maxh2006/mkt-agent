export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dashboard summary for the active brand.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Pending Approval" value="—" />
        <StatCard label="Scheduled Today" value="—" />
        <StatCard label="Posted Today" value="—" />
        <StatCard label="Failed Posts" value="—" />
        <StatCard label="Active Automations" value="—" />
        <StatCard label="Recent Warnings" value="—" />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-lg border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
