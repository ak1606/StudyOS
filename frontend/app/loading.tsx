// Root-level loading: shown while any top-level route segment is streaming
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200">
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  );
}
