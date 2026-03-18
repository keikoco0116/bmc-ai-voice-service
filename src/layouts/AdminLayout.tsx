import { Link, useLocation, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings2, PhoneCall, Bot, BookOpen, BarChart3, Headset, Settings, ExternalLink, LogOut, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { logout } from '../firebase';

const navItems = [
  { name: '儀表板', path: '/admin', icon: LayoutDashboard },
  { name: '專線設定', path: '/admin/setup', icon: Settings2 },
  { 
    name: 'AI 客服管理', 
    icon: Bot,
    children: [
      { name: 'AI 設定', path: '/admin/ai-config', icon: Bot },
      { name: '知識庫', path: '/admin/knowledge', icon: BookOpen },
    ]
  },
  { name: '通話記錄', path: '/admin/calls', icon: PhoneCall },
  { name: '報表分析', path: '/admin/analytics', icon: BarChart3 },
  { name: '人工接管', path: '/admin/live', icon: Headset },
  { name: '系統設定', path: '/admin/settings', icon: Settings },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    'AI 客服管理': true
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/admin/login');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-white font-sans">
      {/* Sidebar */}
      <aside className="w-[240px] bg-[#0f172a] border-r border-slate-800 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="text-teal-500" />
            AI 語音客服
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            if (item.children) {
              const isOpen = openMenus[item.name];
              const hasActiveChild = item.children.some(child => location.pathname === child.path);
              
              return (
                <div key={item.name} className="space-y-1">
                  <button
                    onClick={() => toggleMenu(item.name)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                      hasActiveChild && !isOpen
                        ? 'bg-teal-500/10 text-teal-400 font-medium'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  
                  {isOpen && (
                    <div className="pl-10 pr-2 space-y-1">
                      {item.children.map(child => {
                        const isActive = location.pathname === child.path;
                        const ChildIcon = child.icon;
                        return (
                          <Link
                            key={child.path}
                            to={child.path}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                              isActive
                                ? 'bg-teal-500/10 text-teal-400 font-medium'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                            <ChildIcon className="w-4 h-4" />
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path!}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-teal-500/10 text-teal-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
          
          <div className="pt-4 mt-4 border-t border-slate-800">
            <Link
              to="/client"
              target="_blank"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-slate-400 hover:bg-slate-800 hover:text-teal-400"
            >
              <ExternalLink className="w-5 h-5" />
              開啟前台介面
            </Link>
          </div>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3 overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium shrink-0">
                  {user.email?.[0].toUpperCase() || 'A'}
                </div>
              )}
              <div className="text-sm truncate">
                <div className="font-medium text-slate-200 truncate">{user.displayName || 'Admin User'}</div>
                <div className="text-slate-500 text-xs truncate">{user.email}</div>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
              title="登出"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#0f172a]">
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
