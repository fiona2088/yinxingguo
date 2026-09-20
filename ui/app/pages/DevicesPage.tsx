import { useState } from "react";
import { Search, Power, AlertTriangle, WifiOff } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";

const devices = [
  { id: "DEV-001", name: "中央空调主机 A", building: "A栋", type: "空调", power: "45kW", status: "running" },
  { id: "DEV-002", name: "新风系统 B1", building: "B栋", type: "通风", power: "12kW", status: "running" },
  { id: "DEV-003", name: "电梯组 C", building: "C栋", type: "电梯", power: "28kW", status: "warning" },
  { id: "DEV-004", name: "照明系统 D", building: "D栋", type: "照明", power: "8kW", status: "offline" },
  { id: "DEV-005", name: "水泵组 A2", building: "A栋", type: "给排水", power: "15kW", status: "running" },
  { id: "DEV-006", name: "冷却塔 B2", building: "B栋", type: "空调", power: "22kW", status: "running" },
];

const stats = [
  { label: "运行中", value: 42, icon: Power },
  { label: "告警", value: 3, icon: AlertTriangle },
  { label: "离线", value: 2, icon: WifiOff },
];

export function DevicesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const { scrollYProgress } = useScroll();

  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         device.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || device.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running": return <Power size={16} className="text-white" />;
      case "warning": return <AlertTriangle size={16} className="text-white/60" />;
      case "offline": return <WifiOff size={16} className="text-white/30" />;
      default: return null;
    }
  };

  return (
    <motion.div 
      className="min-h-screen bg-black text-white pt-32 pb-24 px-6 md:px-12 lg:px-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
    >
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <motion.div 
          className="mb-24"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-8"
          >
            设备
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-5xl md:text-6xl lg:text-7xl font-bold"
          >
            <TextReveal text="设备监控" delay={0.6} />
          </motion.h1>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/10 mb-24">
          {stats.map((stat, index) => (
            <motion.div 
              key={index} 
              className="bg-black p-12 md:p-16 flex items-center justify-between"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.05)" }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = (y - centerY) / 15;
                const rotateY = (centerX - x) / 15;
                
                e.currentTarget.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)";
              }}
            >
              <div>
                <p className="text-white/40 text-xs tracking-wider uppercase mb-4">{stat.label}</p>
                <p className="text-4xl md:text-5xl font-bold">{stat.value}</p>
              </div>
              <stat.icon size={32} className="text-white/20" />
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <motion.div 
          className="flex flex-col md:flex-row gap-6 mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <div className="relative flex-1">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="搜索设备..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border border-white/20 pl-12 pr-4 py-4 text-sm outline-none focus:border-white/40"
            />
          </div>
          <div className="flex gap-2">
            {["all", "running", "warning", "offline"].map((status, index) => (
              <motion.button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-6 py-4 text-sm border transition-colors ${
                  filterStatus === status 
                    ? "border-white bg-white text-black" 
                    : "border-white/20 hover:border-white/40"
                }`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {status === "all" ? "全部" : status === "running" ? "运行" : status === "warning" ? "告警" : "离线"}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Device List */}
        <div className="space-y-px bg-white/10">
          {filteredDevices.map((device, index) => (
            <motion.div 
              key={index} 
              className="bg-black p-8 flex items-center justify-between group hover:bg-white/5 transition-colors cursor-pointer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.05 * index }}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateY = (centerX - x) / 30;
                
                e.currentTarget.style.transform = `perspective(1000px) rotateY(${rotateY}deg)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "perspective(1000px) rotateY(0deg)";
              }}
            >
              <div className="flex items-center gap-8">
                <div className="w-10 h-10 flex items-center justify-center border border-white/20">
                  {getStatusIcon(device.status)}
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-1">{device.name}</h3>
                  <p className="text-white/40 text-sm">{device.id} · {device.building}</p>
                </div>
              </div>
              <div className="flex items-center gap-12">
                <div className="text-right">
                  <p className="text-white/40 text-xs mb-1">功率</p>
                  <p className="text-lg">{device.power}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/40 text-xs mb-1">类型</p>
                  <p className="text-lg">{device.type}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <CursorFollower />
    </motion.div>
  );
}
