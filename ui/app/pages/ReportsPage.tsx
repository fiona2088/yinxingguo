import { useState } from "react";
import { Download, FileText, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data?: unknown): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemAccessWindow extends Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}

const reports = [
  { id: "RPT-2026-001", name: "2026年1月能耗报告", type: "月度", energyType: "电力能耗", date: "2026-02-01", size: "2.4 MB" },
  { id: "RPT-2026-002", name: "2026年Q1季度报告", type: "季度", energyType: "全部", date: "2026-04-01", size: "5.8 MB" },
  { id: "RPT-2026-003", name: "A栋空调系统分析", type: "专项", energyType: "空调系统能耗", date: "2026-01-15", size: "1.2 MB" },
  { id: "RPT-2025-004", name: "2025年度碳排放报告", type: "年度", energyType: "全部", date: "2026-01-05", size: "8.6 MB" },
  { id: "RPT-2025-005", name: "2025年12月能耗报告", type: "月度", energyType: "电力能耗", date: "2026-01-01", size: "2.1 MB" },
  { id: "RPT-2025-006", name: "B栋节能改造评估", type: "专项", energyType: "空调系统能耗", date: "2025-12-20", size: "3.5 MB" },
];

const reportTypes = ["全部", "月度", "季度", "年度", "专项"];
const energyTypes = ["全部", "电力能耗", "空调系统能耗"];

async function handleReportDownload(reportName: string) {
  try {
    const fileName = reportName.replace(/[\\/:*?"<>|]/g, "_").trim() + ".pdf";
    const placeholder = new Blob([""], { type: "application/pdf" });
    const win = window as unknown as FileSystemAccessWindow;
    const handle = await win.showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: "PDF 文档",
          accept: { "application/pdf": [".pdf"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(placeholder);
    await writable.close();
  } catch {
    // user cancelled the picker
  }
}

export function ReportsPage() {
  const [selectedType, setSelectedType] = useState("全部");
  const [selectedEnergyType, setSelectedEnergyType] = useState("全部");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isEnergyDropdownOpen, setIsEnergyDropdownOpen] = useState(false);

  const filteredReports = reports.filter(r => {
    const typeMatch = selectedType === "全部" || r.type === selectedType;
    const energyMatch = selectedEnergyType === "全部" || r.energyType === selectedEnergyType || r.energyType === "全部";
    return typeMatch && energyMatch;
  });

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
          className="flex flex-col md:flex-row md:items-end md:justify-between mb-24"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-8">报表</p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-5xl md:text-6xl lg:text-7xl font-bold"
            >
              <TextReveal text="报表管理" delay={0.6} />
            </motion.h1>
          </motion.div>
        </motion.div>

        {/* Filter */}
        <motion.div
          className="flex flex-wrap items-center gap-6 mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center gap-4">
            <span className="text-white/40 text-sm">报表类型</span>
            <div className="relative">
              <motion.button
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                className="flex items-center gap-2 border border-white/20 px-6 py-3 text-sm hover:border-white/40 transition-colors bg-black z-10 relative"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {selectedType}
                <motion.div
                  animate={{ rotate: isTypeDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown size={16} />
                </motion.div>
              </motion.button>
              <AnimatePresence>
                {isTypeDropdownOpen && (
                  <motion.div
                    className="absolute top-full left-0 mt-2 bg-black border border-white/20 min-w-[140px] z-50 shadow-xl"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    {reportTypes.map((type, index) => (
                      <motion.button
                        key={type}
                        onClick={() => {
                          setSelectedType(type);
                          setIsTypeDropdownOpen(false);
                        }}
                        className="w-full px-6 py-3 text-sm text-left hover:bg-white/10 transition-colors"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.05 * index }}
                      >
                        {type}
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-white/40 text-sm">能耗类型</span>
            <div className="relative">
              <motion.button
                onClick={() => setIsEnergyDropdownOpen(!isEnergyDropdownOpen)}
                className="flex items-center gap-2 border border-white/20 px-6 py-3 text-sm hover:border-white/40 transition-colors bg-black z-10 relative"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {selectedEnergyType}
                <motion.div
                  animate={{ rotate: isEnergyDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown size={16} />
                </motion.div>
              </motion.button>
              <AnimatePresence>
                {isEnergyDropdownOpen && (
                  <motion.div
                    className="absolute top-full left-0 mt-2 bg-black border border-white/20 min-w-[160px] z-50 shadow-xl"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    {energyTypes.map((type, index) => (
                      <motion.button
                        key={type}
                        onClick={() => {
                          setSelectedEnergyType(type);
                          setIsEnergyDropdownOpen(false);
                        }}
                        className="w-full px-6 py-3 text-sm text-left hover:bg-white/10 transition-colors"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.05 * index }}
                      >
                        {type}
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Report List */}
        <div className="space-y-px bg-white/10">
          {filteredReports.map((report, index) => (
            <motion.div
              key={index}
              className="bg-black p-8 flex items-center justify-between group border-b border-white/5 last:border-0"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: 0.05 * index }}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.03)", x: 10 }}
            >
              <div className="flex items-center gap-8">
                <div
                  className="w-12 h-12 border border-white/10 flex items-center justify-center group-hover:border-white/30 transition-colors duration-300"
                >
                  <FileText size={20} className="text-white/40 group-hover:text-white/80 transition-colors duration-300" />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-1 text-white/80 group-hover:text-white transition-colors duration-300">{report.name}</h3>
                  <p className="text-white/30 text-xs font-mono group-hover:text-white/50 transition-colors duration-300">{report.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-12">
                <div className="text-right min-w-[80px]">
                  <p className="text-white/20 text-xs mb-1 group-hover:text-white/40 transition-colors duration-300">类型</p>
                  <p className="text-sm text-white/60 group-hover:text-white/90 transition-colors duration-300">{report.type}</p>
                </div>
                <div className="text-right min-w-[100px]">
                  <p className="text-white/20 text-xs mb-1 group-hover:text-white/40 transition-colors duration-300">能耗类型</p>
                  <p className="text-sm text-blue-400 group-hover:text-blue-300 transition-colors duration-300">{report.energyType}</p>
                </div>
                <div className="text-right min-w-[100px]">
                  <p className="text-white/20 text-xs mb-1 group-hover:text-white/40 transition-colors duration-300">日期</p>
                  <p className="text-sm text-white/60 group-hover:text-white/90 transition-colors duration-300">{report.date}</p>
                </div>
                <div className="text-right min-w-[80px]">
                  <p className="text-white/20 text-xs mb-1 group-hover:text-white/40 transition-colors duration-300">大小</p>
                  <p className="text-sm text-white/60 group-hover:text-white/90 transition-colors duration-300">{report.size}</p>
                </div>
                <motion.button
                  type="button"
                  aria-label={`下载 ${report.name}`}
                  className="w-12 h-12 border border-white/10 flex items-center justify-center group-hover:border-white/30 hover:bg-white hover:text-black transition-all duration-300"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReportDownload(report.name);
                  }}
                >
                  <Download size={18} />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <CursorFollower />
    </motion.div>
  );
}
