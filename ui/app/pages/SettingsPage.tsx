import { useState } from "react";
import { motion } from "framer-motion";
import { Settings, Bell, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { CursorFollower } from "../components/CursorFollower";
import { TextReveal } from "../components/TextReveal";

export function SettingsPage() {
    const [alarmPush, setAlarmPush] = useState(true);
    const [weeklyDigest, setWeeklyDigest] = useState(false);
    const [strictMode, setStrictMode] = useState(true);

    return (
        <motion.div
            className="min-h-screen bg-white text-gray-900 pt-32 pb-24 px-6 md:px-12 lg:px-24"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
        >
            <div className="max-w-[1000px] mx-auto">
                <div className="mb-12">
                    <p className="text-gray-400 text-xs tracking-[0.3em] uppercase mb-4">管理</p>
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
                        <TextReveal text="系统设置" delay={0.2} />
                    </h1>
                </div>

                <div className="space-y-6">
                    <div className="p-6 border border-gray-200 bg-white">
                        <div className="flex items-center gap-2 mb-4">
                            <Bell size={18} className="text-gray-700" />
                            <h3 className="font-semibold text-gray-900">通知策略</h3>
                        </div>
                        <div className="space-y-3 text-sm">
                            <label className="flex items-center justify-between">
                                <span>实时告警推送</span>
                                <input type="checkbox" checked={alarmPush} onChange={() => setAlarmPush((v) => !v)} />
                            </label>
                            <label className="flex items-center justify-between">
                                <span>每周能耗简报</span>
                                <input type="checkbox" checked={weeklyDigest} onChange={() => setWeeklyDigest((v) => !v)} />
                            </label>
                        </div>
                    </div>

                    <div className="p-6 border border-gray-200 bg-white">
                        <div className="flex items-center gap-2 mb-4">
                            <ShieldCheck size={18} className="text-gray-700" />
                            <h3 className="font-semibold text-gray-900">安全与权限</h3>
                        </div>
                        <label className="flex items-center justify-between text-sm">
                            <span>启用严格操作确认</span>
                            <input type="checkbox" checked={strictMode} onChange={() => setStrictMode((v) => !v)} />
                        </label>
                    </div>

                    <div className="p-6 border border-gray-200 bg-gray-50 flex items-center gap-2 text-sm text-gray-600">
                        <SlidersHorizontal size={16} />
                        当前为基础设置页，可继续扩展用户、角色、审计日志与API密钥管理。
                    </div>
                </div>
            </div>
            <CursorFollower />
        </motion.div>
    );
}
