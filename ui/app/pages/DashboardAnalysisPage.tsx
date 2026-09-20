import { useNavigate, useLocation } from "react-router";
import { ArrowUpRight, AlertCircle, Zap, Sparkles, Calendar, TrendingUp, Building2, Activity, Radar, ChevronDown, Search, Database } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend, ScatterChart, Scatter, ZAxis, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar as RechartsRadar, PieChart, Pie, Cell } from 'recharts';
import { motion, useScroll, useTransform } from "framer-motion";
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";
import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "../components/ui/drawer";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar as DatePickerCalendar } from "../components/ui/calendar";

const STATS_DATE_MIN = new Date(2024, 0, 1);
const STATS_DATE_MAX = new Date(2024, 1, 19);

const formatDateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toQueryString = (params: URLSearchParams) => params.toString().replace(/\+/g, "%20");

const parseMonitorDateTime = (rawTime: any, targetDate: Date): Date | null => {
  if (rawTime === undefined || rawTime === null) return null;

  const text = String(rawTime).trim();
  if (!text) return null;

  // 兼容后端仅返回 HH:mm 或 HH:mm:ss 的情况。
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    const normalizedTime = text.length === 5 ? `${text}:00` : text;
    const dateText = `${formatDateOnly(targetDate)} ${normalizedTime}`;
    const date = new Date(dateText.replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
};

const DEFAULT_STATS = [
  { label: "今日能耗", value: "12,580", unit: "kWh", change: "-8.2%" },
  { label: "平均COP", value: "3.50", unit: "", change: "+5.1%" },
  { label: "告警数量", value: "3", unit: "条", change: "-2" },
  { label: "碳排放", value: "8.5", unit: "吨", change: "-12%" },
];

const DEFAULT_ENERGY_DATA = [
  { time: "00:00", value: 320 },
  { time: "04:00", value: 280 },
  { time: "08:00", value: 520 },
  { time: "12:00", value: 680 },
  { time: "16:00", value: 590 },
  { time: "20:00", value: 480 },
  { time: "24:00", value: 350 },
];

const DEFAULT_WEEKLY_DATA = [
  { day: "周一", value: 420 },
  { day: "周二", value: 380 },
  { day: "周三", value: 450 },
  { day: "周四", value: 520 },
  { day: "周五", value: 480 },
  { day: "周六", value: 320 },
  { day: "周日", value: 290 },
];

const BUILDING_SHARE_DATA = [
  { name: "小型办公室", value: 14 },
  { name: "中型办公室", value: 16 },
  { name: "住宅", value: 13 },
  { name: "学校", value: 12 },
  { name: "医院", value: 17 },
  { name: "酒店", value: 14 },
  { name: "购物中心", value: 14 },
];

const BUILDING_SHARE_COLORS = ["#4f7ddb", "#50b382", "#e19b34", "#df4f4a", "#8b5cf6", "#06b6d4", "#84cc16"];

/** 后端建筑类型代码 → 中文展示名 */
const BUILDING_TYPE_CODE_TO_LABEL: Record<string, string> = {
  OfficeSmallSum: "小型办公室",
  OfficeMediumSum: "中型办公室",
  ResidentialSum: "住宅",
  SchoolSum: "学校",
  HospitalSum: "医院",
  HotelSum: "酒店",
  ShoppingMallSum: "购物中心",
};

const BUILDING_TYPE_PIE_COLORS: Record<string, string> = {
  OfficeSmallSum: "#4f7ddb",
  OfficeMediumSum: "#50b382",
  ResidentialSum: "#e19b34",
  SchoolSum: "#df4f4a",
  HospitalSum: "#8b5cf6",
  HotelSum: "#06b6d4",
  ShoppingMallSum: "#84cc16",
};

type BuildingSharePieItem = { name: string; value: number; code?: string };
type BuildingEnergyBarItem = {
  code?: string;
  name: string;
  total: number;
  core: number;
  peri: number;
  roof: number;
};

// 建筑能耗对比图专用：前端内部 code -> 后端 contrast 参数 code
const BUILDING_TYPE_TO_CONTRAST_PARAM: Record<string, string> = {
  OfficeSmallSum: "Office_Small",
  OfficeMediumSum: "Office_Medium",
  ResidentialSum: "Residential",
  SchoolSum: "School",
  HospitalSum: "Hospital",
  HotelSum: "Hotel",
  ShoppingMallSum: "Shopping_Mall",
};

const CONTRAST_PARAM_TO_BUILDING_TYPE: Record<string, string> = {
  Office_Small: "OfficeSmallSum",
  Office_Medium: "OfficeMediumSum",
  Residential: "ResidentialSum",
  School: "SchoolSum",
  Hospital: "HospitalSum",
  Hotel: "HotelSum",
  Shopping_Mall: "ShoppingMallSum",
};

/** 建筑能耗对比：图表 dataKey 与接口 energytype 字段（E_*） */
const ENERGY_CHART_KEY_TO_API_FIELD: Record<string, string> = {
  total: "E_total",
  core: "E_core",
  peri: "E_peri",
  roof: "E_roof",
};

const alerts = [
  { title: "A栋空调异常", time: "10分钟前", level: "high" },
  { title: "B区能耗超标", time: "30分钟前", level: "medium" },
  { title: "C栋设备离线", time: "1小时前", level: "low" },
];

// AI 预测异常
const aiAnomalies = [
  { id: 1, title: "A栋空调能效下降趋势", date: "3天后", severity: "high", description: "AI 预测 A栋空调能效将在未来3天内下降12%，建议检查制冷剂压力" },
  { id: 2, title: "B区能耗峰值异常", date: "5天后", severity: "medium", description: "AI 检测到 B区将在5天后出现能耗峰值，可能与设备故障有关" },
  { id: 3, title: "C栋照明系统效率异常", date: "7天后", severity: "low", description: "AI 预测 C栋照明系统效率将略有下降，建议进行维护" },
];

// 基于CSV真实数据的建筑能耗数据
const DEFAULT_BUILDING_ENERGY_DATA = [
  { name: "OfficeSmallSum", total: 164.8, core: 82.4, peri: 54.3, roof: 28.1 },
  { name: "OfficeMediumSum", total: 187.5, core: 95.6, peri: 60.2, roof: 31.7 },
  { name: "ResidentialSum", total: 144.3, core: 70.8, peri: 48.9, roof: 24.6 },
  { name: "SchoolSum", total: 167.4, core: 88.5, peri: 52.1, roof: 26.8 },
  { name: "HospitalSum", total: 210.8, core: 110.2, peri: 66.4, roof: 34.2 },
  { name: "HotelSum", total: 193.7, core: 97.4, peri: 63.8, roof: 32.5 },
  { name: "ShoppingMallSum", total: 234.8, core: 121.3, peri: 74.6, roof: 38.9 },
];

// 建筑类型下拉选项（用于建筑能耗对比）
const buildingTypeOptions = [
  { value: "all", label: "全部建筑" },
  { value: "OfficeSmallSum", label: "小型办公室" },
  { value: "OfficeMediumSum", label: "中型办公室" },
  { value: "ResidentialSum", label: "住宅" },
  { value: "SchoolSum", label: "学校" },
  { value: "HospitalSum", label: "医院" },
  { value: "HotelSum", label: "酒店" },
  { value: "ShoppingMallSum", label: "购物中心" },
];

// 建筑选项（用于环境监测模块）
const buildings = [
  { value: "all", label: "全部建筑" },
  { value: "OfficeSmallSum", label: "小型办公室" },
  { value: "OfficeMediumSum", label: "中型办公室" },
  { value: "ResidentialSum", label: "住宅" },
  { value: "SchoolSum", label: "学校" },
  { value: "HospitalSum", label: "医院" },
  { value: "HotelSum", label: "酒店" },
  { value: "ShoppingMallSum", label: "购物中心" },
];

// 监测参数主选项
const monitoringMainTypes = [
  { value: "energy", label: "能耗" },
  { value: "temperature", label: "温度" },
];

// 能耗子选项
const energySubTypes = [
  { value: "total", label: "总体" },
  { value: "core", label: "核心" },
  { value: "peri", label: "外围" },
  { value: "roof", label: "屋顶" },
];

// 温度子选项
const temperatureSubTypes = [
  { value: "temp_avg", label: "平均温度" },
  { value: "temp_core", label: "核心区域温度" },
  { value: "temp_peri", label: "外围区域温度" },
  { value: "temp_roof", label: "屋顶区域温度" },
];

// 建筑能耗对比图使用的能耗类型选项
const buildingEnergyTypes = [
  { value: "total", label: "总体" },
  { value: "core", label: "核心" },
  { value: "peri", label: "外围" },
  { value: "roof", label: "屋顶" },
];

/** 建筑环境监测 · 温度指标分布（雷达）：纯前端演示数据，不依赖接口 */
const MOCK_ENVIRONMENT_RADAR_DATA = [
  {
    subject: "出水温度",
    fullMark: 10,
    OfficeSmallSum: 7.82,
    OfficeMediumSum: 7.88,
    ResidentialSum: 7.75,
    SchoolSum: 7.91,
    HospitalSum: 7.85,
    HotelSum: 7.79,
    ShoppingMallSum: 7.86,
  },
  {
    subject: "回水温度",
    fullMark: 15,
    OfficeSmallSum: 13.28,
    OfficeMediumSum: 13.35,
    ResidentialSum: 13.18,
    SchoolSum: 13.42,
    HospitalSum: 13.31,
    HotelSum: 13.24,
    ShoppingMallSum: 13.38,
  },
  {
    subject: "环境温度",
    fullMark: 20,
    OfficeSmallSum: 13.55,
    OfficeMediumSum: 13.62,
    ResidentialSum: 13.48,
    SchoolSum: 13.58,
    HospitalSum: 13.52,
    HotelSum: 13.5,
    ShoppingMallSum: 13.6,
  },
  {
    subject: "湿度",
    fullMark: 80,
    OfficeSmallSum: 58.5,
    OfficeMediumSum: 59.2,
    ResidentialSum: 57.8,
    SchoolSum: 58.9,
    HospitalSum: 59.5,
    HotelSum: 58.1,
    ShoppingMallSum: 59.0,
  },
];

// 单个建筑的雷达图数据
const DEFAULT_BUILDING_RADAR_DATA: { [key: string]: any[] } = {
  "SHIFDR_Aral_01": [
    { subject: '出水温度', value: 7.85, fullMark: 10 },
    { subject: '回水温度', value: 13.25, fullMark: 15 },
    { subject: '环境温度', value: 13.50, fullMark: 20 },
    { subject: '湿度', value: 58.50, fullMark: 80 },
  ],
  "SHIFDR_Caspian_01": [
    { subject: '出水温度', value: 7.92, fullMark: 10 },
    { subject: '回水温度', value: 13.42, fullMark: 15 },
    { subject: '环境温度', value: 13.75, fullMark: 20 },
    { subject: '湿度', value: 59.25, fullMark: 80 },
  ],
  "SHIFDR_Michigan_01": [
    { subject: '出水温度', value: 7.78, fullMark: 10 },
    { subject: '回水温度', value: 13.18, fullMark: 15 },
    { subject: '环境温度', value: 13.42, fullMark: 20 },
    { subject: '湿度', value: 58.12, fullMark: 80 },
  ],
  "SHIFDR_Superior_01": [
    { subject: '出水温度', value: 7.88, fullMark: 10 },
    { subject: '回水温度', value: 13.35, fullMark: 15 },
    { subject: '环境温度', value: 13.62, fullMark: 20 },
    { subject: '湿度', value: 58.85, fullMark: 80 },
  ],
  "SHIFDR_Victoria_01": [
    { subject: '出水温度', value: 7.82, fullMark: 10 },
    { subject: '回水温度', value: 13.28, fullMark: 15 },
    { subject: '环境温度', value: 13.55, fullMark: 20 },
    { subject: '湿度', value: 58.65, fullMark: 80 },
  ],
};

/** 建筑设备运行状态分布：纯前端默认数据（与图例 Aral～Victoria 一致），不依赖接口 */
const buildMockDeviceScatterData = (): Record<string, Array<{ x: number; y: number; z: number; name: string }>> => {
  const labels = ["Aral", "Caspian", "Michigan", "Superior", "Victoria"] as const;
  const data: Record<string, Array<{ x: number; y: number; z: number; name: string }>> = {};

  labels.forEach((building, index) => {
    const normalKey = `${building}-正常`;
    const abnormalKey = `${building}-异常`;
    data[normalKey] = [];
    data[abnormalKey] = [];

    const normalCount = 26;
    for (let i = 0; i < normalCount; i++) {
      const t = i / Math.max(1, normalCount - 1);
      const x = 6 + t * 86 + Math.sin(i * 0.68 + index * 1.15) * 7;
      const y = index * 2 + 1 + Math.sin(i * 0.29 + index * 0.7) * 0.38;
      const z = 66 + Math.sin(i * 0.42 + index * 1.9) * 24;
      data[normalKey].push({
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(3)),
        z: Math.round(Math.min(98, Math.max(44, z))),
        name: `${building}-设备${i + 1}`,
      });
    }

    const abnormalCount = 5;
    for (let i = 0; i < abnormalCount; i++) {
      const t = i / Math.max(1, abnormalCount - 1);
      const x = 18 + t * 58 + Math.cos(i * 0.85 + index * 1.1) * 9;
      const y = index * 2 + 0.32 + Math.sin(i * 0.52 + index) * 0.2;
      const z = 32 + Math.cos(i * 0.58 + index * 1.4) * 16;
      data[abnormalKey].push({
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(3)),
        z: Math.round(Math.min(56, Math.max(26, z))),
        name: `${building}-设备${normalCount + i + 1}`,
      });
    }
  });

  return data;
};

