import { useEffect } from 'react';
import { useAuthStore, AuthPage, ResetPasswordPage } from '@/features/auth';
import { AppShell } from '@/components/AppShell';
import { LibraryBig } from 'lucide-react';

export default function App() {
  const { initialized, initialize, user, passwordRecovery } = useAuthStore();

  useEffect(() => {
    return initialize();
  }, [initialize]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 flex items-center justify-center shadow-lg">
            <LibraryBig className="w-7 h-7 text-white" />
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-sm">Memuat...</span>
          </div>
        </div>
      </div>
    );
  }

  if (passwordRecovery) return <ResetPasswordPage />;
  if (!user) return <AuthPage />;
  return <AppShell />;
}
