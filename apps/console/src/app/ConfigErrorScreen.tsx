// Configuration-error screen (task-16 AC1): renders in place of a white screen when required
// env vars are missing or empty at boot. It names each missing variable and points at the
// example file so the fix is obvious. Pure/presentational — no env access, no data, no side
// effects at module scope — so main.tsx can render it before the app tree ever loads.
export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow">
        <h1 className="text-lg font-semibold text-red-600">
          Console configuration incomplete
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          The console can't start because these required environment variables
          are missing or empty:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 font-mono text-sm text-gray-900">
          {missing.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-gray-600">
          Set them (see <code>apps/console/.env.example</code>), then reload.
        </p>
      </div>
    </div>
  );
}
