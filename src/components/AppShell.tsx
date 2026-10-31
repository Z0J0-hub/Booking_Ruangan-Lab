import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  LibraryBig,
  LayoutDashboard,
  CalendarDays,
  DoorOpen,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { LibraryDashboardPage } from '@/pages/LibraryDashboardPage';
import { LibraryBookingsPage } from '@/pages/LibraryBookingsPage';
import { RoomsPage } from '@/pages/RoomsPage';

type Page = 'dashboard' | 'bookings' | 'rooms';

export function AppShell() {
  const { user, signOut } = useAuthStore();
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'admin';

  const navItems: { id: Page; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, show: true },
    { id: 'rooms', label: 'Ruangan', icon: <DoorOpen className="w-5 h-5" />, show: true },
    { id: 'bookings', label: isAdmin ? 'Kelola Sesi' : 'Booking Saya', icon: <CalendarDays className="w-5 h-5" />, show: true },
  ];

  const visibleNav = navItems.filter((n) => n.show);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center shadow-md">
              <LibraryBig className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">Library Booking</h1>
              <p className="text-xs text-slate-500">The Room</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActivePage(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activePage === item.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-sm font-bold text-slate-700">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user.full_name}</p>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${isAdmin ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>
                {isAdmin ? 'Administrator' : 'Mahasiswa'}
              </span>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-600 hover:text-slate-900"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center">
              <LibraryBig className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900">Library Booking The Room</span>
          </div>
          <div className="w-6" />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {activePage === 'dashboard' && <LibraryDashboardPage onNavigate={setActivePage} />}
          {activePage === 'bookings' && <LibraryBookingsPage />}
          {activePage === 'rooms' && <RoomsPage />}
        </main>
      </div>
    </div>
  );
}