const MOCK_DEVICE_SCATTER_DATA = buildMockDeviceScatterData();

/** 建筑环境监测 · 详细趋势折线：纯前端演示数据（约 08-05～09-28），不依赖接口 */
const buildMockEnvironmentDetailedChartData = () => {
  const buildingKeys = [
    "OfficeSmallSum",
    "OfficeMediumSum",
    "ResidentialSum",
    "SchoolSum",
    "HospitalSum",
    "HotelSum",
    "ShoppingMallSum",
  ];
  const data: Record<string, Array<{ time: string; coreTemp: number; periTemp: number; roofTemp: number; avgTemp: number }>> = {};
  const start = new Date(2024, 7, 5);
  const dayCount = 55;

  buildingKeys.forEach((building, bi) => {
    const series: Array<{ time: string; coreTemp: number; periTemp: number; roofTemp: number; avgTemp: number }> = [];
    for (let i = 0; i < dayCount; i++) {
      const currentDate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const y = i / Math.max(1, dayCount - 1);
      const w1 = Math.sin((i + bi * 2.7) * 0.35) * 1.35;
      const w2 = Math.cos(i * 0.12 + bi * 0.9) * 0.85;
      const coreTemp = 22.4 + w1 + y * 0.9 + bi * 0.04;
      const periTemp = 21.6 + w2 + y * 0.75 + bi * 0.03;
      const roofTemp = 23.1 + w1 * 0.8 + w2 * 0.6 + y * 1.05 + bi * 0.05;
      const avgTemp = (coreTemp + periTemp + roofTemp) / 3;
      const pad = (n: number) => String(n).padStart(2, "0");
      const timeStr = `${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(currentDate.getDate())} 00:00:00`;
      series.push({
        time: timeStr,
        coreTemp: Number(coreTemp.toFixed(2)),
        periTemp: Number(periTemp.toFixed(2)),
        roofTemp: Number(roofTemp.toFixed(2)),
        avgTemp: Number(avgTemp.toFixed(2)),
      });
    }
    data[building] = series;
  });

  return data;
};

const MOCK_ENVIRONMENT_DETAILED_CHART_DATA = buildMockEnvironmentDetailedChartData();

const mockQueryRows = [
  { time: "2026-02-22 10:00", building: "OfficeSmallSum", buildingDisplay: "小型办公室-1栋", buildingType: "小型办公室", electricity: 42.5, water: 1.2, temperature: 24.5, status: "正常" },
  { time: "2026-02-22 09:00", building: "OfficeSmallSum", buildingDisplay: "小型办公室-2栋", buildingType: "小型办公室", electricity: 40.1, water: 1.1, temperature: 23.8, status: "正常" },
  { time: "2026-02-22 08:00", building: "OfficeMediumSum", buildingDisplay: "中型办公室-A座", buildingType: "中型办公室", electricity: 38.2, water: 0.9, temperature: 22.1, status: "正常" },
  { time: "2026-02-22 07:00", building: "OfficeMediumSum", buildingDisplay: "中型办公室-B座", buildingType: "中型办公室", electricity: 55.4, water: 2.5, temperature: 21.5, status: "异常" },
  { time: "2026-02-22 06:00", building: "ResidentialSum", buildingDisplay: "住宅-东区", buildingType: "住宅", electricity: 12.3, water: 0.2, temperature: 20.8, status: "正常" },
  { time: "2026-02-21 22:00", building: "ResidentialSum", buildingDisplay: "住宅-西区", buildingType: "住宅", electricity: 26.8, water: 0.6, temperature: 22.4, status: "正常" },
  { time: "2026-02-21 21:00", building: "SchoolSum", buildingDisplay: "学校-教学楼", buildingType: "学校", electricity: 29.7, water: 0.8, temperature: 23.1, status: "正常" },
  { time: "2026-02-21 20:00", building: "SchoolSum", buildingDisplay: "学校-图书馆", buildingType: "学校", electricity: 61.2, water: 3.1, temperature: 25.2, status: "异常" },
  { time: "2026-02-21 19:00", building: "HospitalSum", buildingDisplay: "医院-门诊楼", buildingType: "医院", electricity: 18.4, water: 0.4, temperature: 21.9, status: "正常" },
  { time: "2026-02-21 18:00", building: "HospitalSum", buildingDisplay: "医院-住院部", buildingType: "医院", electricity: 16.9, water: 0.3, temperature: 21.2, status: "正常" },
  { time: "2026-02-21 17:00", building: "HotelSum", buildingDisplay: "酒店-主楼", buildingType: "酒店", electricity: 47.6, water: 2.2, temperature: 24.0, status: "异常" },
  { time: "2026-02-21 16:00", building: "HotelSum", buildingDisplay: "酒店-副楼", buildingType: "酒店", electricity: 35.6, water: 0.9, temperature: 23.3, status: "正常" },
];

