import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion, useScroll } from "framer-motion";
import { ArrowUpRight, AlertCircle, Calendar, Sparkles, TrendingUp, Zap } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";

const coreStats = [
  { label: "总能耗", value: "618,420", unit: "kWh", change: "-6.7%" },
  { label: "碳排放", value: "8.5", unit: "吨", change: "-12.0%" },
  { label: "告警数量", value: "3", unit: "条", change: "-2" },
];

const totalEnergyData = Array.from({ length: 50 }, (_, index) => {
  const startDate = new Date(2024, 0, 1);
  const current = new Date(startDate);
  current.setDate(startDate.getDate() + index);
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");

  // 使用平滑波动模拟累计口径下的阶段性变化。
  const baseline = 11800;
  const trend = index * 22;
  const seasonal = Math.sin(index / 4.2) * 260;
  const value = Math.round(baseline + trend + seasonal);

  return {
    date: `${month}-${day}`,
    value,
  };
});

type AlertLevel = "high" | "medium" | "low";

type AlertItem = {
  id: number;
  title: string;
  time: string;
  level: AlertLevel;
  unread: boolean;
};

type AiPredictionItem = {
  id: number;
  title: string;
  date: string;
  severity: AlertLevel;
  description: string;
  unread: boolean;
};

const initialAlerts: AlertItem[] = [
  { id: 1, title: "BLD_000核心区域温度过高", time: "最近一次导入", level: "high", unread: true },
  { id: 2, title: "BLD_002外围区域用电异常", time: "最近一次导入", level: "medium", unread: true },
  { id: 3, title: "BLD_016屋顶区域能耗偏高", time: "最近一次导入", level: "low", unread: false },
];

const initialAiPredictions: AiPredictionItem[] = [
  {
    id: 1,
    title: "BLD_016",
    date: "3天后",
    severity: "high",
    description: "",
    unread: true,
  },
  {
    id: 2,
    title: "BLD_002",
    date: "5天后",
    severity: "medium",
    description: "",
    unread: true,
  },
  {
    id: 3,
    title: "BLD_005",
    date: "7天后",
    severity: "low",
    description: "",
    unread: false,
  },
];

const severityOrder: Record<AlertLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const levelColorClass: Record<AlertLevel, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-gray-400",
};

const levelLabelClass: Record<AlertLevel, string> = {
  high: "text-red-600",
  medium: "text-amber-600",
  low: "text-gray-600",
};

