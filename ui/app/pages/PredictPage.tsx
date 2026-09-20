import { useState, useMemo } from "react";
import { motion, useScroll } from "framer-motion";
import { Sparkles, TrendingUp, AlertTriangle, Calendar, Clock, BarChart3, Zap, AlertCircle, ChevronDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";
import { AnimatePresence } from "framer-motion";

// 建筑类型中文映射
const BUILDING_TYPE_LABELS: Record<string, string> = {
  Office_Small: "小型办公",
  Office_Medium: "中型办公",
  Residential: "住宅",
  School: "学校",
  Hospital: "医院",
  Hotel: "酒店",
  Shopping_Mall: "商业综合体",
  Factory: "工厂",
};

// 建筑列表
const BUILDINGS = [
  { id: "BLD_000", type: "Office_Small" },
  { id: "BLD_001", type: "Office_Medium" },
  { id: "BLD_002", type: "Residential" },
  { id: "BLD_003", type: "Hospital" },
  { id: "BLD_004", type: "School" },
  { id: "BLD_005", type: "Hotel" },
  { id: "BLD_006", type: "Shopping_Mall" },
  { id: "BLD_007", type: "Factory" },
  { id: "BLD_008", type: "Office_Small" },
  { id: "BLD_009", type: "Office_Medium" },
  { id: "BLD_010", type: "Residential" },
  { id: "BLD_011", type: "Hospital" },
  { id: "BLD_012", type: "School" },
  { id: "BLD_013", type: "Hotel" },
  { id: "BLD_014", type: "Shopping_Mall" },
  { id: "BLD_015", type: "Factory" },
  { id: "BLD_016", type: "Office_Small" },
  { id: "BLD_017", type: "Office_Medium" },
  { id: "BLD_018", type: "Residential" },
  { id: "BLD_019", type: "Hospital" },
];

// 每个建筑的统计数据（基于 multi_zone_building_data.csv 计算的均值/趋势）
const BUILDING_STATS: Record<string, {
  core: number; peri: number; roof: number; total: number;
  avgEfficiency: number; carbon: number;
  changeCore: number; changePeri: number; changeRoof: number;
}> = {
  BLD_000: { core: 98.7, peri: 87.3, roof: 82.7, total: 268.7, avgEfficiency: 0.85, carbon: 198.4, changeCore: -5.2, changePeri: -8.1, changeRoof: -3.7 },
  BLD_001: { core: 83.1, peri: 77.7, roof: 73.9, total: 234.8, avgEfficiency: 0.88, carbon: 168.2, changeCore: -3.8, changePeri: -6.5, changeRoof: -2.9 },
  BLD_002: { core: 99.3, peri: 92.6, roof: 88.3, total: 280.2, avgEfficiency: 0.82, carbon: 215.6, changeCore: -7.1, changePeri: -9.4, changeRoof: -5.3 },
  BLD_003: { core: 84.4, peri: 71.1, roof: 67.4, total: 222.9, avgEfficiency: 0.91, carbon: 155.3, changeCore: -2.3, changePeri: -4.2, changeRoof: -1.8 },
  BLD_004: { core: 90.7, peri: 82.0, roof: 78.8, total: 251.4, avgEfficiency: 0.86, carbon: 182.7, changeCore: -4.6, changePeri: -7.3, changeRoof: -3.1 },
  BLD_005: { core: 93.6, peri: 86.1, roof: 78.7, total: 258.4, avgEfficiency: 0.84, carbon: 195.8, changeCore: -6.3, changePeri: -8.8, changeRoof: -4.5 },
  BLD_006: { core: 71.5, peri: 68.6, roof: 59.8, total: 199.9, avgEfficiency: 0.93, carbon: 132.4, changeCore: -1.9, changePeri: -3.5, changeRoof: -1.2 },
  BLD_007: { core: 57.7, peri: 64.5, roof: 56.9, total: 179.1, avgEfficiency: 0.96, carbon: 108.2, changeCore: -0.8, changePeri: -2.1, changeRoof: -0.6 },
  BLD_008: { core: 94.9, peri: 89.9, roof: 83.3, total: 268.1, avgEfficiency: 0.85, carbon: 197.3, changeCore: -5.5, changePeri: -8.4, changeRoof: -3.9 },
  BLD_009: { core: 84.3, peri: 81.9, roof: 74.3, total: 240.6, avgEfficiency: 0.87, carbon: 172.6, changeCore: -4.1, changePeri: -6.8, changeRoof: -3.0 },
  BLD_010: { core: 100.0, peri: 94.2, roof: 88.7, total: 282.9, avgEfficiency: 0.81, carbon: 218.4, changeCore: -7.5, changePeri: -9.8, changeRoof: -5.6 },
  BLD_011: { core: 87.1, peri: 76.2, roof: 68.1, total: 231.3, avgEfficiency: 0.90, carbon: 162.8, changeCore: -2.8, changePeri: -4.7, changeRoof: -2.0 },
  BLD_012: { core: 90.1, peri: 84.4, roof: 80.7, total: 255.3, avgEfficiency: 0.85, carbon: 186.5, changeCore: -4.8, changePeri: -7.6, changeRoof: -3.3 },
  BLD_013: { core: 84.3, peri: 82.9, roof: 78.1, total: 245.2, avgEfficiency: 0.87, carbon: 178.2, changeCore: -4.2, changePeri: -7.0, changeRoof: -3.2 },
  BLD_014: { core: 83.1, peri: 75.2, roof: 65.9, total: 224.2, avgEfficiency: 0.90, carbon: 158.7, changeCore: -2.5, changePeri: -4.4, changeRoof: -1.7 },
  BLD_015: { core: 69.4, peri: 71.7, roof: 60.8, total: 201.8, avgEfficiency: 0.94, carbon: 125.3, changeCore: -1.5, changePeri: -2.9, changeRoof: -0.9 },
  BLD_016: { core: 96.1, peri: 89.6, roof: 83.8, total: 269.5, avgEfficiency: 0.84, carbon: 198.9, changeCore: -5.7, changePeri: -8.6, changeRoof: -4.1 },
  BLD_017: { core: 92.7, peri: 82.1, roof: 78.0, total: 252.9, avgEfficiency: 0.86, carbon: 183.6, changeCore: -4.5, changePeri: -7.2, changeRoof: -3.0 },
  BLD_018: { core: 98.5, peri: 93.8, roof: 88.4, total: 280.7, avgEfficiency: 0.81, carbon: 217.2, changeCore: -7.3, changePeri: -9.6, changeRoof: -5.4 },
  BLD_019: { core: 83.4, peri: 74.4, roof: 71.4, total: 229.2, avgEfficiency: 0.90, carbon: 160.5, changeCore: -2.6, changePeri: -4.5, changeRoof: -1.9 },
};

// 历史数据（模拟12个月）
function generateHistoricalData(buildingId: string) {
  const stats = BUILDING_STATS[buildingId];
  if (!stats) return [];
  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const baseEff = stats.avgEfficiency;
  const baseEnergy = stats.total;
  return months.map((date, i) => ({
    date,
    efficiency: Math.min(1, baseEff + (i * 0.005) + (Math.random() * 0.02 - 0.01)),
    energy: Math.round(baseEnergy * (1.2 - i * 0.015) + (Math.random() * 20 - 10)),
  }));
}

// 预测数据（未来6个月）
function generatePredictionData(buildingId: string) {
  const stats = BUILDING_STATS[buildingId];
  if (!stats) return [];
  const months = ["1月(预测)", "2月(预测)", "3月(预测)", "4月(预测)", "5月(预测)", "6月(预测)"];
  const baseEff = stats.avgEfficiency + 0.06;
  const baseEnergy = stats.total * 0.85;
  return months.map((date, i) => ({
    date: date.replace("(预测)", ""),
    efficiency: Math.min(1, baseEff + (i * 0.003) + (Math.random() * 0.015 - 0.007)),
    energy: Math.round(baseEnergy * (1 - i * 0.02) + (Math.random() * 15 - 7)),
    confidence: Math.max(0.6, 0.95 - i * 0.05),
  }));
}

// AI 异常预测
const AI_ANOMALIES: Record<string, { id: number; title: string; date: string; severity: "high" | "medium" | "low"; description: string }[]> = {
  BLD_000: [{ id: 1, title: "BLD_016", date: "3天后", severity: "high", description: "" }],
  BLD_001: [{ id: 1, title: "BLD_002", date: "5天后", severity: "medium", description: "" }],
  BLD_002: [{ id: 1, title: "BLD_005", date: "7天后", severity: "low", description: "" }],
};  

export function PredictPage() {
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const [selectedBuilding, setSelectedBuilding] = useState("BLD_000");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { scrollYProgress } = useScroll();

  const currentStats = BUILDING_STATS[selectedBuilding];
  const buildingTypeLabel = BUILDING_TYPE_LABELS[BUILDINGS.find(b => b.id === selectedBuilding)?.type || ""] || "";

  const historicalData = useMemo(() => generateHistoricalData(selectedBuilding), [selectedBuilding]);
  const predictionData = useMemo(() => generatePredictionData(selectedBuilding), [selectedBuilding]);

  // 六个卡片数据
  const areaMetrics = useMemo(() => [
    { label: `预测 ${selectedBuilding} 核心区域能耗`, value: currentStats?.core.toFixed(0) || "0", unit: "kWh", change: `${currentStats?.changeCore.toFixed(1) || 0}%` },
    { label: `预测 ${selectedBuilding} 外围区域能耗`, value: currentStats?.peri.toFixed(0) || "0", unit: "kWh", change: `${currentStats?.changePeri.toFixed(1) || 0}%` },
    { label: `预测 ${selectedBuilding} 屋顶区域能耗`, value: currentStats?.roof.toFixed(0) || "0", unit: "kWh", change: `${currentStats?.changeRoof.toFixed(1) || 0}%` },
    { label: `预测 ${selectedBuilding} 平均能效`, value: currentStats?.avgEfficiency.toFixed(2) || "0", unit: "", change: "+8.2%" },
    { label: `预测 ${selectedBuilding} 总能耗`, value: (currentStats?.total || 0).toFixed(0), unit: "kWh", change: "-15.3%" },
    { label: `预测 ${selectedBuilding} 碳排放`, value: (currentStats?.carbon || 0).toFixed(1), unit: "kgCO2e", change: "-18.5%" },
  ], [selectedBuilding, currentStats]);

  const chartData = useMemo(() => [...historicalData, ...predictionData], [historicalData, predictionData]);

  return (
    <motion.div
      className="min-h-screen bg-white text-gray-900 pt-32 pb-24 px-6 md:px-12 lg:px-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
    >
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <motion.div
          className="mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-gray-400 text-xs tracking-[0.3em] uppercase mb-4"
          >
            AI 预测
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-4xl md:text-5xl font-bold text-gray-900"
          >
            <TextReveal text="能效预测" delay={0.6} />
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-gray-600 mt-4 text-lg"
          >
            基于历史数据的 AI 智能预测，提前发现能效异常
          </motion.p>
        </motion.div>

        {/* 建筑选择器 + 六个卡片 */}
        <div className="mb-8">
          {/* 建筑选择下拉菜单 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">选择建筑：</span>
              <div className="relative">
                <motion.button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 border border-gray-300 px-4 py-2.5 text-sm hover:border-gray-400 transition-colors bg-white z-10 relative min-w-[240px] justify-between"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <span className="font-medium text-gray-900">{selectedBuilding}（{buildingTypeLabel}）</span>
                  <motion.div
                    animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronDown size={16} className="text-gray-400" />
                  </motion.div>
                </motion.button>
                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div
                      className="absolute top-full left-0 mt-1 bg-white border border-gray-200 min-w-[280px] max-h-[320px] overflow-y-auto z-50 shadow-lg rounded-lg"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                    >
                      {BUILDINGS.map((building) => (
                        <motion.button
                          key={building.id}
                          onClick={() => {
                            setSelectedBuilding(building.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors flex items-center justify-between ${
                            selectedBuilding === building.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                          }`}
                        >
                          <span>{building.id}</span>
                          <span className="text-gray-400 text-xs">{BUILDING_TYPE_LABELS[building.type]}</span>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* 六个指标卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {areaMetrics.map((stat, index) => (
              <motion.div
                key={`${selectedBuilding}-${index}`}
                className="p-6 bg-gray-50 border border-gray-200"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                whileHover={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
              >
                <p className="text-xs tracking-wider uppercase mb-3 text-gray-500 leading-snug">{stat.label}</p>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl font-bold text-gray-900">{stat.value}</span>
                  <span className="text-sm text-gray-400">{stat.unit}</span>
                </div>
                <p className={`text-sm ${stat.change.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>
                  {stat.change}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Prediction Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* 能效预测 */}
          <motion.div
            className="bg-gray-50 p-8 border border-gray-200"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
          >
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp size={20} className="text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">能效预测趋势</h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorEfficiency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                  <YAxis domain={[0.7, 1]} stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="efficiency"
                    stroke="#ef4444"
                    fillOpacity={1}
                    fill="url(#colorEfficiency)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <Sparkles size={16} className="text-red-500" />
              <span>AI 预测未来6个月能效将持续提升</span>
            </div>
          </motion.div>

          {/* 能耗预测 */}
          <motion.div
            className="bg-gray-900 p-8 text-white"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2 }}
            whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}
          >
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 size={20} className="text-white" />
              <h3 className="text-lg font-semibold">能耗预测趋势</h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '4px',
                      color: '#fff'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="energy"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: '#ef4444' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-300">
              <Sparkles size={16} className="text-red-500" />
              <span>AI 预测未来6个月能耗将持续下降</span>
            </div>
          </motion.div>
        </div>

        {/* AI 预测异常 */}
        <motion.div
          className="bg-gray-50 p-8 border border-gray-200 mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle size={20} className="text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">AI 预测异常</h3>
          </div>
          <div className="space-y-4">
            {Object.entries(AI_ANOMALIES).flatMap(([buildingId, buildingAnomalies]) =>
              buildingAnomalies.map((anomaly) => (
                <motion.div
                  key={`${buildingId}-${anomaly.id}`}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  whileHover={{ scale: 1.01, boxShadow: "0 5px 15px rgba(0,0,0,0.1)" }}
                >
                  <div>
                    <h4 className="font-medium text-gray-900">{anomaly.title}</h4>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <div className="flex items-center gap-1 text-gray-400">
                        <Calendar size={14} />
                        <span>{anomaly.date}</span>
                      </div>
                      <div className={`flex items-center gap-1 ${
                        anomaly.severity === 'high' ? 'text-red-600' :
                        anomaly.severity === 'medium' ? 'text-amber-600' : 'text-gray-600'
                      }`}>
                        <AlertCircle size={14} />
                        <span>{anomaly.severity === 'high' ? '高' : anomaly.severity === 'medium' ? '中' : '低'}风险</span>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm mt-2">{anomaly.description}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    anomaly.severity === 'high' ? 'bg-red-600' :
                    anomaly.severity === 'medium' ? 'bg-amber-600' : 'bg-gray-400'
                  }`} />
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* AI 预测分析 */}
        <motion.div
          className="bg-gray-50 p-8 border border-gray-200"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={20} className="text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">AI 预测分析</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div
              className="bg-white p-6 border border-gray-200"
              whileHover={{ scale: 1.02, boxShadow: "0 5px 15px rgba(0,0,0,0.1)" }}
            >
              <h4 className="font-medium text-gray-900 mb-3">预测方法</h4>
              <p className="text-gray-600 text-sm">基于 LSTM 神经网络模型，分析过去12个月的历史数据，预测未来6个月的能效趋势</p>
            </motion.div>
            <motion.div
              className="bg-white p-6 border border-gray-200"
              whileHover={{ scale: 1.02, boxShadow: "0 5px 15px rgba(0,0,0,0.1)" }}
            >
              <h4 className="font-medium text-gray-900 mb-3">优化建议</h4>
              <p className="text-gray-600 text-sm">AI 建议对 {selectedBuilding} 空调系统进行维护，预计可提升能效 15%，每年节省能耗成本约 12万元</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
      <CursorFollower />
    </motion.div>
  );
}
