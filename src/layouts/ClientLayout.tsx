import { Outlet } from 'react-router-dom';

export default function ClientLayout() {
  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200 font-sans flex flex-col">
      <Outlet />
    </div>
  );
}