const levelText: Record<AlertLevel, string> = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const selectedDatasetName = "energy_dataset_v3.csv";
  const selectedDateRange = "2024-02-01 ~ 2024-02-10";
  const [alerts, setAlerts] = useState(initialAlerts);
  const [aiPredictions, setAiPredictions] = useState(initialAiPredictions);

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => severityOrder[a.level] - severityOrder[b.level]),
    [alerts],
  );

  const sortedPredictions = useMemo(
    () => [...aiPredictions].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    [aiPredictions],
  );

  const unreadAlertCount = alerts.filter((item) => item.unread).length;
  const unreadPredictionCount = aiPredictions.filter((item) => item.unread).length;

  const markAllAlertsRead = () => {
    setAlerts((prev) => prev.map((item) => ({ ...item, unread: false })));
  };

  const markAllPredictionsRead = () => {
    setAiPredictions((prev) => prev.map((item) => ({ ...item, unread: false })));
  };

  const markAlertRead = (id: number) => {
    setAlerts((prev) => prev.map((item) => (item.id === id ? { ...item, unread: false } : item)));
  };

  const markPredictionRead = (id: number) => {
    setAiPredictions((prev) => prev.map((item) => (item.id === id ? { ...item, unread: false } : item)));
  };

  return (
    <motion.div
      className="min-h-screen bg-white text-gray-900 pt-32 pb-24 px-6 md:px-12 lg:px-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
    >
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          className="mb-12"
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
            数据概览
          </motion.p>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-4xl md:text-5xl font-bold text-gray-900"
            >
              <TextReveal text="数据分析首页" delay={0.6} />
            </motion.h1>
            <button
              onClick={() => navigate("/dashboard/analysis")}
              className="inline-flex items-center gap-2 border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <TrendingUp size={16} />
              查看详细分析
            </button>
          </div>
          <p className="text-gray-600 mt-4 text-sm md:text-base">
            当前结果基于已上传数据集与日期范围生成，首页仅展示核心KPI与关键趋势。
          </p>
          <div className="mt-4 border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 flex flex-col gap-1 md:flex-row md:items-center md:gap-6">
            <span>当前数据集: {selectedDatasetName}</span>
            <span>日期范围: {selectedDateRange}</span>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {coreStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className={`p-8 border ${index === 0 ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 border-gray-200"}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
            >
              <p className={`text-xs tracking-wider uppercase mb-4 ${index === 0 ? "text-gray-400" : "text-gray-500"}`}>{stat.label}</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-bold">{stat.value}</span>
                <span className={`text-sm ${index === 0 ? "text-gray-400" : "text-gray-400"}`}>{stat.unit}</span>
              </div>
              <p className={`text-sm ${index === 0 ? "text-gray-300" : "text-gray-600"}`}>{stat.change}</p>
            </motion.div>
          ))}
        </div>

        <div className="mb-12">
          <motion.div
            className="bg-gray-50 p-8 border border-gray-200"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">总能耗曲线</h3>
              <p className="mt-1 text-xs text-gray-500">统计区间：1月1日 - 2月19日</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={totalEnergyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} interval={4} />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    domain={[10500, 14000]}
                    tickCount={6}
                  />
                  <Tooltip formatter={(value: number) => [`${value} kWh`, "总能耗"]} labelFormatter={(label) => `日期: ${label}`} />
                  <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444", strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: "#ef4444" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <motion.div
            className="bg-gray-50 p-8 border border-gray-200"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">数据质量告警</h3>
                <span className="text-xs px-2 py-1 bg-gray-900 text-white rounded-full">未读 {unreadAlertCount}</span>
              </div>
              <button onClick={markAllAlertsRead} className="text-xs text-gray-600 hover:text-black">
                全部标记已读
              </button>
            </div>

            <div className="space-y-4">
              {sortedAlerts.map((alert, index) => (
                <motion.button
                  key={alert.id}
                  onClick={() => markAlertRead(alert.id)}
                  className="w-full text-left flex items-start justify-between gap-4 p-4 bg-white border border-gray-200 hover:border-gray-400 transition-colors"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">{alert.title}</h4>
                      {alert.unread && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    </div>
                    <p className="text-gray-400 text-sm mt-1">{alert.time}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${levelColorClass[alert.level]}`} />
                    <span className={`text-xs ${levelLabelClass[alert.level]}`}>{levelText[alert.level]}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="bg-gray-50 p-8 border border-gray-200"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Sparkles size={20} className="text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">AI预测异常</h3>
                <span className="text-xs px-2 py-1 bg-gray-900 text-white rounded-full">未读 {unreadPredictionCount}</span>
              </div>
              <button onClick={markAllPredictionsRead} className="text-xs text-gray-600 hover:text-black">
                全部标记已读
              </button>
            </div>

            <div className="space-y-4">
              {sortedPredictions.map((prediction, index) => (
                <motion.button
                  key={prediction.id}
                  onClick={() => markPredictionRead(prediction.id)}
                  className="w-full text-left p-4 bg-white border border-gray-200 hover:border-gray-400 transition-colors"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{prediction.title}</h4>
                        {prediction.unread && <span className="h-2 w-2 rounded-full bg-red-500" />}
                      </div>
                      <p className="text-gray-600 text-sm mt-2">{prediction.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><Calendar size={12} />{prediction.date}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`h-2.5 w-2.5 rounded-full ${levelColorClass[prediction.severity]}`} />
                      <span className={`text-xs ${levelLabelClass[prediction.severity]}`}>{levelText[prediction.severity]}</span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          className="bg-gray-50 p-8 border border-gray-200"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <Zap size={20} className="text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">快捷操作</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "查看详细分析", path: "/dashboard/analysis" },
              { label: "能耗统计", path: "/energy" },
              { label: "设备状态", path: "/devices" },
              { label: "报表管理", path: "/reports" },
            ].map((item, index) => (
              <motion.button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="bg-white p-4 border border-gray-200 flex items-center justify-between group hover:border-gray-400 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
              >
                <span className="font-medium text-gray-900">{item.label}</span>
                <ArrowUpRight size={18} className="text-gray-400 group-hover:text-gray-600" />
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
      <CursorFollower />
    </motion.div>
  );
}