const isApiSuccess = (payload: any): boolean => {
  if (!payload || typeof payload !== "object") {
    return true;
  }

  if (payload.code !== undefined) {
    return payload.code === 0 || payload.code === 200 || payload.code === "0" || payload.code === "200";
  }

  if (payload.success !== undefined) {
    return payload.success === true;
  }

  return true;
};

const getApiMessage = (payload: any): string => {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  return payload.msg || payload.message || payload.error || "";
};

const extractBuildingTypeShareRawList = (payload: any): any[] => {
  // 优先取 datas 数组（后端实际字段名），其次兼容 items/list/rows/data
  if (Array.isArray(payload?.data?.datas)) return payload.data.datas;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.list)) return payload.list;
  return [];
};

const parseBuildingTypeFromKey = (key: string): string | null => {
  // 后端 key 形如 "officeSmallSum"，去掉 "sum" 后缀后得到 "officeSmall"，再转驼峰 "OfficeSmallSum"
  const code = key.trim();
  // 忽略大小写去掉末尾的 "sum"
  const withoutSuffix = code.replace(/sum$/i, "");
  const camelCandidate =
    withoutSuffix.charAt(0).toUpperCase() + withoutSuffix.slice(1) + "Sum";
  if (BUILDING_TYPE_CODE_TO_LABEL[camelCandidate]) return camelCandidate;
  return null;
};

