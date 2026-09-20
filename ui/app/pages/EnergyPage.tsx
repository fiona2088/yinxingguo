import { useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";

const energyData = [
  { month: "1月", power: 45000 },
  { month: "2月", power: 42000 },
  { month: "3月", power: 38000 },
  { month: "4月", power: 35000 },
  { month: "5月", power: 40000 },
  { month: "6月", power: 52000 },
  { month: "7月", power: 58000 },
  { month: "8月", power: 55000 },
  { month: "9月", power: 48000 },
  { month: "10月", power: 42000 },
  { month: "11月", power: 38000 },
  { month: "12月", power: 46000 },
];

const buildingData = [
  { name: "A栋办公楼", value: 35, color: "#3b82f6" },
  { name: "B栋商业", value: 25, color: "#10b981" },
  { name: "C栋酒店", value: 22, color: "#f59e0b" },
  { name: "D栋公寓", value: 18, color: "#ef4444" },
];

const monthlySummary = [
  { month: "1月", power: "45,230", carbon: "35.2", cost: "¥36,184" },
  { month: "2月", power: "42,150", carbon: "32.8", cost: "¥33,720" },
  { month: "3月", power: "38,420", carbon: "29.9", cost: "¥30,736" },
  { month: "4月", power: "35,180", carbon: "27.4", cost: "¥28,144" },
  { month: "5月", power: "40,520", carbon: "31.6", cost: "¥32,416" },
  { month: "6月", power: "52,340", carbon: "40.8", cost: "¥41,872" },
];

export function EnergyPage() {
  const [selectedYear, setSelectedYear] = useState("2026");
  const { scrollYProgress } = useScroll();

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
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between mb-12"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p className="text-gray-400 text-xs tracking-[0.3em] uppercase mb-4">能耗</p>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
              <TextReveal text="能耗统计" delay={0.6} />
            </h1>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex items-center gap-4 mt-6 md:mt-0"
          >
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-gray-100 border-0 px-6 py-3 rounded-none text-sm outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="2026">2026年</option>
              <option value="2025">2025年</option>
            </select>
            <motion.button
              className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 text-sm hover:bg-gray-800 transition-colors"
              whileHover={{ scale: 1.02, boxShadow: "0 5px 15px rgba(0,0,0,0.2)" }}
              whileTap={{ scale: 0.98 }}
            >
              <Download size={16} />
              导出
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Stats - 黑白卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            { label: "年度总能耗", value: "486,520", unit: "kWh", className: "bg-gray-50 p-8 border border-gray-200", textColor: "text-gray-900" },
            { label: "同比变化", value: "-12.5%", unit: "较上年", className: "bg-gray-900 p-8 text-white", textColor: "" },
            { label: "碳排放量", value: "380.2", unit: "吨", className: "bg-gray-50 p-8 border border-gray-200", textColor: "text-gray-900" }
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className={stat.className}
              whileHover={{ scale: 1.02, boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
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
              <p className="text-gray-500 text-xs tracking-wider uppercase mb-4">{stat.label}</p>
              <p className={`text-4xl font-bold ${stat.textColor}`}>{stat.value}</p>
              <p className="text-gray-400 text-sm mt-2">{stat.unit}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Line Chart - 红色 */}
          <motion.div
            className="bg-gray-50 p-8 border border-gray-200"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
          >
            <h3 className="text-lg font-semibold mb-6 text-gray-900">年度能耗趋势</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={energyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #d1d5db',
                      borderRadius: '0px',
                    }}
                    itemStyle={{ color: '#000000' }}
                    labelStyle={{ color: '#000000' }}
                    formatter={(value: any) => [`${value} kWh`, '能耗']}
                    labelFormatter={(label) => `月份: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: '#ef4444' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Pie Chart - 彩色 */}
          <motion.div
            className="bg-gray-50 p-8 border border-gray-200"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2 }}
            whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
          >
            <h3 className="text-lg font-semibold mb-6 text-gray-900">楼宇能耗占比</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={buildingData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    animate={{
                      scale: [0, 1],
                      opacity: [0, 1]
                    }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  >
                    {buildingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #d1d5db',
                      borderRadius: '0px',
                    }}
                    itemStyle={{ color: '#000000' }}
                    labelStyle={{ color: '#000000' }}
                    formatter={(value: any, _name: any, props: any) => {
                      const name = props?.payload?.name || '楼宇';
                      return [`${value}%`, name];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {buildingData.map((item, index) => (
                <motion.div
                  key={index}
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-gray-600">{item.name}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Monthly Table - 黑白文字 */}
        <motion.div
          className="bg-gray-50 p-8 border border-gray-200"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <h3 className="text-lg font-semibold mb-6 text-gray-900">月度汇总</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-4 px-4 text-sm font-medium text-gray-500">月份</th>
                  <th className="text-right py-4 px-4 text-sm font-medium text-gray-500">用电量 (kWh)</th>
                  <th className="text-right py-4 px-4 text-sm font-medium text-gray-500">碳排放 (吨)</th>
                  <th className="text-right py-4 px-4 text-sm font-medium text-gray-500">电费</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((item, index) => (
                  <motion.tr
                    key={index}
                    className="border-b border-gray-200 hover:bg-white transition-colors"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.1 * index }}
                    whileHover={{ backgroundColor: "#ffffff" }}
                  >
                    <td className="py-4 px-4 font-medium text-gray-900">{item.month}</td>
                    <td className="py-4 px-4 text-right text-gray-700">{item.power}</td>
                    <td className="py-4 px-4 text-right text-gray-700">{item.carbon}</td>
                    <td className="py-4 px-4 text-right text-gray-700">{item.cost}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
      <CursorFollower />
    </motion.div>
  );
}
