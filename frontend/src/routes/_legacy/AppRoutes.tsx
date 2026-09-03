import { Route, Routes } from 'react-router-dom';

function DashboardPlaceholder() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          School Staff Task Management
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">
          Staff task workflows start here.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          This frontend scaffold is ready for role-based dashboards, task assignment,
          notifications, reporting, and real-time updates.
        </p>
      </section>
    </main>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<DashboardPlaceholder />} />
    </Routes>
  );
}

export default AppRoutes;
