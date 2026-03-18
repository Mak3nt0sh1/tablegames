import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Gamepad2, User, Settings as SettingsIcon, LogOut } from "lucide-react";
import { auth } from "../api/client";

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = auth.me();

  const handleLogout = () => {
    auth.logout();
    navigate('/login');
  };

  const navItems = [
    { path: "/", label: "Игровое Лобби", icon: <Gamepad2 size={20} /> },
    { path: "/profile", label: "Мой Профиль", icon: <User size={20} /> },
    { path: "/settings", label: "Настройки", icon: <SettingsIcon size={20} /> }
  ];

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white">T</div>
          <h1 className="text-xl font-bold tracking-tight">TableGames</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive ? "bg-indigo-500/10 text-indigo-400" : "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Выйти</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800 flex items-center justify-between px-8 z-10">
          <h2 className="text-lg font-semibold text-gray-200">
            {navItems.find(i => i.path === location.pathname)?.label || "Настольные игры"}
          </h2>
          <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-800 p-2 rounded-lg transition-colors">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full"></div>
            <span className="font-medium">{currentUser?.username ?? "Гость"}</span>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
