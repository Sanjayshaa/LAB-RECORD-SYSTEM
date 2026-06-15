


import type React from "react";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ProfileSkeleton } from "@/components/ui/StudentSkeletons";
import { clearSelectedSubjectInStorage } from "@/context/SubjectContext";
import { getStatusConfig } from "@/utils/statusConfig";
import {
  User,
  Mail,
  Shield,
  GraduationCap,
  LogOut,
  Settings,
  Key,
  FlaskConical,
  Clock,
  CheckCircle2,
  Send,
  Lock,
  Sparkles,
  Activity,
  Award,
  Flame,
  Trophy,
} from "lucide-react";
import {
  getUserProgress,
  getUserAchievements,
  mergeProgressWithExperimentActivity,
  type GamificationProgress,
} from "@/services/studentGamificationService";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function StudentProfile() {
  const STUDENT_PROFILE_ERROR =
    "Unable to load your profile right now. Please try again.";
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<
    Array<{ id: string; experiment_no: string; title: string; status: string }>
  >([]);
  const [gamificationProgress, setGamificationProgress] =
    useState<GamificationProgress | null>(null);
  const [achievements, setAchievements] = useState<
    Array<{ id: string; name: string; description: string; xp_reward: number; earned_at: string | null }>
  >([]);
  const evaluatedCount = experiments.filter((exp) => getStatusConfig(exp.status).key === "evaluated").length;
  const submittedCount = experiments.filter((exp) => getStatusConfig(exp.status).key === "submitted").length;
  const pendingCount = experiments.filter((exp) => getStatusConfig(exp.status).key === "pending").length;

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setError(null);
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          navigate("/login");
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role, name")
          .eq("id", data.session.user.id)
          .single();

        if (error || profile?.role !== "student") {
          navigate("/login");
          return;
        }

      if (data.session.user.email) {
        setEmail(data.session.user.email);
      }

      if (profile?.role) {
        setRole(profile.role);
      }
      if (profile?.name) {
        setName(profile.name);
      }

      const { data: submissionRows } = await supabase
        .from("submissions")
        .select("exp_id, status, updated_at")
        .eq("student_id", data.session.user.id)
        .order("updated_at", { ascending: false });

      const latestByExperiment = new Map<string, { status: string }>();
      (submissionRows || []).forEach((row) => {
        const expId = String(row.exp_id || "");
        if (!expId || latestByExperiment.has(expId)) return;
        latestByExperiment.set(expId, { status: String(row.status || "pending") });
      });

      const expIds = Array.from(latestByExperiment.keys());
      let completedLabsMerge = 0;
      if (expIds.length > 0) {
        const { data: expMeta } = await supabase
          .from("experiments")
          .select("id, title, experiment_no, experiment_number")
          .in("id", expIds);

        const mapped = (expMeta || []).map((exp: any) => ({
          id: String(exp.id),
          experiment_no: String(exp.experiment_no || exp.experiment_number || "?"),
          title: String(exp.title || "Untitled"),
          status: latestByExperiment.get(String(exp.id))?.status || "pending",
        }));
        setExperiments(mapped);
        completedLabsMerge = mapped.filter((exp) => {
          const key = getStatusConfig(exp.status).key;
          return key === "evaluated" || key === "submitted";
        }).length;
      } else {
        setExperiments([]);
      }

      const [progress, userAchievements] = await Promise.all([
        getUserProgress(data.session.user.id),
        getUserAchievements(data.session.user.id),
      ]);
      setGamificationProgress(mergeProgressWithExperimentActivity(progress, completedLabsMerge));
      setAchievements(userAchievements);

      setLoading(false);
      } catch (loadError) {
        setError(STUDENT_PROFILE_ERROR);
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  async function logout() {
    await supabase.auth.signOut();
    clearSelectedSubjectInStorage();
    localStorage.removeItem("dept");
    localStorage.removeItem("year");
    localStorage.removeItem("semester");
    navigate("/login");
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="faculty-bg-vibrant student-page-enter min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-[1380px] items-start justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-3xl relative overflow-hidden"
      >
        {/* Decorative gradient orbs */}
        <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-blue-200/60 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-indigo-200/50 blur-3xl pointer-events-none" />

        {error ? (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <Activity className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* PROFILE HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
          className="faculty-glass faculty-gradient-ring relative mb-6 rounded-3xl p-6 md:p-8"
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-5">
            <motion.div
              whileHover={{ scale: 1.08, rotate: [0, -3, 3, 0] }}
              transition={{ duration: 0.3 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 ring-4 ring-blue-200"
            >
              <span className="text-2xl font-bold text-white select-none">
                {getInitials(name || "S")}
              </span>
            </motion.div>
            <div className="text-center sm:text-left">
              <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
                {name || "Student"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">{email}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>
          </div>
        </motion.div>

        {/* PROFILE INFO CARDS */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <InfoCard icon={<User className="w-5 h-5" />} label="Name" value={name || "N/A"} accent="indigo" />
          <InfoCard icon={<Mail className="w-5 h-5" />} label="Email" value={email} accent="blue" />
          <InfoCard icon={<Shield className="w-5 h-5" />} label="Role" value={role.toUpperCase()} accent="indigo" />
          <InfoCard icon={<Key className="w-5 h-5" />} label="Account Status" value="Active" accent="emerald" />
        </div>

        {/* ACADEMIC SUMMARY */}
        <div className="mb-6 grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard icon={<FlaskConical className="w-5 h-5" />} label="Tracked" value={experiments.length} accent="indigo" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Evaluated" value={evaluatedCount} accent="emerald" />
          <StatCard icon={<Send className="w-5 h-5" />} label="Submitted" value={submittedCount} accent="blue" />
          <StatCard icon={<Clock className="w-5 h-5" />} label="Pending" value={pendingCount} accent="amber" />
        </div>

        {/* EXPERIMENT LIVE STATUS */}
        <div className="mb-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <div className="rounded-lg bg-blue-50 p-1.5">
              <FlaskConical className="h-4 w-4 text-blue-600" />
            </div>
            Experiment Live Status
          </h2>

          <div className="grid gap-3">
            {experiments.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
                No experiments started yet
              </div>
            )}

            {experiments.map((exp) => {
              const cfg = getStatusConfig(exp.status);
              const borderColor =
                cfg.key === "evaluated" ? "border-l-emerald-500" :
                cfg.key === "submitted" ? "border-l-blue-500" :
                cfg.key === "resubmit" ? "border-l-indigo-500" :
                cfg.key === "draft" ? "border-l-amber-500" :
                "border-l-slate-500";

              return (
                <motion.div
                  key={exp.id}
                  whileHover={{ y: -1, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className={`faculty-surface flex items-center justify-between rounded-xl border border-slate-200 border-l-[3px] p-4 ${borderColor}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                      cfg.key === "evaluated" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                      cfg.key === "submitted" ? "border-blue-200 bg-blue-50 text-blue-700" :
                      cfg.key === "resubmit" ? "border-slate-300 bg-slate-100 text-slate-700" :
                      cfg.key === "draft" ? "border-slate-200 bg-slate-100 text-slate-700" :
                      "border-amber-200 bg-amber-50 text-amber-700"
                    }`}>
                      {exp.experiment_no}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Experiment {exp.experiment_no}</p>
                      <p className="text-xs text-slate-500">{exp.title}</p>
                    </div>
                  </div>
                  <StatusBadge status={exp.status} />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* GAMIFICATION STATS */}
        {gamificationProgress && (
          <div className="mb-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <div className="rounded-lg bg-amber-50 p-1.5">
                <Trophy className="h-4 w-4 text-amber-600" />
              </div>
              Gamification Stats
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="chart-card flex items-center gap-3 p-4"
              >
                <div className="rounded-lg bg-blue-50 p-2.5">
                  <Award className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Level</p>
                  <p className="text-xl font-bold text-slate-900">{gamificationProgress.level}</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="chart-card flex items-center gap-3 p-4"
              >
                <div className="rounded-lg bg-amber-50 p-2.5">
                  <Sparkles className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">XP Points</p>
                  <p className="text-xl font-bold text-slate-900">{gamificationProgress.xp_points.toLocaleString()}</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="chart-card flex items-center gap-3 p-4"
              >
                <div className="rounded-lg bg-amber-50 p-2.5">
                  <Flame className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Current Streak</p>
                  <p className="text-xl font-bold text-slate-900">{gamificationProgress.current_streak} day{gamificationProgress.current_streak !== 1 ? "s" : ""}</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="chart-card flex items-center gap-3 p-4"
              >
                <div className="rounded-lg bg-emerald-50 p-2.5">
                  <FlaskConical className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Labs Completed</p>
                  <p className="text-xl font-bold text-slate-900">{gamificationProgress.labs_completed}</p>
                </div>
              </motion.div>
            </div>
          </div>
        )}

        {/* ACHIEVEMENTS EARNED */}
        {gamificationProgress && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.2, ease: "easeOut" }}
            className="faculty-surface mb-6 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <div className="rounded-lg bg-indigo-50 p-1.5">
                  <Award className="h-4 w-4 text-indigo-600" />
                </div>
                Achievements Earned
              </h3>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {achievements.length} earned
              </span>
            </div>

            {achievements.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No achievements yet</p>
            ) : (
              <div className="space-y-2.5">
                {achievements.slice(0, 3).map((ach) => (
                  <div
                    key={ach.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
                  >
                    <div className="rounded-lg bg-amber-50 p-1.5">
                      <Trophy className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{ach.name}</p>
                      <p className="text-xs text-slate-500">
                        {ach.earned_at
                          ? new Date(ach.earned_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Recently earned"}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700">+{ach.xp_reward} XP</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ACTIONS */}
        <div className="grid md:grid-cols-3 gap-4">
          <ActionCard
            icon={<Settings className="w-5 h-5" />}
            title="Account Settings"
            desc="Manage preferences"
            disabled
          />
          <ActionCard
            icon={<Key className="w-5 h-5" />}
            title="Change Password"
            desc="Update credentials"
            disabled
          />

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={logout}
            className="student-btn-primary group relative min-h-[44px] overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-700 transition-all hover:bg-amber-100"
          >
            <div className="absolute inset-0 bg-card-shine pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-1">
                <div className="rounded-lg bg-amber-100 p-2">
                  <LogOut className="w-4 h-4" />
                </div>
                <h3 className="font-semibold">Logout</h3>
              </div>
              <p className="text-sm text-amber-600">Sign out from your account</p>
            </div>
          </motion.button>
        </div>
      </motion.div>
      </div>
    </div>
  );
}

/* ================= COMPONENTS ================= */

const ACCENT_STYLES = {
  indigo: {
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-600",
    hover: "hover:border-indigo-200",
    ring: "from-indigo-100/40 to-blue-100/40",
  },
  blue: {
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    hover: "hover:border-blue-200",
    ring: "from-blue-100/40 to-indigo-100/40",
  },
  emerald: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    hover: "hover:border-emerald-200",
    ring: "from-emerald-100/40 to-emerald-200/40",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    hover: "hover:border-amber-200",
    ring: "from-amber-100/40 to-yellow-100/40",
  },
} as const;

type AccentKey = keyof typeof ACCENT_STYLES;

function InfoCard({
  icon,
  label,
  value,
  accent = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: AccentKey;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`faculty-surface rounded-xl border border-slate-200 p-4 shadow-sm ${s.hover} relative flex items-center gap-4 overflow-hidden transition-all group`}
    >
      <div className="absolute inset-0 bg-card-shine pointer-events-none" />
      <div className={`absolute inset-0 bg-gradient-to-br ${s.ring} opacity-0 group-hover:opacity-100 transition-opacity`} />
      <div className={`p-2.5 ${s.iconBg} rounded-lg relative z-10`}>
        <div className={s.iconText}>{icon}</div>
      </div>
      <div className="relative z-10 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-0.5 truncate font-bold text-slate-900">{value}</p>
      </div>
    </motion.div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: AccentKey;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`chart-card rounded-xl border border-slate-200 p-4 text-center shadow-sm ${s.hover} relative overflow-hidden transition-all group`}
    >
      <div className="absolute inset-0 bg-card-shine pointer-events-none" />
      <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center ${s.iconBg} mb-2 relative z-10`}>
        <div className={s.iconText}>{icon}</div>
      </div>
      <p className="relative z-10 text-2xl font-bold text-slate-900">{value}</p>
      <p className="relative z-10 mt-1 text-xs text-slate-500">{label}</p>
    </motion.div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={disabled ? {} : { y: -3, scale: 1.01 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      disabled={disabled}
      className={`min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-left transition-all group relative overflow-hidden ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:border-blue-300 hover:bg-blue-50/50"}`}
    >
      <div className="absolute inset-0 bg-card-shine pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-lg bg-slate-100 p-2">
            <div className="text-slate-600">{icon}</div>
          </div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-700">{title}</h3>
            {disabled && <Lock className="w-3.5 h-3.5 text-slate-500" />}
          </div>
        </div>
        <p className="text-sm text-slate-500">{desc}</p>
        {disabled && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
            <Sparkles className="w-3 h-3" />
            Coming soon
          </span>
        )}
      </div>
    </motion.button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toLowerCase();
  const map: Record<string, string> = {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    resubmit: "border-slate-300 bg-slate-100 text-slate-700",
  };
  const display = getStatusConfig(status);
  const badgeClass = map[normalized] || "border-slate-200 bg-slate-100 text-slate-700";
  return (
    <div className={`student-status-badge inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
      <span className="h-2 w-2 rounded-full bg-current opacity-70" />
      {display.label}
    </div>
  );
}
