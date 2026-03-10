// Dashboard route loading skeleton — matches the sidebar + content layout
export default function DashboardLoading() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar skeleton */}
      <aside className="flex h-full w-64 flex-col bg-base-200 shrink-0">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-base-300">
          <div className="skeleton w-8 h-8 rounded-full" />
          <div className="skeleton h-5 w-24" />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-9 w-full rounded-lg" />
          ))}
        </nav>
        <div className="border-t border-base-300 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-full" />
            <div className="space-y-1">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-2 w-16" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-end gap-2 px-6 py-3 border-b border-base-300 bg-base-100 shrink-0">
          <div className="skeleton w-8 h-8 rounded-full" />
        </header>
        <main className="flex-1 overflow-y-auto bg-base-100 p-6">
          <div className="skeleton h-8 w-48 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-40 rounded-xl" />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
