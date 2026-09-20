import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router";
import { Menu, X, Sparkles, User } from "lucide-react";
import { motion } from "framer-motion";
import { AIAssistant, type AISeedPrompt } from "./AIAssistant";
import { loginWithPassword, persistLoginState } from "../utils/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const navGroups = [
  {
    label: "数据查询",
    items: [
      { label: "数据概览", path: "/dashboard" },
      { label: "详细分析", path: "/dashboard/analysis" },
      { label: "3D大屏（数据驾驶舱）", path: "/visualization" },
    ],
  },
  {
    label: "AI预测",
    items: [
      { label: "预测结果", path: "/predict" },
    ],
  },
  {
    label: "报告中心",
    items: [
      { label: "报表管理", path: "/reports" },
    ],
  },
  {
    label: "系统设置",
    items: [
      { label: "系统设置", path: "/settings" },
    ],
  },
];

// 白色背景页面
const whitePages = ["/dashboard", "/dashboard/analysis", "/energy", "/predict", "/devices", "/carbon", "/settings"];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeedPrompt, setAiSeedPrompt] = useState<AISeedPrompt | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const location = useLocation();
  const [nightModeActive, setNightModeActive] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ night: boolean }>).detail;
      setNightModeActive(detail.night);
    };
    window.addEventListener("energy-night-mode", handler as EventListener);
    return () => window.removeEventListener("energy-night-mode", handler as EventListener);
  }, []);

  const isGroupActive = (paths: string[]) => paths.some((path) => location.pathname === path);

  const isWhitePage = whitePages.some(page => location.pathname === page);
  const is3DPage = location.pathname === "/visualization" || location.pathname === "/visualization3d";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onEnergyAi = (event: Event) => {
      const detail = (event as CustomEvent<{ seedPrompt?: AISeedPrompt }>).detail;
      if (detail?.seedPrompt?.text) {
        setAiSeedPrompt(detail.seedPrompt);
      }
      setAiOpen(true);
    };
    window.addEventListener("energy-open-ai-assistant", onEnergyAi as EventListener);
    return () => window.removeEventListener("energy-open-ai-assistant", onEnergyAi as EventListener);
  }, []);

  useEffect(() => {
    // 监听路由变化并更新用户名显示
    const updateCurrentUser = () => {
      const storedUser = localStorage.getItem('username');
      if (storedUser) {
        setCurrentUser(storedUser);
      } else {
        setCurrentUser('');
      }
    };

    updateCurrentUser();

    // 监听自定义登录事件 (从 HomePage 发出的)
    const handleLoginEvent = () => updateCurrentUser();
    window.addEventListener('login-success', handleLoginEvent);

    return () => {
      window.removeEventListener('login-success', handleLoginEvent);
    };
  }, [location.pathname]); // 路由变化时重新检查

  const handleModalLogin = async () => {
    if (!username || !password) {
      setLoginError('请输入用户名和密码');
      return;
    }

    setLoginError('');
    setLoginLoading(true);

    try {
      const result = await loginWithPassword(username, password);
      if (!result.ok) {
        setLoginError(result.message || '登录失败，请检查用户名或密码');
        return;
      }

      persistLoginState(username, result.payload);
      setCurrentUser(username);
      setLoginOpen(false);
      setUsername('');
      setPassword('');
      window.dispatchEvent(new Event('login-success'));
    } catch (error) {
      console.error('navbar login failed:', error);
      setLoginError('登录请求失败，请稍后重试');
    } finally {
      setLoginLoading(false);
    }
  };

  // Hide Navbar on Home Page
  if (location.pathname === "/") {
    return null;
  }

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${is3DPage
          ? nightModeActive
            ? scrolled ? "bg-slate-950/95 backdrop-blur-md shadow-sm" : "bg-slate-950/70 backdrop-blur-sm"
            : scrolled ? "bg-white/90 backdrop-blur-md shadow-sm" : "bg-white/70 backdrop-blur-sm"
          : isWhitePage
            ? scrolled ? "bg-white/90 backdrop-blur-md shadow-sm" : "bg-transparent"
            : scrolled ? "bg-black/90" : "bg-transparent"
          }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 h-20 flex items-center justify-between">
          {/* Logo - 仅在非首页显示 */}
          {location.pathname !== "/" && (
            <NavLink
              to="/"
              className="flex items-center flex-shrink-0"
            >
              <img
                src="/a72583cc8af6a68248f6b5ce37264fe6.png"
                alt="Logo"
                className={`w-12 h-12 transition-all ${is3DPage && !nightModeActive ? '' : 'filter invert'}`}
              />
            </NavLink>
          )}
          {location.pathname === "/" && <div className="flex-shrink-0 w-12" />}

          {/* Desktop Nav - 居中 */}
          <div className="hidden md:flex items-center justify-center gap-8 flex-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `text-sm tracking-wide transition-colors duration-300 ${is3DPage
                  ? nightModeActive
                    ? isActive ? "text-white" : "text-white/60 hover:text-white"
                    : isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                  : isWhitePage
                    ? isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                    : isActive ? "text-white" : "text-white/50 hover:text-white"
                }`
              }
            >
              数据接入
            </NavLink>
            {navGroups.map((group) => (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <button
              className={`text-sm tracking-wide transition-colors duration-300 ${is3DPage
                  ? nightModeActive
                    ? isGroupActive(group.items.map((item) => item.path)) ? "text-white" : "text-white/60 hover:text-white"
                    : isGroupActive(group.items.map((item) => item.path)) ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                  : isWhitePage
                    ? isGroupActive(group.items.map((item) => item.path)) ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                    : isGroupActive(group.items.map((item) => item.path)) ? "text-white" : "text-white/50 hover:text-white"
                }`}
              >
                {group.label}
              </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="rounded-none">
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {group.items.map((item) => (
                    <DropdownMenuItem key={item.path} asChild>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) => `w-full ${isActive ? "font-semibold" : ""}`}
                      >
                        {item.label}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>



          {/* 右侧登录按钮 */}
          <div className="hidden md:flex items-center gap-4">
            {/* AI助手 */}
            <button
              onClick={() => setAiOpen(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${aiOpen
                ? "bg-white text-black"
                : is3DPage
                  ? nightModeActive
                    ? "bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm border border-white/20"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                  : isWhitePage
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
                }`}
            >
              <Sparkles size={16} />
              <span className="text-sm font-medium">AI助手</span>
            </button>
            <button
              onClick={() => {
                if (!currentUser) setLoginOpen(true);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${is3DPage
                  ? nightModeActive
                    ? "border border-white/20 text-white hover:bg-white/10"
                    : "border border-gray-900 text-gray-900 hover:bg-gray-100"
                  : isWhitePage ? "border border-black text-black hover:bg-gray-100" : "border border-white text-white hover:bg-white/10"
                }`}
            >
              <User size={16} />
              <span className="text-sm font-medium">{currentUser || "登录"}</span>
            </button>
          </div>

          {/* Mobile */}
          <button
            className={`md:hidden p-2 ${is3DPage ? (nightModeActive ? "text-white" : "text-gray-900") : isWhitePage ? "text-gray-900" : "text-white"}`}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden fixed inset-0 top-20 transition-transform duration-500 ${
            is3DPage ? (nightModeActive ? "bg-slate-950" : "bg-white") : isWhitePage ? "bg-white" : "bg-black"
            } ${mobileOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex flex-col items-center justify-center h-full gap-8">
            <NavLink
              to="/"
              end
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `text-2xl font-light tracking-wide transition-colors ${is3DPage
                  ? nightModeActive
                    ? isActive ? "text-white" : "text-white/40"
                    : isActive ? "text-gray-900" : "text-gray-400"
                  : isWhitePage
                    ? isActive ? "text-gray-900" : "text-gray-400"
                    : isActive ? "text-white" : "text-white/40"
                }`
              }
            >
              首页
            </NavLink>
            {navGroups.map((group) => (
              <div key={group.label} className="w-full max-w-xs text-center">
                <div className={`text-xs tracking-[0.25em] mb-3 ${is3DPage ? (nightModeActive ? "text-white/50" : "text-gray-500") : isWhitePage ? "text-gray-500" : "text-white/50"}`}>{group.label}</div>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `block text-lg font-light tracking-wide transition-colors ${is3DPage
                          ? nightModeActive
                            ? isActive ? "text-white" : "text-white/40"
                            : isActive ? "text-gray-900" : "text-gray-400"
                          : isWhitePage
                            ? isActive ? "text-gray-900" : "text-gray-400"
                            : isActive ? "text-white" : "text-white/40"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            {/* Mobile AI助手 */}
            <button
              onClick={() => {
                setMobileOpen(false);
                setAiOpen(true);
              }}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg ${is3DPage
                  ? nightModeActive ? "bg-white/10 text-white border border-white/20" : "bg-gray-900 text-white"
                  : isWhitePage ? "bg-gray-900 text-white" : "bg-white text-black"
                }`}
            >
              <Sparkles size={20} />
              <span className="text-lg font-medium">AI助手</span>
            </button>

            {/* Mobile 登录 */}
            <button
              onClick={() => {
                setMobileOpen(false);
                if (!currentUser) setLoginOpen(true);
              }}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg ${is3DPage
                  ? nightModeActive ? "border border-white/20 text-white" : "border border-gray-900 text-gray-900"
                  : isWhitePage ? "border border-black text-black" : "border border-white text-white"
                }`}
            >
              <User size={20} />
              <span className="text-lg font-medium">{currentUser || "登录"}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* AI Assistant Modal */}
      <AIAssistant
        isOpen={aiOpen}
        onClose={() => {
          setAiOpen(false);
          setAiSeedPrompt(null);
        }}
        seedPrompt={aiSeedPrompt}
        onSeedConsumed={() => setAiSeedPrompt(null)}
      />

      {/* 登录模态框 */}
      {loginOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`w-full max-w-md rounded-lg p-8 ${isWhitePage ? "bg-white text-black" : "bg-black text-white border border-white/20"}`}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">登录系统</h2>
              <button
                onClick={() => {
                  setLoginOpen(false);
                  setUsername('');
                  setPassword('');
                  setLoginError('');
                }}
                className={`p-2 rounded-full ${isWhitePage ? "hover:bg-gray-100" : "hover:bg-white/10"}`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isWhitePage ? "text-gray-700" : "text-gray-300"}`}>
                  用户名
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg border ${isWhitePage ? "border-black focus:border-black" : "border-white focus:border-white"} bg-transparent focus:outline-none`}
                  placeholder="请输入用户名"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isWhitePage ? "text-gray-700" : "text-gray-300"}`}>
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg border ${isWhitePage ? "border-black focus:border-black" : "border-white focus:border-white"} bg-transparent focus:outline-none`}
                  placeholder="请输入密码"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="remember"
                    className={`mr-2 ${isWhitePage ? "text-black" : "text-white"}`}
                  />
                  <label htmlFor="remember" className={`text-sm ${isWhitePage ? "text-gray-600" : "text-gray-400"}`}>
                    记住我
                  </label>
                </div>
                <a href="#" className={`text-sm ${isWhitePage ? "text-black hover:text-gray-600" : "text-white hover:text-gray-300"}`}>
                  忘记密码？
                </a>
              </div>
              <button
                onClick={handleModalLogin}
                disabled={loginLoading}
                className={`w-full py-3 rounded-lg transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed ${isWhitePage ? "bg-black text-white hover:bg-gray-800" : "bg-white text-black hover:bg-gray-200"}`}
              >
                {loginLoading ? '登录中...' : '登录'}
              </button>
              {!!loginError && (
                <div className={`text-xs px-3 py-2 rounded border ${isWhitePage ? 'text-red-700 bg-red-50 border-red-200' : 'text-red-300 bg-red-500/10 border-red-500/20'}`}>
                  {loginError}
                </div>
              )}
              <div className={`text-center text-sm ${isWhitePage ? "text-gray-600" : "text-gray-400"}`}>
                还没有账号？ <a href="#" className={`${isWhitePage ? "text-black hover:text-gray-600" : "text-white hover:text-gray-300"}`}>立即注册</a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
