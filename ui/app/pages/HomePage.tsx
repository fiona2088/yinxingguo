import { useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ArrowUpRight, User, Lock, Eye, EyeOff, UploadCloud, Database, X, Loader2, FileText, CheckCircle, ChevronLeft, ChevronRight, Clock, Trash2 } from "lucide-react";
import { CursorFollower } from "../components/CursorFollower";
import { TextSplitter } from "../components/TextSplitter";
import { TextReveal } from "../components/TextReveal";
import { canUseDevBypass, clearLoginState, isDevBypassEnabled, loginWithPassword, persistLoginState, setDevBypassEnabled as persistDevBypassEnabled } from "../utils/auth";

// 10张著名建筑摄影作品
const heroImages = [
  "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1920&q=80",
  "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=1920&q=80",
  "https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=1920&q=80",
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1920&q=80",
  "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1920&q=80",
  "https://images.unsplash.com/photo-1493397212122-2b85dda8106b?w=1920&q=80",
  "https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=1920&q=80",
  "https://images.unsplash.com/photo-1448630360428-65456885c650?w=1920&q=80",
  "https://images.unsplash.com/photo-1464938050520-ef2270bb8ce8?w=1920&q=80",
];

// 作品展示 - 建筑相关（彩色图片）
const works = [
  { title: "上海中心", category: "超高层", image: "https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=800&q=80" },
  { title: "大兴机场", category: "交通枢纽", image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80" },
  { title: "平安中心", category: "商业办公", image: "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&q=80" },
  { title: "广州塔", category: "观光塔", image: "https://images.unsplash.com/photo-1537531383496-f4749b8032cf?w=800&q=80" },
  { title: "鸟巢", category: "体育场馆", image: "https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=800&q=80" },
  { title: "央视大楼", category: "媒体中心", image: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&q=80" },
];

export function HomePage() {
  const navigate = useNavigate();
  const [currentImage, setCurrentImage] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [devBypassEnabled, setDevBypassOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const devBypassAvailable = canUseDevBypass();

  const getCurrentUsername = () => (localStorage.getItem("username") || username || "").trim();

  const handleLogin = async () => {
    if (!username || !password) {
      setLoginError("请输入用户名和密码");
      return;
    }

    setLoginError("");
    setIsLoading(true);
    try {
      const result = await loginWithPassword(username, password);
      if (!result.ok) {
        setLoginError(result.message || "登录失败，请检查用户名或密码");
        return;
      }

      setIsLoggedIn(true);
      persistLoginState(username, result.payload);
      window.dispatchEvent(new Event('login-success'));
    } catch (error) {
      console.error(error);
      setLoginError("登录请求失败，请检查网络或稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [datasets, setDatasets] = useState<any[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isSelectingDataset, setIsSelectingDataset] = useState(false);
  const [datasetSelectError, setDatasetSelectError] = useState('');
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);
  const [datasetDeleteError, setDatasetDeleteError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // 获取数据集列表
  const fetchDatasets = async (page: number) => {
    setIsLoadingDatasets(true);
    try {
      const currentUser = getCurrentUsername();
      if (!currentUser) {
        setDatasets([]);
        setDatasetSelectError('请先登录后再选择数据库');
        return;
      }

      const params = new URLSearchParams({
        pageNum: String(page),
        pageSize: '5',
        userName: currentUser,
      });

      const response = await fetch(`/api/database/check?${params.toString()}`, {
        method: 'GET',
        redirect: 'follow'
      });
      const text = await response.text();
      let res: any = null;
      try {
        res = JSON.parse(text);
      } catch {
        res = text;
      }
      console.log('Datasets response:', JSON.stringify(res));

      // 宽容处理返回码
      if (res.code == 0 || res.code == 200) {
        // 适配后端返回的数据结构
        let list: any[] = [];
        let total = 0;

        if (Array.isArray(res.data)) {
          // 如果 data 直接是数组
          list = res.data;
          total = list.length;
        } else if (res.data && (Array.isArray(res.data.rows) || Array.isArray(res.data.records))) {
          // 分页结构
          list = res.data.rows || res.data.records || [];
          total = res.data.total || list.length;
        } else if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
          // 单个对象直接作为列表的一项
          list = [res.data];
          total = 1;
        } else if (Array.isArray(res)) {
          // 如果根对象就是数组 (不太常见但有可能)
          list = res;
          total = list.length;
        } else if (res.rows && Array.isArray(res.rows)) {
          // 根对象包含 rows
          list = res.rows;
          total = res.total || list.length;
        }

        console.log('Parsed list:', JSON.stringify(list));

        const formattedList = list.map((item: any, index: number) => {
          const datasetName = item.name || item.databaseName || item.dbName || item.id || `dataset-${index + 1}`;
          const datasetDesc = item.desc || item.description || item.remark || item.note || '暂无描述';

          return {
            title: datasetName,
            id: item.name || item.id || datasetName,
            desc: datasetDesc,
            date: item.createTime || item.date || '未知时间',
            size: item.size || '未知大小'
          };
        });

        setDatasets(formattedList);
        setTotalPages(Math.ceil(total / 5) || 1);
      } else {
        console.error("API Error:", res.msg || "Unknown error");
        // 如果失败，尝试显示空列表而不是报错
        setDatasets([]);
      }
    } catch (error) {
      console.error("Failed to fetch datasets:", error);
    } finally {
      setIsLoadingDatasets(false);
    }
  };

  useEffect(() => {
    if (showSelectModal) {
      fetchDatasets(currentPage);
    }
  }, [showSelectModal, currentPage]);

  // 处理文件上传逻辑
  const handleUpload = async () => {
    if (!uploadFile || !uploadName || !uploadDesc) {
      setUploadError("请填写所有必填字段并上传文件");
      return;
    }
    const currentUser = getCurrentUsername();
    if (!currentUser) {
      setUploadError("请先登录后再上传数据集");
      return;
    }

    setUploadError("");
    setIsUploading(true);

    const formData = new FormData();
    formData.append('name', uploadName);
    formData.append('desc', uploadDesc);
    formData.append('file', uploadFile, uploadFile.name);

    try {
      const response = await fetch(`/api/database/upload?userName=${encodeURIComponent(currentUser)}`, {
        method: 'POST',
        body: formData
      });
      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      console.log('Upload response:', JSON.stringify(data));

      if (!response.ok) {
        const message = (data && typeof data === 'object' && (data.msg || data.message)) || `上传失败 (HTTP ${response.status})`;
        setUploadError(message);
        setUploadSuccess(false);
        return;
      }

      const code = data && typeof data === 'object' ? data.code : undefined;
      const uploadOk = code === 0 || code === 200 || code === '0' || code === '200' || code === undefined;
      if (!uploadOk) {
        const message = (data && typeof data === 'object' && (data.msg || data.message)) || '上传失败，请检查文件格式或联系后端';
        setUploadError(message);
        setUploadSuccess(false);
        return;
      }

      // 上传成功
      setUploadSuccess(true);
      // 成功后刷新列表
      fetchDatasets(1);
      // 清空表单，但保留成功状态以显示反馈
      setUploadName('');
      setUploadDesc('');
      setUploadFile(null);
    } catch (error) {
      console.error(error);
      setUploadError("上传失败，请稍后重试");
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    setShowUploadModal(false);
    setUploadSuccess(false);
    setUploadName('');
    setUploadDesc('');
    setUploadFile(null);
    setUploadError('');
  };

  const [selectedDataset, setSelectedDataset] = useState<{ id: string, title: string, databaseName: string } | null>(null);

  const handleDevBypassToggle = () => {
    const next = !devBypassEnabled;
    persistDevBypassEnabled(next);
    setDevBypassOn(next);

    if (next) {
      const devUsername = (localStorage.getItem("username") || "developer").trim();
      setUsername(devUsername);
      setIsLoggedIn(true);
      setLoginError("");
      setDatasetSelectError("");
      setShowUploadModal(false);
      setShowSelectModal(false);
      window.dispatchEvent(new Event("login-success"));
      navigate("/dashboard", { replace: true });
      return;
    }

    setIsLoggedIn(false);
    setPassword("");
    setSelectedDataset(null);
    setLoginError("");
    setShowUploadModal(false);
    setShowSelectModal(false);
    window.dispatchEvent(new Event("login-success"));
  };

  const handeSelectDataset = async (item: any) => {
    setDatasetSelectError('');
    setIsSelectingDataset(true);

    try {
      const currentUser = getCurrentUsername();
      if (!currentUser) {
        setDatasetSelectError('请先登录后再选择数据库');
        return;
      }

      const params = new URLSearchParams({
        name: item.id || '',
        userName: currentUser,
      });
      const response = await fetch(`/api/database/select?${params.toString()}`, {
        method: 'GET'
      });
      const res = await response.json();
      console.log('Dataset detail response:', JSON.stringify(res));

      let detail: any = null;
      if (Array.isArray(res?.data)) {
        detail = res.data[0] || null;
      } else if (Array.isArray(res?.data?.rows)) {
        detail = res.data.rows[0] || null;
      } else if (Array.isArray(res?.data?.records)) {
        detail = res.data.records[0] || null;
      } else if (res?.data && typeof res.data === 'object') {
        detail = res.data;
      }

      const databaseName = detail?.name || detail?.databaseName || detail?.dbName || item.id || item.title;

      setSelectedDataset({
        id: item.id,
        title: item.title,
        databaseName,
      });
      setShowSelectModal(false);
    } catch (error) {
      console.error('Failed to select dataset:', error);
      setDatasetSelectError('获取数据库属性失败，请稍后重试');
    } finally {
      setIsSelectingDataset(false);
    }
  };

  const handleDeleteDataset = async (e: React.MouseEvent<HTMLButtonElement>, item: any) => {
    e.stopPropagation();
    setDatasetDeleteError('');

    if (!item?.id) {
      setDatasetDeleteError('删除失败：缺少数据库名称');
      return;
    }

    const confirmed = window.confirm(`确认删除数据库 ${item.id} 吗？`);
    if (!confirmed) {
      return;
    }

    setDeletingDatasetId(item.id);
    try {
      const currentUser = getCurrentUsername();
      if (!currentUser) {
        setDatasetDeleteError('请先登录后再删除数据库');
        return;
      }

      const params = new URLSearchParams({
        name: item.id,
        userName: currentUser,
      });

      const response = await fetch(`/api/database/delete?${params.toString()}`, {
        method: 'DELETE',
      });
      const result = await response.text();
      console.log('Delete dataset response:', result);

      if (selectedDataset?.id === item.id) {
        setSelectedDataset(null);
      }

      if (datasets.length === 1 && currentPage > 1) {
        setCurrentPage((p) => Math.max(1, p - 1));
      } else {
        fetchDatasets(currentPage);
      }
    } catch (error) {
      console.error('Failed to delete dataset:', error);
      setDatasetDeleteError('删除失败，请稍后重试');
    } finally {
      setDeletingDatasetId(null);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv') || file.name.endsWith('.json')) {
        setUploadFile(file);
        setUploadError("");
      } else {
        setUploadError("仅支持 .csv 或 .json 文件");
      }
    }
  };

  const heroY = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0.2]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.25]);

  useEffect(() => {
    const bypassEnabled = isDevBypassEnabled();
    setDevBypassOn(bypassEnabled);

    if (bypassEnabled) {
      const devUsername = (localStorage.getItem("username") || "developer").trim();
      setUsername(devUsername);
      setIsLoggedIn(true);
      navigate("/dashboard", { replace: true });
      return;
    }

    // Clear stale dev-bypass login snapshot when bypass is disabled.
    const usernameFromStorage = (localStorage.getItem("username") || "").trim();
    const tokenFromStorage = (localStorage.getItem("authToken") || "").trim();
    if (usernameFromStorage === "developer" || tokenFromStorage === "dev-bypass-token") {
      localStorage.removeItem("devBypassEnabled");
      clearLoginState();
    }

    const storedLoginFlag = localStorage.getItem("isLoggedIn") === "true";
    const storedUsername = localStorage.getItem("username") || "";
    if (storedLoginFlag && storedUsername) {
      setIsLoggedIn(true);
      setUsername(storedUsername);
    }

    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        targetX = (e.clientX - rect.left - rect.width / 2) / 50;
        targetY = (e.clientY - rect.top - rect.height / 2) / 50;
      }
    };

    const animate = () => {
      mouseX += (targetX - mouseX) * 0.1;
      mouseY += (targetY - mouseY) * 0.1;
      setMousePos({ x: mouseX, y: mouseY });
      requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    animate();
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <motion.div
      className="bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
    >
      {/* Hero */}
      <section ref={heroRef} className="relative h-screen overflow-hidden">
        {heroImages.map((img, index) => (
          <motion.div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ${index === currentImage ? "opacity-100" : "opacity-0"}`}
            style={{
              x: mousePos.x,
              y: mousePos.y,
              scale: heroScale,
            }}
          >
            <img src={img} alt="" className="w-full h-full object-cover" />
          </motion.div>
        ))}

        <motion.div
          className="absolute inset-0 bg-black/40"
          style={{ opacity: heroOpacity }}
        />

        <div className="relative z-10 h-full px-6 md:px-12 lg:px-24 flex items-center">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
              style={{
                x: -mousePos.x * 0.3,
                y: -mousePos.y * 0.3,
              }}
            >
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-white/50 text-xs tracking-[0.3em] uppercase mb-8"
              >
                建筑能源管理系统
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-[clamp(3rem,8vw,8rem)] font-bold leading-[1.1] tracking-tight mb-8 text-white"
              >
                <TextSplitter
                  text="智慧能源"
                  letterClassName="origin-bottom"
                />
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="text-white/60 text-lg md:text-xl max-w-md mb-12 font-light"
              >
                以数字孪生与人工智能技术，构建建筑能源全域管控平台
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.8 }}
                className="flex gap-6"
              >
                <button
                  onClick={() => navigate("/dashboard")}
                  className="lg:hidden group flex items-center gap-3 text-sm tracking-wider hover:gap-5 transition-all text-white border border-white/20 px-6 py-3 rounded-full hover:bg-white/10"
                >
                  进入系统 <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            </motion.div>

            {/* Right Login Box */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              className="hidden lg:flex justify-end pr-12 xl:pr-24"
            >
              <div className="w-full max-w-[400px] min-h-[540px] flex flex-col justify-center bg-black/20 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                {devBypassAvailable && (
                  <div className="relative z-10 mb-4 flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2">
                    <div className="text-[11px] tracking-wide text-amber-100">开发者开关：跳过登录与数据集选择</div>
                    <button
                      onClick={handleDevBypassToggle}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${devBypassEnabled ? "bg-amber-300 text-black" : "bg-white/10 text-white hover:bg-white/20"}`}
                    >
                      {devBypassEnabled ? "已开启" : "已关闭"}
                    </button>
                  </div>
                )}

                {!isLoggedIn ? (
                  // === Login Form ===
                  <div className="space-y-6 relative z-10">
                    <h2 className="text-xl font-medium text-white mb-2">统一身份认证</h2>
                    <p className="text-white/40 text-sm mb-6">欢迎使用智慧能源管理系统</p>

                    {/* Username */}
                    <div className="relative group/input">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 group-focus-within/input:text-white transition-colors">
                        <User size={18} />
                      </div>
                      <input
                        type="text"
                        placeholder="用户名"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
                      />
                    </div>

                    {/* Password */}
                    <div className="relative group/input">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 group-focus-within/input:text-white transition-colors">
                        <Lock size={18} />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="密码"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 pr-10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {/* Remember Me */}
                    <label className="flex items-center gap-2 cursor-pointer group/check">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${rememberMe ? 'bg-white border-white' : 'border-white/30 bg-transparent group-hover/check:border-white/50'}`}>
                        {rememberMe && <div className="w-2 h-2 bg-black rounded-sm" />}
                      </div>
                      <input type="checkbox" className="hidden" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} />
                      <span className="text-sm text-white/60 group-hover/check:text-white/80 transition-colors">7天免登录</span>
                    </label>

                    {/* Login Button */}
                    <button
                      onClick={handleLogin}
                      disabled={isLoading}
                      className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-gray-100 active:scale-[0.98] transition-all shadow-lg shadow-white/5 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isLoading ? "登录中..." : "登录"}
                    </button>

                    {loginError && (
                      <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {loginError}
                      </p>
                    )}

                    {/* Footer Links */}
                    <div className="flex justify-between text-xs text-white/40 mt-6 pt-6 border-t border-white/10">
                      <button className="hover:text-white transition-colors">账号激活</button>
                      <button className="hover:text-white transition-colors">手机变更</button>
                    </div>
                  </div>
                ) : (
                  showUploadModal ? (
                    // === Upload Modal View ===
                    <div className="space-y-6 relative z-10 animate-in fade-in zoom-in duration-300 h-full flex flex-col">
                      <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl font-medium text-white">{uploadSuccess ? "上传结果" : "导入新数据集"}</h2>
                        <button onClick={resetUpload} className="text-white/50 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                          <X size={20} />
                        </button>
                      </div>

                      {uploadSuccess ? (
                        <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in duration-300">
                          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20 shadow-[0_0_30px_-5px_theme(colors.green.500/0.3)]">
                            <CheckCircle size={40} className="text-green-400" />
                          </div>
                          <div className="text-center space-y-2">
                            <h3 className="text-xl font-medium text-white">上传成功！</h3>
                            <p className="text-white/40 text-sm max-w-[240px]">您的数据集已成功上传至服务器，可以在列表中查看。</p>
                          </div>
                          <div className="w-full pt-8 flex gap-4">
                            <button
                              onClick={() => {
                                resetUpload();
                                setShowSelectModal(true);
                              }}
                              className="flex-1 py-3.5 bg-white hover:bg-gray-100 text-black font-bold rounded-xl text-sm transition-colors shadow-lg shadow-white/5"
                            >
                              去选择数据集
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 space-y-5 overflow-y-auto pr-1 custom-scrollbar">
                            {/* Database Name Input */}
                            <div className="space-y-2">
                              <label className="text-xs text-white/60 font-medium ml-1">数据库名称 <span className="text-red-400">*</span></label>
                              <input
                                type="text"
                                value={uploadName}
                                onChange={(e) => setUploadName(e.target.value)}
                                placeholder="例如: campus_v3"
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/40 focus:bg-white/10 transition-all font-light"
                              />
                            </div>

                            {/* Database Description Input */}
                            <div className="space-y-2">
                              <label className="text-xs text-white/60 font-medium ml-1">数据库描述 <span className="text-red-400">*</span></label>
                              <input
                                type="text"
                                value={uploadDesc}
                                onChange={(e) => setUploadDesc(e.target.value)}
                                placeholder="例如: 校园能源数据描述"
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/40 focus:bg-white/10 transition-all font-light"
                              />
                            </div>

                            {/* File Upload Area */}
                            <div className="space-y-2">
                              <label className="text-xs text-white/60 font-medium ml-1">上传文件 (.csv, .json) <span className="text-red-400">*</span></label>
                              <div
                                className={`border border-dashed rounded-xl h-36 flex flex-col items-center justify-center transition-all cursor-pointer relative group/upload overflow-hidden ${isDragOver ? 'border-white bg-white/10' : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'}`}
                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                                onDrop={handleFileDrop}
                                onClick={() => document.getElementById('file-upload')?.click()}
                              >
                                <input
                                  id="file-upload"
                                  type="file"
                                  accept=".csv,.json"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                      setUploadFile(e.target.files[0]);
                                      setUploadError("");
                                    }
                                  }}
                                />

                                {uploadFile ? (
                                  <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 border border-green-500/30">
                                      <FileText size={24} />
                                    </div>
                                    <div className="text-center">
                                      <div className="text-sm text-white font-medium truncate max-w-[240px] px-4">{uploadFile.name}</div>
                                      <div className="text-xs text-white/40 mt-1">点击或拖拽以更换文件</div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-3 pointer-events-none text-white/40 group-hover/upload:text-white/80 transition-colors">
                                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-1 border border-white/5 group-hover/upload:border-white/20 group-hover/upload:bg-white/10 transition-all">
                                      <UploadCloud size={24} />
                                    </div>
                                    <div className="text-center">
                                      <div className="text-sm font-medium">点击或拖拽文件到此处</div>
                                      <div className="text-xs opacity-60 mt-1 uppercase tracking-wider">支持 .csv, .json 格式</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Error Message */}
                            <div className="h-6 flex items-center justify-center">
                              {uploadError ? (
                                <span className="text-red-400 text-xs animate-in fade-in slide-in-from-top-1 px-3 py-1 bg-red-500/10 rounded-full border border-red-500/20">
                                  {uploadError}
                                </span>
                              ) : (
                                <span className="text-white/30 text-xs">请填写所有必填字段并上传文件</span>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 flex gap-4 mt-auto">
                            <button
                              onClick={resetUpload}
                              className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm transition-colors border border-white/10 font-medium"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleUpload}
                              disabled={isUploading}
                              className="flex-1 py-3.5 bg-white hover:bg-gray-100 text-black font-bold rounded-xl text-sm transition-colors shadow-lg shadow-white/5 disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                              {isUploading && <Loader2 size={16} className="animate-spin" />}
                              {isUploading ? "上传中..." : "确认上传"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : showSelectModal ? (
                    // === Select Dataset View ===
                    <div className="space-y-6 relative z-10 animate-in fade-in zoom-in duration-300 h-full flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-medium text-white">选择数据集</h2>
                        <button onClick={() => setShowSelectModal(false)} className="text-white/50 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                          <X size={20} />
                        </button>
                      </div>

                      {/* Dataset List */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2 space-y-3 pb-2 relative min-h-0">
                        {isLoadingDatasets ? (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <Loader2 className="animate-spin text-white/40" size={32} />
                          </div>
                        ) : datasets.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-white/30 space-y-2">
                            <Database size={40} className="mb-2 opacity-50" />
                            <p className="text-sm">暂无可用数据集</p>
                          </div>
                        ) : (
                          datasets.map((dataset, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (deletingDatasetId === dataset.id) return;
                                handeSelectDataset(dataset);
                              }}
                              className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl p-4 transition-all cursor-pointer group/item relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
                              style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'backwards' }}
                            >
                              <div className="absolute top-3 right-3 flex items-center gap-2">
                                <div className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded border border-white/5">{dataset.size}</div>
                                <button
                                  onClick={(e) => handleDeleteDataset(e, dataset)}
                                  disabled={deletingDatasetId === dataset.id}
                                  className="h-7 px-2 rounded border border-red-400/30 text-red-300 hover:bg-red-500/15 hover:border-red-300/50 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                                >
                                  {deletingDatasetId === dataset.id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={12} />
                                  )}
                                  删除
                                </button>
                              </div>
                              <h3 className="text-white font-medium text-base mb-1 pr-28 truncate">{dataset.title}</h3>
                              <div className="space-y-1">
                                <div className="text-xs text-white/40 font-mono flex items-center gap-2">
                                  描述: <span className="text-blue-300/80 truncate">{dataset.desc}</span>
                                </div>
                                <div className="text-xs text-white/30 flex items-center gap-2">
                                  <Clock size={12} /> {dataset.date}
                                </div>
                              </div>
                              <div className="absolute bottom-4 right-4 opacity-0 group-hover/item:opacity-100 transition-opacity transform group-hover/item:translate-x-0 translate-x-2">
                                <ArrowRight size={16} className="text-white/60" />
                              </div>
                            </div>
                          )))}

                        {isSelectingDataset && (
                          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                            <div className="flex items-center gap-2 text-sm text-white/80">
                              <Loader2 className="animate-spin" size={16} />
                              正在读取数据库属性...
                            </div>
                          </div>
                        )}
                      </div>

                      {!!datasetSelectError && (
                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                          {datasetSelectError}
                        </div>
                      )}

                      {!!datasetDeleteError && (
                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                          {datasetDeleteError}
                        </div>
                      )}

                      {/* Pagination */}
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-white/40">
                        <button
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="tracking-widest">第 {currentPage} 页 / 共 {totalPages} 页</span>
                        <button
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    // === Selection View (Post-Login) ===
                    <div className="space-y-6 relative z-10 animate-in fade-in zoom-in duration-300 h-full flex flex-col justify-between">
                      <div>
                        <h2 className="text-xl font-medium text-white mb-2">选择操作</h2>
                        <p className="text-white/40 text-sm mb-6">请选择您要进行的数据集操作</p>

                        <div className="space-y-4">
                          {/* Upload Button */}
                          <button
                            onClick={() => setShowUploadModal(true)}
                            className="w-full bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-6 py-6 flex items-center gap-6 transition-all group/btn text-left shadow-lg"
                          >
                            <div className="w-16 h-16 rounded-full bg-white/5 flex flex-shrink-0 items-center justify-center group-hover/btn:scale-110 group-hover/btn:bg-white/10 transition-all border border-white/5">
                              <UploadCloud size={28} className="text-white/80 group-hover/btn:text-white" />
                            </div>
                            <div>
                              <div className="text-white font-medium text-lg mb-1">上传数据集</div>
                              <div className="text-white/40 text-sm tracking-wide">Upload New Dataset</div>
                            </div>
                          </button>

                          {/* Select Button */}
                          <button
                            onClick={() => setShowSelectModal(true)}
                            className={`w-full bg-white/10 hover:bg-white/20 border ${selectedDataset ? 'border-green-500/50 bg-green-500/10 hover:bg-green-500/20' : 'border-white/10'} rounded-xl px-6 py-6 flex items-center gap-6 transition-all group/btn text-left shadow-lg relative overflow-hidden`}
                          >
                            <div className={`w-16 h-16 rounded-full flex flex-shrink-0 items-center justify-center transition-all border ${selectedDataset ? 'bg-green-500/20 border-green-500/30' : 'bg-white/5 border-white/5 group-hover/btn:scale-110 group-hover/btn:bg-white/10'}`}>
                              {selectedDataset ? (
                                <CheckCircle size={28} className="text-green-400" />
                              ) : (
                                <Database size={28} className="text-white/80 group-hover/btn:text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-white font-medium text-lg mb-1">选择数据集</div>
                              <div className="text-white/40 text-sm tracking-wide">Select Existing Dataset</div>
                              {selectedDataset && (
                                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/20 text-xs text-green-300 animate-in fade-in slide-in-from-left-2">
                                  <span>已选择: {selectedDataset.title}</span>
                                </div>
                              )}
                              {selectedDataset?.databaseName && (
                                <div className="mt-2 text-xs text-white/60">
                                  数据库名: <span className="text-green-300">{selectedDataset.databaseName}</span>
                                </div>
                              )}
                            </div>
                            {selectedDataset && (
                              <div className="absolute top-0 right-0 p-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_theme(colors.green.500)] animate-pulse" />
                              </div>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="pt-8 flex flex-col items-center gap-4">
                        <button
                          onClick={() => {
                            persistDevBypassEnabled(false)
                            setDevBypassOn(false)
                            setIsLoggedIn(false)
                            setPassword("")
                            setLoginError("")
                            clearLoginState()
                            window.dispatchEvent(new Event('login-success'))
                          }}
                          className="text-white/40 hover:text-white text-xs transition-colors"
                        >
                          返回登录
                        </button>
                        <button
                          onClick={() => navigate('/dashboard')}
                          disabled={!selectedDataset && !devBypassEnabled}
                          className={`flex items-center gap-2 text-sm transition-all group/link px-6 py-2 rounded-full ${selectedDataset || devBypassEnabled ? 'bg-white/10 hover:bg-white/20 text-white shadow-lg shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed' : 'text-white/30 cursor-not-allowed opacity-50'}`}
                        >
                          {selectedDataset || devBypassEnabled ? "进入系统" : "请先选择数据集"} <ArrowRight size={16} className={`transition-transform ${selectedDataset || devBypassEnabled ? 'group-hover/link:translate-x-1' : ''}`} />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="absolute bottom-12 left-6 md:left-12 lg:left-24 flex gap-2">
          {heroImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentImage(index)}
              className={`h-[2px] transition-all duration-300 ${index === currentImage ? "w-8 bg-white" : "w-4 bg-white/30"}`}
            />
          ))}
        </div>

        <div className="absolute bottom-12 right-6 md:right-12 lg:right-24 text-white/30 text-xs tracking-widest">
          {String(currentImage + 1).padStart(2, '0')} / {String(heroImages.length).padStart(2, '0')}
        </div>
      </section>

      {/* About */}
      <section className="py-48 md:py-64 px-6 md:px-12 lg:px-24">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 lg:gap-48">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-white/40 text-xs tracking-[0.3em] uppercase mb-8"
              >
                关于
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1]"
              >
                <TextReveal text="重新定义" delay={0.6} />
                <br />
                <TextReveal text="建筑能源" delay={0.9} />
              </motion.h2>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="flex flex-col justify-end"
            >
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="text-white/50 text-xl leading-relaxed mb-8"
              >
                我们专注于建筑能源智能化，通过物联网、人工智能与数字孪生技术，打造行业领先的能源管理平台。
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.7 }}
                className="text-white/30 text-sm"
              >
                已服务 500+ 座建筑，平均节能 30%
              </motion.p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Services - 白色背景 */}
      <section className="py-48 px-6 md:px-12 lg:px-24 bg-white text-black">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="mb-24"
          >
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-gray-400 text-xs tracking-[0.3em] uppercase mb-8"
            >
              服务
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-5xl md:text-6xl font-bold"
            >
              解决方案
            </motion.h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-200">
            {["智能监测", "AI 分析", "设备管理", "碳排管理", "3D 可视化", "数据报表"].map((service, i) => (
              <div className="relative" key={i}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6, delay: 0.1 * i }}
                  className="bg-white p-12 md:p-16 group hover:bg-gray-50 transition-colors cursor-pointer border border-gray-200 relative z-10"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    transformStyle: "preserve-3d",
                    perspective: "1000px"
                  }}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const rotateX = (y - centerY) / 15;
                    const rotateY = (centerX - x) / 15;
                    const shadowX = (x - centerX) / 10;
                    const shadowY = (y - centerY) / 10;

                    e.currentTarget.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
                    e.currentTarget.style.boxShadow = `rgba(0, 0, 0, 0.2) ${shadowX}px ${shadowY}px 20px`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)";
                    e.currentTarget.style.boxShadow = "rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px";
                  }}
                >
                  <span className="text-gray-400 text-xs">0{i + 1}</span>
                  <h3 className="text-2xl md:text-3xl font-medium mt-6 text-gray-900 group-hover:translate-x-2 transition-transform">{service}</h3>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Works - 黑色背景 */}
      <section className="py-48 px-6 md:px-12 lg:px-24 border-t border-white/10">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="flex justify-between items-end mb-24"
          >
            <div>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-white/40 text-xs tracking-[0.3em] uppercase mb-8"
              >
                作品
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-5xl md:text-6xl font-bold"
              >
                标杆案例
              </motion.h2>
            </div>
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="hidden md:flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
            >
              查看全部 <ArrowUpRight size={16} />
            </motion.button>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {works.map((work, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
                className="group cursor-pointer relative"
                whileHover={{ scale: 1.03 }}
              >
                <motion.div
                  initial={{ scale: 0.95 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                  className="aspect-[4/3] overflow-hidden mb-6 relative"
                  whileHover={{ boxShadow: "0 0 30px rgba(255,255,255,0.3)" }}
                >
                  <div className="relative w-full h-full overflow-hidden">
                    <img
                      src={work.image}
                      alt={work.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700"
                    />
                    <motion.div
                      className="absolute inset-0 bg-black"
                      initial={{ scaleX: 1, transformOrigin: "center" }}
                      whileInView={{ scaleX: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 * index + 0.2 }}
                  className="flex justify-between items-center"
                  whileHover={{ y: -5 }}
                >
                  <h3 className="text-xl font-medium group-hover:text-white transition-colors">{work.title}</h3>
                  <span className="text-white/40 text-xs group-hover:text-white/80 transition-colors">{work.category}</span>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Infinite Horizontal Scroll */}
      <section className="py-32 border-t border-white/10 overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-24">
          <motion.div
            className="flex space-x-6"
            animate={{ x: -300 }}
            transition={{
              repeat: Infinity,
              repeatType: "loop",
              duration: 30,
              ease: "linear"
            }}
          >
            {[...works, ...works].map((work, index) => (
              <motion.div
                key={index}
                className="min-w-[300px] md:min-w-[400px] cursor-pointer"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="aspect-[4/3] overflow-hidden mb-4">
                  <img
                    src={work.image}
                    alt={work.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-medium">{work.title}</h3>
                <span className="text-white/40 text-xs">{work.category}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 md:px-12 lg:px-24 border-t border-white/10">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <span className="text-white/30 text-xs tracking-wider">智慧能源 © 2026</span>
          <div className="flex gap-8">
            <a href="#" className="text-white/30 hover:text-white text-xs tracking-wider transition-colors">隐私</a>
            <a href="#" className="text-white/30 hover:text-white text-xs tracking-wider transition-colors">条款</a>
          </div>
        </div>
      </footer>
      <CursorFollower />
    </motion.div>
  );
}
