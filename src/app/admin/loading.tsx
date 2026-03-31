export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-5 bg-gray-200 rounded w-48 animate-pulse" />
              <div className="h-3 bg-gray-100 rounded w-32 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 bg-gray-200 rounded w-16 animate-pulse" />
            <div className="h-9 bg-gray-200 rounded w-32 animate-pulse" />
            <div className="h-9 bg-gray-200 rounded w-24 animate-pulse" />
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="mb-4 flex gap-2">
          <div className="h-10 bg-white rounded-lg shadow w-64 animate-pulse" />
          <div className="h-10 bg-white rounded-lg shadow w-40 animate-pulse" />
          <div className="h-10 bg-white rounded-lg shadow w-48 animate-pulse" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="animate-pulse">
            <div className="bg-gray-50 h-10 border-b" />
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-5 border-b border-gray-50"
              >
                <div className="h-4 bg-gray-200 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="h-6 bg-gray-200 rounded-full w-28" />
                <div className="h-4 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
