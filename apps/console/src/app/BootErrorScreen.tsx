// Boot-error screen (task-16): rendered when the app chunk fails to load — a stale build hash
// after a redeploy, or a network blip on main.tsx's dynamic import of ./app/App. The point is to
// never leave #root blank: give the operator an honest message and a reload. Pure/presentational;
// the reload runs on click only, so it renders fine under renderToStaticMarkup.
export function BootErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow">
        <h1 className="text-lg font-semibold text-red-600">
          Couldn't load the app
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Something went wrong loading the console — this can happen right after
          a new deploy. Reload the page to try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded bg-black px-4 py-2 text-sm text-white"
        >
          Reload the page
        </button>
      </div>
    </div>
  );
}