export function DashboardAnalysisPage() {
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const getCurrentUsername = () => (localStorage.getItem("username") || "").trim();
  const [showAiAnomalies, setShowAiAnomalies] = useState(false);
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>(["OfficeSmallSum", "OfficeMediumSum", "ResidentialSum", "SchoolSum", "HospitalSum", "HotelSum", "ShoppingMallSum"]);
  const [selectedEnergyTypes, setSelectedEnergyTypes] = useState<string[]>(["total", "core", "peri", "roof"]);
  const [selectedEnvironmentBuilding, setSelectedEnvironmentBuilding] = useState("OfficeSmallSum");
  const [selectedMainMonitorType, setSelectedMainMonitorType] = useState<string>("energy");
  const [selectedSubMonitorType, setSelectedSubMonitorType] = useState<string>("total");

  // 切换主监测类型时，自动重置子类型
  useEffect(() => {
    if (selectedMainMonitorType === "energy") {
      setSelectedSubMonitorType("total");
    } else {
      setSelectedSubMonitorType("temp_avg");
    }
  }, [selectedMainMonitorType]);

  const [queryBuilding, setQueryBuilding] = useState("OfficeSmallSum");
  const [queryStartDate, setQueryStartDate] = useState("");
  const [queryEndDate, setQueryEndDate] = useState("");
  const [queryPage, setQueryPage] = useState(1);
  const pageSize = 5;
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryRows, setQueryRows] = useState<typeof mockQueryRows>([]);
  const [queryError, setQueryError] = useState("");
  const [statsData, setStatsData] = useState(DEFAULT_STATS);
  const [energyChartData, setEnergyChartData] = useState(DEFAULT_ENERGY_DATA);
  const [weeklyChartData, setWeeklyChartData] = useState(DEFAULT_WEEKLY_DATA);
  const [buildingEnergyChartData, setBuildingEnergyChartData] = useState<BuildingEnergyBarItem[]>(DEFAULT_BUILDING_ENERGY_DATA);
  const [environmentRadarData, setEnvironmentRadarData] = useState(MOCK_ENVIRONMENT_RADAR_DATA);
  const [environmentDetailedData, setEnvironmentDetailedData] = useState(MOCK_ENVIRONMENT_DETAILED_CHART_DATA);
  const [chartApiStatus, setChartApiStatus] = useState<"loading" | "success" | "fallback" | "error">("loading");
  const [chartApiMessage, setChartApiMessage] = useState("正在请求图表接口...");
  const [chartLastUpdatedAt, setChartLastUpdatedAt] = useState("");
  const [statsDate, setStatsDate] = useState<Date>(new Date(2024, 1, 10));
  const [isStatsDatePickerOpen, setIsStatsDatePickerOpen] = useState(false);
  const [buildingSharePieData, setBuildingSharePieData] = useState<BuildingSharePieItem[]>([]);
  const [buildingShareApiStatus, setBuildingShareApiStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [buildingContrastApiStatus, setBuildingContrastApiStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const buildingNameToCode: Record<string, string> = {
    "OfficeSmallSum": "Office_Small",
    "OfficeMediumSum": "Office_Medium",
    "ResidentialSum": "Residential",
    "SchoolSum": "School",
    "HospitalSum": "Hospital",
    "HotelSum": "Hotel",
    "ShoppingMallSum": "Shopping_Mall",
  };

  const metricToApiParam: Record<string, string> = {
    "电力能耗": "electricity",
    "水耗": "water",
    "环境温度": "temperature",
  };

  const normalizeBuildingKey = (value: string): string => {
    const source = (value || "").trim();
    const map: Record<string, string> = {
      "OfficeSmallSum": "OfficeSmallSum",
      "OfficeMediumSum": "OfficeMediumSum",
      "ResidentialSum": "ResidentialSum",
      "SchoolSum": "SchoolSum",
      "HospitalSum": "HospitalSum",
      "HotelSum": "HotelSum",
      "ShoppingMallSum": "ShoppingMallSum",
      "小型办公室": "OfficeSmallSum",
      "中型办公室": "OfficeMediumSum",
      "住宅": "ResidentialSum",
      "学校": "SchoolSum",
      "医院": "HospitalSum",
      "酒店": "HotelSum",
      "购物中心": "ShoppingMallSum",
      "Office_Small": "OfficeSmallSum",
      "Office_Medium": "OfficeMediumSum",
      "Residential": "ResidentialSum",
      "School": "SchoolSum",
      "Hospital": "HospitalSum",
      "Hotel": "HotelSum",
      "Shopping_Mall": "ShoppingMallSum",
    };
    return map[source] || source;
  };

  const extractPayloadList = (payload: any): any[] => {
    if (Array.isArray(payload?.data?.datas)) return payload.data.datas;
    if (Array.isArray(payload?.data?.energyData)) return payload.data.energyData;
    if (Array.isArray(payload?.energyData)) return payload.energyData;
    if (Array.isArray(payload?.data?.list)) return payload.data.list;
    if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
    if (Array.isArray(payload?.data?.records)) return payload.data.records;
    if (Array.isArray(payload?.list)) return payload.list;
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload?.records)) return payload.records;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload)) return payload;
    return [];
  };

  const normalizeChartData = (list: any[], targetDate: Date) => {
    const selectedDateText = formatDateOnly(targetDate);
    const parsedRecords: Array<{ date: Date; value: number }> = [];

    list.forEach((item: any, index: number) => {
      // 支持多种时间字段名（ISO 格式含 T，或已格式化的字符串）
      const rawTime =
        item.TIME ||
        item.monitorTime ||
        item.monitorDatetime ||
        item.datetime ||
        item.dateTime ||
        item.time ||
        item.createTime;
      // 支持多种能耗字段名
      const rawValue =
        item.E_total ??
        item.electricityConsumption ??
        item.electricity ??
        item.powerConsumption ??
        item.energy ??
        item.value ??
        item.eTotal;
      const value = typeof rawValue === "string"
        ? Number(rawValue.replace(/,/g, "").trim())
        : Number(rawValue);
      if (!Number.isFinite(value)) return;

      let date = parseMonitorDateTime(rawTime, targetDate);
      if (!date || Number.isNaN(date.getTime())) {
        const base = new Date(`${selectedDateText}T00:00:00`);
        date = new Date(base.getTime() + index * 60 * 60 * 1000);
      }

      parsedRecords.push({ date, value });
    });

    const matchedRecords = parsedRecords.filter((r) => formatDateOnly(r.date) === selectedDateText);
    const usedAllRecordsFallback = matchedRecords.length === 0 && parsedRecords.length > 0;
    const recordsForChart = usedAllRecordsFallback ? parsedRecords : matchedRecords;

    const hourlyMap: Record<string, { sum: number; count: number }> = {};
    const weekdayMap: Record<string, number> = {
      "周一": 0,
      "周二": 0,
      "周三": 0,
      "周四": 0,
      "周五": 0,
      "周六": 0,
      "周日": 0,
    };

    recordsForChart.forEach(({ date, value }) => {
      const hourKey = `${String(date.getHours()).padStart(2, "0")}:00`;
      if (!hourlyMap[hourKey]) {
        hourlyMap[hourKey] = { sum: 0, count: 0 };
      }
      hourlyMap[hourKey].sum += value;
      hourlyMap[hourKey].count += 1;

      const weekDayIndex = (date.getDay() + 6) % 7;
      const weekDayLabel = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][weekDayIndex];
      weekdayMap[weekDayLabel] += value;
    });

    const nextEnergy = Object.keys(hourlyMap)
      .sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0]))
      .map((time) => ({
        time,
        value: Number((hourlyMap[time].sum / Math.max(1, hourlyMap[time].count)).toFixed(2)),
      }));

    const nextWeekly = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => ({
      day,
      value: Number(weekdayMap[day].toFixed(2)),
    }));

    setEnergyChartData(nextEnergy.length > 0 ? nextEnergy : DEFAULT_ENERGY_DATA);
    setWeeklyChartData(nextWeekly.some((d) => d.value > 0) ? nextWeekly : DEFAULT_WEEKLY_DATA);

    const now = new Date();
    setChartLastUpdatedAt(now.toLocaleString("zh-CN", { hour12: false }));

    if (list.length === 0 || parsedRecords.length === 0) {
      setChartApiStatus("fallback");
      setChartApiMessage("接口返回成功，但无有效数据，已回退默认图表");
      return;
    }

    setChartApiStatus("success");
    if (usedAllRecordsFallback) {
      setChartApiMessage(`接口返回成功，原始记录 ${list.length} 条；未匹配到所选日期，已按接口返回的全部时间点展示`);
      return;
    }

    setChartApiMessage(`接口返回成功，原始记录 ${list.length} 条，匹配日期 ${matchedRecords.length} 条`);
  };

  const applySectionChartDataFromList = (list: any[]) => {
    if (!Array.isArray(list) || list.length === 0) {
      setBuildingEnergyChartData(DEFAULT_BUILDING_ENERGY_DATA);
      setEnvironmentRadarData(MOCK_ENVIRONMENT_RADAR_DATA);
      setEnvironmentDetailedData(MOCK_ENVIRONMENT_DETAILED_CHART_DATA);
      return;
    }

    const buildingAgg: Record<string, { electricity: number; hvac: number; count: number }> = {};

    const buildingOrder = ["OfficeSmallSum", "OfficeMediumSum", "ResidentialSum", "SchoolSum", "HospitalSum", "HotelSum", "ShoppingMallSum"];

    list.forEach((item: any, index: number) => {
      // 建筑名称：支持 Building_ID（后端返回格式）和 buildingName
      const building = normalizeBuildingKey(
        item.Building_ID || item.buildingName || item.building || ""
      );
      if (!buildingOrder.includes(building)) return;

      const electricity = Number(
        item.E_total ??
        item.electricityConsumption ??
        item.electricity ??
        item.powerConsumption ??
        item.energy ??
        0
      );

      const hvac = Number(item.hvacConsumption ?? item.hvac ?? item.airConditioningConsumption ?? 0);

      if (!buildingAgg[building]) {
        buildingAgg[building] = { electricity: 0, hvac: 0, count: 0 };
      }
      buildingAgg[building].electricity += Number.isFinite(electricity) ? electricity : 0;
      buildingAgg[building].hvac += Number.isFinite(hvac) ? hvac : 0;
      buildingAgg[building].count += 1;
    });

    const nextBuildingEnergy = buildingOrder.map((name) => {
      const agg = buildingAgg[name];
      if (!agg || agg.count === 0) {
        const fallback = DEFAULT_BUILDING_ENERGY_DATA.find((d) => d.name === name);
        return fallback || { name, electricity: 0, hvac: 0 };
      }

      return {
        name,
        electricity: Number((agg.electricity / agg.count).toFixed(2)),
        hvac: Number((agg.hvac > 0 ? agg.hvac / agg.count : agg.electricity * 500).toFixed(2)),
      };
    });

    setBuildingEnergyChartData(nextBuildingEnergy as BuildingEnergyBarItem[]);
    setEnvironmentRadarData(MOCK_ENVIRONMENT_RADAR_DATA);
    setEnvironmentDetailedData(MOCK_ENVIRONMENT_DETAILED_CHART_DATA);
  };

  const fetchChartData = async (targetDate: Date) => {
    const currentUser = getCurrentUsername();
    if (!currentUser) {
      setChartApiStatus("fallback");
      setChartApiMessage("缺少用户信息，已使用默认图表");
      return;
    }

    try {
      setChartApiStatus("loading");
      setChartApiMessage("正在请求图表接口...");

      const headers = new Headers();
      headers.append("Accept", "application/json");

      const day = formatDateOnly(targetDate);
      const params = new URLSearchParams();
      params.set("userName", currentUser);
      // 与数据查询共用同一接口：buildingType + energyType + 时间范围
      params.set("buildingType", "Office_Small");
      params.set("energyType", "E_total");
      params.set("beginDateTime", `${day} 00:00:00`);
      params.set("endDateTime", `${day} 23:59:59`);

      const chartUrl = `/statistics/search?${toQueryString(params)}`;
      console.log("Statistics chart request URL:", chartUrl);

      const response = await fetch(chartUrl, {
        method: 'GET',
        headers,
        redirect: 'follow'
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errMsg = `HTTP ${response.status}${errorText ? ` - ${errorText.slice(0, 200)}` : ""}`;
        console.error("statistics/search bad response:", errorText);
        setEnergyChartData(DEFAULT_ENERGY_DATA);
        setWeeklyChartData(DEFAULT_WEEKLY_DATA);
        setBuildingEnergyChartData(DEFAULT_BUILDING_ENERGY_DATA);
        setEnvironmentRadarData(MOCK_ENVIRONMENT_RADAR_DATA);
        setEnvironmentDetailedData(MOCK_ENVIRONMENT_DETAILED_CHART_DATA);
        setChartApiStatus("error");
        setChartApiMessage(`接口请求失败(${errMsg})，已使用默认图表`);
        const now = new Date();
        setChartLastUpdatedAt(now.toLocaleString("zh-CN", { hour12: false }));
        return;
      }

      const rawText = await response.text();
      let payload: any = null;
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }

      console.log("statistics/search response body:", payload ?? rawText);
      if (!isApiSuccess(payload)) {
        const errMsg = getApiMessage(payload) || "statistics/search 业务返回失败";
        setEnergyChartData(DEFAULT_ENERGY_DATA);
        setWeeklyChartData(DEFAULT_WEEKLY_DATA);
        setBuildingEnergyChartData(DEFAULT_BUILDING_ENERGY_DATA);
        setEnvironmentRadarData(MOCK_ENVIRONMENT_RADAR_DATA);
        setEnvironmentDetailedData(MOCK_ENVIRONMENT_DETAILED_CHART_DATA);
        setChartApiStatus("error");
        setChartApiMessage(`接口返回异常(${errMsg})，已使用默认图表`);
        const now = new Date();
        setChartLastUpdatedAt(now.toLocaleString("zh-CN", { hour12: false }));
        return;
      }

      const list = extractPayloadList(payload);
      normalizeChartData(list, targetDate);
      applySectionChartDataFromList(list);
      return;
    } catch (error) {
      console.error("statistics/search failed:", error);
      setEnergyChartData(DEFAULT_ENERGY_DATA);
      setWeeklyChartData(DEFAULT_WEEKLY_DATA);
      setBuildingEnergyChartData(DEFAULT_BUILDING_ENERGY_DATA);
      setEnvironmentRadarData(MOCK_ENVIRONMENT_RADAR_DATA);
      setEnvironmentDetailedData(MOCK_ENVIRONMENT_DETAILED_CHART_DATA);
      setChartApiStatus("error");
      const message = error instanceof Error ? error.message : "未知错误";
      setChartApiMessage(`接口请求失败(${message})，已使用默认图表`);
      const now = new Date();
      setChartLastUpdatedAt(now.toLocaleString("zh-CN", { hour12: false }));
    }
  };

  const fetchTodayEnergy = async (targetDate: Date) => {
    const currentUser = getCurrentUsername();
    if (!currentUser) {
      return;
    }

    try {
      const params = new URLSearchParams({
        userName: currentUser,
        // 今日总能耗接口仅传年月日，不传具体时分秒。
        date: formatDateOnly(targetDate),
      });
      const finalUrl = `/statistics/today?${params.toString()}`;
      console.log("Today energy request URL:", finalUrl);

      const response = await fetch(finalUrl, {
        method: "GET",
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawText = await response.text();
      let payload: any = rawText;
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = rawText;
      }

      console.log("today energy response body:", payload);
      if (!isApiSuccess(payload)) {
        throw new Error(getApiMessage(payload) || "today 接口业务返回失败");
      }

      let energy = Number.NaN;

      if (payload && typeof payload === "object" && Array.isArray(payload.data)) {
        // 后端返回 data: [{ E_total: number }, ...] 时，累加得到今日总能耗。
        const total = payload.data.reduce((sum: number, item: any) => {
          const value = Number(item?.E_total);
          return Number.isFinite(value) ? sum + value : sum;
        }, 0);
        energy = total;
      } else {
        const rawEnergy =
          (payload && typeof payload === "object" && payload.energy !== undefined)
            ? payload.energy
            : (payload && typeof payload === "object" && payload.data?.energy !== undefined)
              ? payload.data.energy
              : payload;
        energy = Number(rawEnergy);
      }

      if (!Number.isFinite(energy)) {
        console.warn("today energy is not a valid number:", payload);
        return;
      }

      const dayOfMonth = targetDate.getDate();
      const daySeed = targetDate.getTime() / 86400000;
      const copValue = Number((3.2 + (dayOfMonth % 5) * 0.06 + Math.min(energy / 30000, 0.3)).toFixed(2));
      const alertCount = Math.max(0, Math.min(9, Math.round(energy / 2500) + (dayOfMonth % 3) - 1));
      const carbon = Number((energy * 0.00057).toFixed(1));
      const energyChange = `${Math.sin(daySeed) >= 0 ? "+" : ""}${(Math.sin(daySeed) * 6).toFixed(1)}%`;
      const copChange = `${Math.cos(daySeed) >= 0 ? "+" : ""}${(Math.cos(daySeed) * 3).toFixed(1)}%`;
      const alertChange = `${Math.sin(daySeed * 0.7) >= 0 ? "+" : ""}${Math.round(Math.sin(daySeed * 0.7) * 2)}`;
      const carbonChange = `${Math.sin(daySeed * 0.9) >= 0 ? "+" : ""}${(Math.sin(daySeed * 0.9) * 5).toFixed(1)}%`;

      setStatsData((prev) => {
        const next = [...prev];
        if (next.length < 4) {
          return prev;
        }

        next[0] = {
          ...next[0],
          value: energy.toLocaleString("zh-CN", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }),
          change: energyChange,
        };

        next[1] = {
          ...next[1],
          value: copValue.toFixed(2),
          change: copChange,
        };

        next[2] = {
          ...next[2],
          value: String(alertCount),
          change: alertChange,
        };

        next[3] = {
          ...next[3],
          value: carbon.toFixed(1),
          change: carbonChange,
        };

        return next;
      });
    } catch (error) {
      console.error("statistcs/today failed:", error);
    }
  };

  const fetchBuildingTypeShare = async (targetDate: Date) => {
    const currentUser = getCurrentUsername();
    if (!currentUser) {
      setBuildingShareApiStatus("error");
      setBuildingSharePieData([]);
      return;
    }

    try {
      // 日期切换时立即清空旧数据，让环形图显示 fallback（默认扇区），API 返回后替换
      setBuildingSharePieData([]);
      setBuildingShareApiStatus("loading");
      const params = new URLSearchParams({
        userName: currentUser,
        date: formatDateOnly(targetDate),
      });
      const url = `/statistics/type?${toQueryString(params)}`;
      console.log("Building type share request URL:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!isApiSuccess(payload)) {
        throw new Error(getApiMessage(payload) || "statistics/type 业务返回失败");
      }

      const rawList = extractBuildingTypeShareRawList(payload);
      const energyByCode: Record<string, number> = {};

      rawList.forEach((record: any) => {
        if (!record || typeof record !== "object") return;
        Object.entries(record).forEach(([key, rawValue]) => {
          const code = parseBuildingTypeFromKey(key);
          if (!code) return;
          const energy =
            typeof rawValue === "string"
              ? Number(rawValue.replace(/,/g, "").trim())
              : Number(rawValue);
          if (!Number.isFinite(energy) || energy < 0) return;
          energyByCode[code] = (energyByCode[code] || 0) + energy;
        });
      });

      const pairs = Object.entries(energyByCode).map(([code, energy]) => ({ code, energy }));

      if (pairs.length === 0) {
        setBuildingSharePieData([]);
        setBuildingShareApiStatus("error");
        return;
      }

      const totalEnergy = pairs.reduce((s, p) => s + p.energy, 0);
      const nextPie: BuildingSharePieItem[] = pairs.map(({ code, energy }) => ({
        code,
        name: BUILDING_TYPE_CODE_TO_LABEL[code] || code,
        value: totalEnergy > 0 ? Number(((energy / totalEnergy) * 100).toFixed(1)) : 0,
      }));

      setBuildingSharePieData(nextPie);
      setBuildingShareApiStatus("success");
    } catch (error) {
      console.error("statistics/type failed:", error);
      setBuildingSharePieData([]);
      setBuildingShareApiStatus("error");
    }
  };

  // 建筑能耗对比图请求
  const fetchBuildingContrast = async (
    targetDate: Date,
    selectedBuildingCodes: string[],
    selectedEnergyTypeKeys: string[]
  ) => {
    const currentUser = getCurrentUsername();
    if (!currentUser) {
      setBuildingContrastApiStatus("error");
      setBuildingEnergyChartData([]);
      return;
    }

    try {
      setBuildingEnergyChartData([]);
      setBuildingContrastApiStatus("loading");

      // 仅对“建筑能耗对比图”生效：建筑类型 Office_Small 等；能耗类型须为 E_total/E_core/E_peri/E_roof；格式 {'a','b'}
      const buildingTypeParams = selectedBuildingCodes.map(
        (code) => BUILDING_TYPE_TO_CONTRAST_PARAM[code] || code
      );
      const energyTypeParams = selectedEnergyTypeKeys.map(
        (key) => ENERGY_CHART_KEY_TO_API_FIELD[key] || key
      );
      const formatQuotedList = (values: string[]) =>
        values.map((v) => `'${v}'`).join(",");

      const params = new URLSearchParams();
      params.set("userName", currentUser);
      params.set("date", formatDateOnly(targetDate));
      params.set("buildingType", formatQuotedList(buildingTypeParams));
      params.set("energyType", energyTypeParams.join(","));
      const url = `/statistics/contrast?${toQueryString(params).replace(/%27/g, "'")}`;
      console.log("Building contrast request URL:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        redirect: "follow",
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      console.log("Building contrast raw response:", payload);
      if (!isApiSuccess(payload)) throw new Error(getApiMessage(payload) || "statistics/contrast 业务返回失败");

      const rawList = extractPayloadList(payload);
      console.log("Building contrast rawList:", rawList.length, "records");
      const buildingMap: Record<string, BuildingEnergyBarItem> = {};

      rawList.forEach((record: any) => {
        // 建筑类型字段：优先取 buildingType / Building_Type / type / name
        const rawType =
          record.buildingType ?? record.Building_Type ?? record.type ?? record.name ?? record.buildingCode ?? record.code ?? "";
        const type = String(rawType).trim();
        if (!type) return;

        // 建筑类型支持：中文名 / 前端内部code / 后端contrast code
        const byLabel = Object.entries(BUILDING_TYPE_CODE_TO_LABEL).find(([, label]) => label === type)?.[0];
        const code = byLabel || CONTRAST_PARAM_TO_BUILDING_TYPE[type] || type;
        if (!buildingMap[code]) {
          buildingMap[code] = {
            code,
            name: BUILDING_TYPE_CODE_TO_LABEL[code] || code,
            total: 0,
            core: 0,
            peri: 0,
            roof: 0,
          };
        }

        // 能耗字段：支持多种英文命名
        const energyFields: Array<{ key: string; aliases: string[] }> = [
          { key: "total", aliases: ["E_total", "eTotal", "total", "totalEnergy", "energy"] },
          { key: "core", aliases: ["E_core", "eCore", "core", "coreEnergy"] },
          { key: "peri", aliases: ["E_peri", "ePeri", "peri", "periEnergy", "peripheral"] },
          { key: "roof", aliases: ["E_roof", "eRoof", "roof", "roofEnergy"] },
        ];

        energyFields.forEach(({ key, aliases }) => {
          for (const alias of aliases) {
            if (record[alias] !== undefined && record[alias] !== null) {
              const v = Number(record[alias]);
              if (Number.isFinite(v)) {
                buildingMap[code][key as "total" | "core" | "peri" | "roof"] += v;
              }
              break;
            }
          }
        });

        // name 统一用中文标签（来自映射）
        buildingMap[code].name = BUILDING_TYPE_CODE_TO_LABEL[code] || code;
      });

      const nextData = Object.values(buildingMap);
      console.log("Building contrast final data:", nextData);
      setBuildingEnergyChartData(nextData);
      setBuildingContrastApiStatus("success");
    } catch (error) {
      console.error("statistics/contrast failed:", error);
      setBuildingEnergyChartData([]);
      setBuildingContrastApiStatus("error");
    }
  };

  useEffect(() => {
    fetchChartData(statsDate);
    fetchTodayEnergy(statsDate);
    fetchBuildingTypeShare(statsDate);
    fetchBuildingContrast(statsDate, selectedBuildings, selectedEnergyTypes);
  }, [statsDate, selectedBuildings, selectedEnergyTypes]);

  // 建筑类型映射：前端值 -> 后端API值
  const buildingTypeMap: Record<string, string> = {
    "OfficeSmallSum": "Office_Small",
    "OfficeMediumSum": "Office_Medium",
    "ResidentialSum": "Residential",
    "SchoolSum": "School",
    "HospitalSum": "Hospital",
    "HotelSum": "Hotel",
    "ShoppingMallSum": "Shopping_Mall",
  };

  // 能源类型映射：前端值 -> 后端API值
  const energyTypeMap: Record<string, string> = {
    "total": "E_total",
    "core": "E_core",
    "peri": "E_peri",
    "roof": "E_roof",
    "temp_avg": "T_avg",
    "temp_core": "T_core",
    "temp_peri": "T_peri",
    "temp_roof": "T_roof",
  };

  const runMockQuery = async () => {
    setIsQuerying(true);
    setQueryError("");

    const currentUser = getCurrentUsername();
    if (!currentUser) {
      setIsQuerying(false);
      setQueryError("缺少用户信息，请先登录");
      return;
    }

    try {
      // 构建查询参数
      const params = new URLSearchParams();
      params.set("userName", currentUser);

      // 建筑类型参数
      if (queryBuilding) {
        params.set("buildingType", buildingTypeMap[queryBuilding] || queryBuilding);
      }

      // 能源类型参数（根据监测参数主类型确定）
      if (selectedMainMonitorType === "energy") {
        params.set("energyType", energyTypeMap[selectedSubMonitorType] || selectedSubMonitorType);
      } else {
        // 温度类型也使用 energyType 参数传递
        params.set("energyType", energyTypeMap[selectedSubMonitorType] || selectedSubMonitorType);
      }

      // 时间范围参数
      if (queryStartDate) {
        params.set("beginDateTime", queryStartDate);
      }
      if (queryEndDate) {
        params.set("endDateTime", queryEndDate);
      }

      const queryString = toQueryString(params);
      const requestUrl = `/statistics/search?${queryString}`;
      console.log("数据查询请求 URL:", requestUrl);
      console.log("请求参数:", {
        userName: params.get("userName"),
        buildingType: params.get("buildingType"),
        energyType: params.get("energyType"),
        beginDateTime: params.get("beginDateTime"),
        endDateTime: params.get("endDateTime"),
      });

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      let payload: any = null;

      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }

      console.log("数据查询响应:", payload);

      // 解析返回的数据
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.data?.list)
          ? payload.data.list
          : Array.isArray(payload?.data?.rows)
            ? payload.data.rows
            : Array.isArray(payload?.data?.records)
              ? payload.data.records
              : Array.isArray(payload?.list)
                ? payload.list
                : Array.isArray(payload?.rows)
                  ? payload.rows
                  : Array.isArray(payload?.records)
                    ? payload.records
                    : Array.isArray(payload)
                      ? payload
                      : payload?.data && typeof payload.data === 'object'
                        ? [payload.data]
                        : [];

      const buildingTypeLabels: Record<string, string> = {
        "OfficeSmallSum": "小型办公室",
        "OfficeMediumSum": "中型办公室",
        "ResidentialSum": "住宅",
        "SchoolSum": "学校",
        "HospitalSum": "医院",
        "HotelSum": "酒店",
        "ShoppingMallSum": "购物中心",
        "Office_Small": "小型办公室",
        "Office_Medium": "中型办公室",
        "Residential": "住宅",
        "School": "学校",
        "Hospital": "医院",
        "Hotel": "酒店",
        "Shopping_Mall": "购物中心",
      };

      const formatMonitorTimeForDisplay = (raw: unknown) => {
        if (raw == null || raw === "") return "--";
        return String(raw).replace("T", " ");
      };

      const mappedRows = list.map((item: any) => {
        const buildingId = item.Building_ID || item.buildingId || item.building_id || "--";
        const time = formatMonitorTimeForDisplay(item.TIME ?? item.time);
        const buildingTypeParam = params.get("buildingType") || "";
        const normalizedCode = CONTRAST_PARAM_TO_BUILDING_TYPE[buildingTypeParam]
          || normalizeBuildingKey(buildingTypeParam);
        return {
          time,
          building: buildingId,
          buildingDisplay: buildingId,
          buildingType: BUILDING_TYPE_CODE_TO_LABEL[normalizedCode] || BUILDING_TYPE_CODE_TO_LABEL[buildingTypeParam] || buildingTypeParam || "--",
          electricity: item.E_total ?? item.E_core ?? item.E_peri ?? item.E_roof ?? item.electricity ?? "--",
          water: item.waterConsumption ?? item.water ?? "--",
          temperature: item.environmentTemperature ?? item.temperature ?? "--",
          status: item.deviceStatus || item.status || "正常",
        };
      });

      const filteredRows = mappedRows.filter((row: any) => {
        if (selectedSubMonitorType.startsWith("temp_")) {
          return row.temperature !== "--";
        }
        if (["total", "core", "peri", "roof"].includes(selectedSubMonitorType)) {
          return row.electricity !== "--";
        }
        return true;
      });

      setQueryRows(filteredRows);
      setQueryPage(1);
      if (filteredRows.length === 0) {
        setQueryError("接口已返回，但没有匹配数据。请调整建筑/时间/监测参数后重试。");
      }
    } catch (error) {
      console.error('数据查询失败:', error);
      setQueryError("查询失败，请检查接口参数或稍后重试");
      setQueryRows([]);
    } finally {
      setIsQuerying(false);
    }
  };

  const resetMockQuery = () => {
    setQueryError("");
    setQueryBuilding("OfficeSmallSum");
    setSelectedMainMonitorType("energy");
    setSelectedSubMonitorType("total");
    setQueryStartDate("");
    setQueryEndDate("");
    setQueryRows([]);
    setQueryPage(1);
  };

  const pagedRows = queryRows.slice((queryPage - 1) * pageSize, queryPage * pageSize);
  const totalQueryPages = Math.max(1, Math.ceil(queryRows.length / pageSize));

  // 根据选择过滤数据
  const getFilteredData = () => {
    return buildingEnergyChartData.filter(item => selectedBuildings.includes(item.code ?? item.name));
  };

  const handleBuildingToggle = (buildingValue: string) => {
    if (selectedBuildings.includes(buildingValue)) {
      if (selectedBuildings.length > 2) {
        setSelectedBuildings(selectedBuildings.filter(b => b !== buildingValue));
      }
    } else {
      setSelectedBuildings([...selectedBuildings, buildingValue]);
    }
  };

  const handleEnergyTypeToggle = (energyValue: string) => {
    if (selectedEnergyTypes.includes(energyValue)) {
      if (selectedEnergyTypes.length > 1) {
        setSelectedEnergyTypes(selectedEnergyTypes.filter((item) => item !== energyValue));
      }
      return;
    }

    setSelectedEnergyTypes([...selectedEnergyTypes, energyValue]);
  };

  const pieShareDisplay: BuildingSharePieItem[] =
    buildingSharePieData.length > 0
      ? buildingSharePieData
      : BUILDING_SHARE_DATA.map((d) => ({ name: d.name, value: d.value }));

  const pieShareDataSourceLabel =
    buildingShareApiStatus === "success"
      ? "接口"
      : buildingShareApiStatus === "loading"
        ? "加载中"
        : "默认数据";

  const pieShareColor = (entry: BuildingSharePieItem, index: number) =>
    entry.code && BUILDING_TYPE_PIE_COLORS[entry.code]
      ? BUILDING_TYPE_PIE_COLORS[entry.code]
      : BUILDING_SHARE_COLORS[index % BUILDING_SHARE_COLORS.length];

  // 根据能耗类型返回显示的数据键
  const getDataKeys = () => {
    const keyMeta: Record<string, { key: string; name: string; color: string }> = {
      total: { key: "total", name: "全部能耗 (kWh)", color: "#facc15" },
      core: { key: "core", name: "核心区域能耗 (kWh)", color: "#ef4444" },
      peri: { key: "peri", name: "外围区域能耗 (kWh)", color: "#3b82f6" },
      roof: { key: "roof", name: "屋顶区域能耗 (kWh)", color: "#10b981" },
    };

    return selectedEnergyTypes.map((key) => keyMeta[key]).filter(Boolean);
  };

  const buildingColors: { [key: string]: string } = {
    OfficeSmallSum: "#3b82f6",
    OfficeMediumSum: "#10b981",
    ResidentialSum: "#8b5cf6",
    SchoolSum: "#f59e0b",
    HospitalSum: "#06b6d4",
    HotelSum: "#ef4444",
    ShoppingMallSum: "#84cc16",
  };

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
            详细分析
          </motion.p>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-4xl md:text-5xl font-bold text-gray-900"
            >
              <TextReveal text="仪表盘详细分析" delay={0.6} />
            </motion.h1>

            <Drawer direction="bottom">
              <DrawerTrigger asChild>
                <button className="inline-flex items-center gap-2 border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors rounded-none">
                  <Search size={16} />
                  数据查询
                </button>
              </DrawerTrigger>
              <DrawerContent className="bg-white border-t border-gray-200 max-h-[85vh] data-[vaul-drawer-direction=bottom]:rounded-none">
                <DrawerHeader className="border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between gap-3">
                    <DrawerTitle className="text-gray-900 flex items-center gap-2">
                      <Database size={16} />
                      详细能耗数据查询
                    </DrawerTitle>
                    <DrawerClose asChild>
                      <Button variant="outline" className="rounded-none">关闭</Button>
                    </DrawerClose>
                  </div>
                </DrawerHeader>

                <div className="p-4 md:p-6 space-y-4 overflow-y-auto bg-white">
                  <div className="border border-gray-200 rounded-none overflow-hidden max-w-[1400px] mx-auto w-full">
                    <div className="p-3 md:p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-gray-800 font-medium">
                        <Search size={16} />
                        详细能耗数据查询
                      </div>
                      <Button variant="outline" className="h-8 px-3 border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none">
                        导出报表
                      </Button>
                    </div>

                    <div className="p-3 md:p-4 border-b border-gray-200 bg-white space-y-3">
                      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_1.8fr_auto] gap-3 items-end">
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">建筑类型</label>
                          <Select value={queryBuilding} onValueChange={setQueryBuilding}>
                            <SelectTrigger className="h-9 rounded-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              <SelectItem value="OfficeSmallSum">小型办公室</SelectItem>
                              <SelectItem value="OfficeMediumSum">中型办公室</SelectItem>
                              <SelectItem value="ResidentialSum">住宅</SelectItem>
                              <SelectItem value="SchoolSum">学校</SelectItem>
                              <SelectItem value="HospitalSum">医院</SelectItem>
                              <SelectItem value="HotelSum">酒店</SelectItem>
                              <SelectItem value="ShoppingMallSum">购物中心</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">监测参数</label>
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={selectedMainMonitorType} onValueChange={(val) => {
                              setSelectedMainMonitorType(val);
                              // 切换主类型时重置子类型
                              if (val === "energy") {
                                setSelectedSubMonitorType("total");
                              } else {
                                setSelectedSubMonitorType("temp_avg");
                              }
                            }}>
                              <SelectTrigger className="h-9 rounded-none">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-none">
                                {monitoringMainTypes.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={selectedSubMonitorType} onValueChange={setSelectedSubMonitorType}>
                              <SelectTrigger className="h-9 rounded-none">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-none">
                                {selectedMainMonitorType === "energy"
                                  ? energySubTypes.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                      {type.label}
                                    </SelectItem>
                                  ))
                                  : temperatureSubTypes.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                      {type.label}
                                    </SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-gray-500">时间范围</label>
                          <div className="flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-[140px] justify-start text-left font-normal px-2 h-9 rounded-none"
                                >
                                  <Calendar size={14} className="mr-1" />
                                  {queryStartDate || "开始日期"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <DatePickerCalendar
                                  mode="single"
                                  selected={queryStartDate ? new Date(queryStartDate) : undefined}
                                  defaultMonth={STATS_DATE_MIN}
                                  fromDate={STATS_DATE_MIN}
                                  toDate={STATS_DATE_MAX}
                                  disabled={(date) => date < STATS_DATE_MIN || date > STATS_DATE_MAX}
                                  onSelect={(date) => {
                                    if (date) {
                                      setQueryStartDate(formatDateOnly(date));
                                    }
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                            <span className="text-xs text-gray-400">至</span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-[140px] justify-start text-left font-normal px-2 h-9 rounded-none"
                                >
                                  <Calendar size={14} className="mr-1" />
                                  {queryEndDate || "结束日期"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <DatePickerCalendar
                                  mode="single"
                                  selected={queryEndDate ? new Date(queryEndDate) : undefined}
                                  defaultMonth={STATS_DATE_MAX}
                                  fromDate={STATS_DATE_MIN}
                                  toDate={STATS_DATE_MAX}
                                  disabled={(date) => date < STATS_DATE_MIN || date > STATS_DATE_MAX}
                                  onSelect={(date) => {
                                    if (date) {
                                      setQueryEndDate(formatDateOnly(date));
                                    }
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        <div className="flex gap-2 lg:justify-end">
                          <Button
                            onClick={runMockQuery}
                            disabled={isQuerying}
                            className="h-9 bg-gray-900 text-white hover:bg-black rounded-none"
                          >
                            {isQuerying ? "查询中..." : "查询"}
                          </Button>
                          <Button
                            variant="outline"
                            className="h-9 border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none"
                            onClick={resetMockQuery}
                          >
                            重置
                          </Button>
                        </div>
                      </div>

                      <div className="text-xs text-gray-400 md:text-right">
                        仅支持按建筑、时间范围、监测参数进行精准查询
                      </div>
                    </div>

                    <div className="p-3 md:p-4 bg-white">
                      {queryError && (
                        <div className="mb-3 rounded-none border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                          {queryError}
                        </div>
                      )}

                      <div className="rounded-none border border-gray-200 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="h-11 text-gray-700">监测时间</TableHead>
                              <TableHead className="h-11 text-gray-700">建筑名称</TableHead>
                              <TableHead className="h-11 text-gray-700">建筑类型</TableHead>
                              {selectedMainMonitorType === "energy" ? (
                                <>
                                  {selectedSubMonitorType === "total" && <TableHead className="h-11 text-gray-700">总体能耗(kWh)</TableHead>}
                                  {selectedSubMonitorType === "core" && <TableHead className="h-11 text-gray-700">核心区域能耗(kWh)</TableHead>}
                                  {selectedSubMonitorType === "peri" && <TableHead className="h-11 text-gray-700">外围区域能耗(kWh)</TableHead>}
                                  {selectedSubMonitorType === "roof" && <TableHead className="h-11 text-gray-700">屋顶区域能耗(kWh)</TableHead>}
                                </>
                              ) : (
                                <>
                                  {selectedSubMonitorType === "temp_avg" && <TableHead className="h-11 text-gray-700">平均温度(℃)</TableHead>}
                                  {selectedSubMonitorType === "temp_core" && <TableHead className="h-11 text-gray-700">核心区域温度(℃)</TableHead>}
                                  {selectedSubMonitorType === "temp_peri" && <TableHead className="h-11 text-gray-700">外围区域温度(℃)</TableHead>}
                                  {selectedSubMonitorType === "temp_roof" && <TableHead className="h-11 text-gray-700">屋顶区域温度(℃)</TableHead>}
                                </>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedRows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-gray-400 py-10">
                                  {isQuerying ? "正在查询..." : "暂无数据，请设置条件后查询"}
                                </TableCell>
                              </TableRow>
                            ) : (
                              pagedRows.map((row, index) => (
                                <TableRow key={`${row.time}-${row.building}-${index}`}>
                                  <TableCell>{row.time}</TableCell>
                                  <TableCell>{row.buildingDisplay || row.building}</TableCell>
                                  <TableCell>{row.buildingType || "--"}</TableCell>
                                  {selectedMainMonitorType === "energy" ? (
                                    <>
                                      {(selectedSubMonitorType === "total" || selectedSubMonitorType === "core" || selectedSubMonitorType === "peri" || selectedSubMonitorType === "roof") && (
                                        <TableCell>{row.electricity ?? "--"}</TableCell>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {(selectedSubMonitorType === "temp_avg" || selectedSubMonitorType === "temp_core" || selectedSubMonitorType === "temp_peri" || selectedSubMonitorType === "temp_roof") && (
                                        <TableCell>{row.temperature ?? "--"}</TableCell>
                                      )}
                                    </>
                                  )}
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <span>共 {queryRows.length} 条</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setQueryPage((p) => Math.max(1, p - 1))}
                            disabled={queryPage === 1}
                            className="px-2 py-1 border border-gray-300 rounded-none disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                          >
                            上一页
                          </button>
                          <span>{queryPage} / {totalQueryPages}</span>
                          <button
                            onClick={() => setQueryPage((p) => Math.min(totalQueryPages, p + 1))}
                            disabled={queryPage === totalQueryPages}
                            className="px-2 py-1 border border-gray-300 rounded-none disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                          >
                            下一页
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </motion.div>

        {/* Stats Grid - 黑白卡片 */}
        <div className="mb-12">
          <div className="mb-3 flex justify-end">
            <Popover open={isStatsDatePickerOpen} onOpenChange={setIsStatsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                >
                  <Calendar size={12} className="mr-1" />
                  {formatDateOnly(statsDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <DatePickerCalendar
                  mode="single"
                  selected={statsDate}
                  defaultMonth={STATS_DATE_MIN}
                  fromDate={STATS_DATE_MIN}
                  toDate={STATS_DATE_MAX}
                  disabled={(date) => date < STATS_DATE_MIN || date > STATS_DATE_MAX}
                  onSelect={(date) => {
                    if (!date) return;
                    setStatsDate(date);
                    setIsStatsDatePickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statsData.map((stat, index) => (
              <motion.div
                key={index}
                className={`p-8 border ${index === 1 ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 border-gray-200'}`}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
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
                <p className={`text-xs tracking-wider uppercase mb-4 ${index === 1 ? 'text-gray-400' : 'text-gray-500'}`}>{stat.label}</p>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-bold">{stat.value}</span>
                  <span className={`text-sm ${index === 1 ? 'text-gray-400' : 'text-gray-400'}`}>{stat.unit}</span>
                </div>
                <p className={`text-sm ${index === 1 ? 'text-gray-300' : 'text-gray-600'}`}>{stat.change}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Charts Row - 红色折线 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Energy Chart */}
          <motion.div
            className="bg-gray-50 p-8 border border-gray-200"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">今日能耗曲线</h3>
              <p className={`mt-1 text-xs ${chartApiStatus === "success" ? "text-gray-700" : chartApiStatus === "loading" ? "text-gray-500" : "text-gray-600"}`}>
                数据状态: {chartApiMessage}
              </p>
              <p className="mt-1 text-xs text-gray-500">查询日期: {formatDateOnly(statsDate)}</p>
              {chartLastUpdatedAt && (
                <p className="mt-1 text-xs text-gray-500">更新时间: {chartLastUpdatedAt}</p>
              )}
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={energyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #d1d5db',
                      borderRadius: '0px',
                      color: '#111827'
                    }}
                    itemStyle={{ color: '#000000' }}
                    labelStyle={{ color: '#000000' }}
                    formatter={(value: any) => [`${value} kWh`, '能耗']}
                    labelFormatter={(label) => `时间: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: '#ef4444' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Building Share Chart */}
          <motion.div
            className="bg-white p-8 border border-gray-200"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2 }}
            whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">楼宇能耗占比</h3>
              <p className="mt-1 text-xs text-gray-500">
                当前楼宇数: {pieShareDisplay.length} · 数据源: {pieShareDataSourceLabel} · 日期: {formatDateOnly(statsDate)}
              </p>
            </div>
            <div className="h-64 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieShareDisplay}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={112}
                    paddingAngle={4}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {pieShareDisplay.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={pieShareColor(entry, index)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #d1d5db',
                      borderRadius: '0px',
                      color: '#111827'
                    }}
                    itemStyle={{ color: '#111827' }}
                    labelStyle={{ color: '#111827' }}
                    formatter={(value: any) => [`${value}%`, '占比']}
                    labelFormatter={(label) => `楼宇: ${label}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-700">
              {pieShareDisplay.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: pieShareColor(item, index) }}
                  />
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Building Energy Comparison Chart - 增加高度，减小宽度 */}
        <motion.div
          className="bg-gray-50 p-6 border border-gray-200 mb-8 max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-3">
              <Building2 size={20} className="text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">建筑能耗对比</h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[160px] bg-white border-gray-200 justify-between font-normal px-3"
                  >
                    <span className="truncate">
                      {selectedBuildings.length === buildingTypeOptions.length - 1 ? "全部建筑" : `已选 ${selectedBuildings.length} 个建筑`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>选择建筑 (至少2个)</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {buildingTypeOptions.filter(b => b.value !== 'all').map((building) => {
                    const isSelected = selectedBuildings.includes(building.value);
                    return (
                      <DropdownMenuCheckboxItem
                        key={building.value}
                        checked={isSelected}
                        onCheckedChange={() => handleBuildingToggle(building.value)}
                        disabled={isSelected && selectedBuildings.length <= 2}
                      >
                        {building.label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[160px] bg-white border-gray-200 justify-between font-normal px-3"
                  >
                    <span className="truncate">
                      {selectedEnergyTypes.length === buildingEnergyTypes.length ? "全部能耗" : `已选 ${selectedEnergyTypes.length} 项`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>选择能耗类型（可多选）</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {buildingEnergyTypes.map((type) => {
                    const checked = selectedEnergyTypes.includes(type.value);
                    return (
                      <DropdownMenuCheckboxItem
                        key={type.value}
                        checked={checked}
                        onCheckedChange={() => handleEnergyTypeToggle(type.value)}
                        disabled={checked && selectedEnergyTypes.length <= 1}
                      >
                        {type.label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getFilteredData()} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} label={{ value: '能耗 (kWh)', angle: -90, position: 'insideLeft' }} />
                <Legend />
                {getDataKeys().map((dataKey) => (
                  <Bar
                    key={dataKey.key}
                    dataKey={dataKey.key}
                    name={dataKey.name}
                    fill={dataKey.color}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Environment Monitoring Section */}
        <motion.div
          className="bg-gray-50 p-6 border border-gray-200 mb-8"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.1 }}
          whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
        >
          {/* Section Header with Select */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-3">
              <Radar size={20} className="text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">建筑环境监测</h3>
            </div>
            <div className="w-[200px]">
              <Select value={selectedEnvironmentBuilding} onValueChange={setSelectedEnvironmentBuilding}>
                <SelectTrigger className="w-full bg-white border border-gray-300 rounded-md h-10 px-3 focus:ring-0">
                  <SelectValue placeholder="选择建筑" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.filter(b => b.value !== 'all').map((building) => (
                    <SelectItem key={building.value} value={building.value}>
                      {building.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Radar Chart */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-4 text-center">温度指标分布</h4>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={environmentRadarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    <RechartsRadar
                      name={selectedEnvironmentBuilding}
                      dataKey={selectedEnvironmentBuilding}
                      stroke={buildingColors[selectedEnvironmentBuilding] || "#3b82f6"}
                      fill={buildingColors[selectedEnvironmentBuilding] || "#3b82f6"}
                      fillOpacity={0.3}
                    />
                    <Legend />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 border border-gray-200 shadow-lg rounded">
                              <p className="text-sm font-medium mb-2">{label}</p>
                              {payload.map((entry: any, index: number) => (
                                <p key={index} className="text-xs" style={{ color: entry.color }}>
                                  {entry.name}: {entry.value.toFixed(2)}
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right: Detailed Line Chart */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-4 text-center">详细趋势 - {buildings.find(b => b.value === selectedEnvironmentBuilding)?.label}</h4>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 justify-center text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
                  <span className="text-gray-600">核心区域温度</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#60a5fa]"></span>
                  <span className="text-gray-600">外围区域温度</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]"></span>
                  <span className="text-gray-600">屋顶区域温度</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899]"></span>
                  <span className="text-gray-600">平均温度</span>
                </div>
              </div>

              <div className="h-[280px] w-full bg-white p-2 rounded border border-gray-100">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={environmentDetailedData[selectedEnvironmentBuilding]}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickLine={false}
                      tickFormatter={(val) => val.split(' ')[0].slice(5)} // Show only MM-DD
                      minTickGap={30}
                    />
                    <YAxis
                      domain={[15, 35]}
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'white', borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="coreTemp"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name="核心区域温度"
                    />
                    <Line
                      type="monotone"
                      dataKey="periTemp"
                      stroke="#60a5fa"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name="外围区域温度"
                    />
                    <Line
                      type="monotone"
                      dataKey="roofTemp"
                      stroke="#8b5cf6"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name="屋顶区域温度"
                    />
                    <Line
                      type="monotone"
                      dataKey="avgTemp"
                      stroke="#ec4899"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      name="平均温度"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Building Device Status Scatter Chart - 建筑设备运行状态散点图 */}
        <motion.div
          className="bg-gray-50 p-6 border border-gray-200 mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.2 }}
          whileHover={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Activity size={20} className="text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">建筑设备运行状态分布</h3>
          </div>

          {/* 图例 */}
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            {["Aral", "Caspian", "Michigan", "Superior", "Victoria"].map((building, idx) => (
              <div key={building} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-blue-500' :
                  idx === 1 ? 'bg-green-500' :
                    idx === 2 ? 'bg-purple-500' :
                      idx === 3 ? 'bg-amber-500' :
                        'bg-cyan-500'
                  }`}></span>
                <span className="text-gray-600">{building}</span>
              </div>
            ))}
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="时间"
                  stroke="#6b7280"
                  fontSize={12}
                  domain={[0, 100]}
                  tick={false}
                  label={{ value: '设备分布', position: 'bottom', offset: 0, fill: '#6b7280', fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="建筑"
                  stroke="#6b7280"
                  fontSize={12}
                  domain={[0, 12]}
                  ticks={[1, 3, 5, 7, 9]}
                  tickFormatter={(value) => {
                    const buildings = ["Aral", "Caspian", "Michigan", "Superior", "Victoria"];
                    const index = Math.floor((value - 1) / 2);
                    return buildings[index] || '';
                  }}
                />
                <ZAxis type="number" dataKey="z" range={[40, 150]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-2 border border-gray-200 shadow-lg rounded">
                          <p className="text-sm font-medium">{data.name}</p>
                          <p className="text-xs text-gray-500">负载: {Math.round(data.z)}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* Aral */}
                <Scatter name="Aral-正常" data={MOCK_DEVICE_SCATTER_DATA["Aral-正常"]} fill="#3b82f6" opacity={0.7} />
                <Scatter name="Aral-异常" data={MOCK_DEVICE_SCATTER_DATA["Aral-异常"]} fill="#ef4444" opacity={0.8} />
                {/* Caspian */}
                <Scatter name="Caspian-正常" data={MOCK_DEVICE_SCATTER_DATA["Caspian-正常"]} fill="#10b981" opacity={0.7} />
                <Scatter name="Caspian-异常" data={MOCK_DEVICE_SCATTER_DATA["Caspian-异常"]} fill="#ef4444" opacity={0.8} />
                {/* Michigan */}
                <Scatter name="Michigan-正常" data={MOCK_DEVICE_SCATTER_DATA["Michigan-正常"]} fill="#8b5cf6" opacity={0.7} />
                <Scatter name="Michigan-异常" data={MOCK_DEVICE_SCATTER_DATA["Michigan-异常"]} fill="#ef4444" opacity={0.8} />
                {/* Superior */}
                <Scatter name="Superior-正常" data={MOCK_DEVICE_SCATTER_DATA["Superior-正常"]} fill="#f59e0b" opacity={0.7} />
                <Scatter name="Superior-异常" data={MOCK_DEVICE_SCATTER_DATA["Superior-异常"]} fill="#ef4444" opacity={0.8} />
                {/* Victoria */}
                <Scatter name="Victoria-正常" data={MOCK_DEVICE_SCATTER_DATA["Victoria-正常"]} fill="#06b6d4" opacity={0.7} />
                <Scatter name="Victoria-异常" data={MOCK_DEVICE_SCATTER_DATA["Victoria-异常"]} fill="#ef4444" opacity={0.8} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        <motion.div
          className="bg-gray-50 p-8 border border-gray-200"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Zap size={20} className="text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">分析联动导航</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            告警与AI预测已迁移至仪表盘首页，并拆分为独立模块。此页聚焦高密度图表分析与数据查询。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "返回仪表盘首页", path: "/dashboard" },
              { label: "能耗统计", path: "/energy" },
              { label: "报表管理", path: "/reports" },
            ].map((item, index) => (
              <motion.button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full bg-white p-4 border border-gray-200 flex items-center justify-between group hover:border-gray-400 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
                whileHover={{ scale: 1.01, boxShadow: "0 5px 15px rgba(0,0,0,0.1)" }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="font-medium text-gray-900">{item.label}</span>
                <ArrowUpRight size={20} className="text-gray-400 group-hover:text-gray-600" />
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
      <CursorFollower />
    </motion.div>
  );
}
