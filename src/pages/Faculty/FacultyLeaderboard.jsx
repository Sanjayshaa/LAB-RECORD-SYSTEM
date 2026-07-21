import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Medal,
  Users,
  Search,
  Sparkles,
  Award,
  BookOpen,
  ArrowLeftRight,
  TrendingUp,
  X,
} from "lucide-react";
import ShellCard from "@/components/admin/ShellCard";
import EmptyState from "@/components/admin/EmptyState";
import FadeSwitch from "@/components/admin/FadeSwitch";
import AchievementsPanel from "@/components/gamification/AchievementsPanel";
import { getFacultyStudentsListResultUnified, getFacultySubjectEnrollmentProfiles } from "@/services/facultyDataService";
import { supabase } from "@/lib/supabase";

const MEDAL_COLORS = [
  { bg: "from-amber-50 to-amber-100/40", border: "border-amber-200", text: "text-amber-700", ring: "ring-amber-200", icon: "text-amber-600" },
  { bg: "from-slate-50 to-slate-100/40", border: "border-slate-200", text: "text-slate-700", ring: "ring-slate-200", icon: "text-slate-600" },
  { bg: "from-orange-50 to-orange-100/40", border: "border-orange-200", text: "text-orange-700", ring: "ring-orange-200", icon: "text-orange-600" },
];

export default function FacultyLeaderboard() {
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name") || "Selected Subject";

  const [leaderboardTab, setLeaderboardTab] = useState("leaderboard"); // "leaderboard" or "gamification"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null); // { id, name } for achievements modal

  // Roster and XP state
  const [students, setStudents] = useState([]);
  const [xpMap, setXpMap] = useState(new Map());

  const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";

  const loadData = useCallback(async () => {
    if (!subjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    try {
      // 1. Fetch total experiments count for this subject
      const { count: expCount } = await supabase
        .from("experiments")
        .select("id", { count: "exact", head: true })
        .eq("subject_id", subjectId);
      const totalExps = expCount || 1; // avoid division by zero

      // 2. Fetch all submissions from full_student_data
      const { data: submissions, error: subError } = await supabase
        .from("full_student_data")
        .select("student_id, student_name, name, register_no, register_number, status, faculty_marks, ai_marks")
        .eq("subject_id", subjectId);

      if (subError) throw subError;

      // 3. Fetch enrolled student profiles
      let enrollmentProfiles = [];
      try {
        enrollmentProfiles = await getFacultySubjectEnrollmentProfiles(subjectId);
      } catch (_e) {
        enrollmentProfiles = [];
      }

      // 4. Build map of students initializing with enrolled ones
      const studentMap = new Map();
      enrollmentProfiles.forEach((p) => {
        const id = String(p?.id || "").trim();
        if (!id) return;
        const short = id.replace(/-/g, "").slice(0, 8) || "unknown";
        const nm = String(p?.name || "").trim();
        const reg = String(p?.register_no || "").trim();
        const isPlaceholderName = !nm || nm.startsWith("Enrolled student (");
        const isPlaceholderReg = !reg || reg.startsWith("ref-");
        if (isPlaceholderName && isPlaceholderReg) return; // skip placeholder profiles

        studentMap.set(id, {
          id,
          name: nm || `Enrolled student (${short})`,
          registerNo: reg || `ref-${short}`,
          _completedCount: 0,
          _marksSum: 0,
          _gradedCount: 0,
        });
      });

      // 5. Aggregate submissions
      (submissions || []).forEach((row) => {
        const id = String(row.student_id || row.id || "").trim();
        if (!id) return;

        const marks = row.faculty_marks !== null ? Number(row.faculty_marks) : row.ai_marks !== null ? Number(row.ai_marks) : null;
        const status = String(row.status || "").toLowerCase();
        const isCompleted = ["evaluated", "approved", "submitted"].includes(status) || (marks !== null && marks > 0);
        const isGraded = marks !== null && Number.isFinite(marks);

        if (!studentMap.has(id)) {
          studentMap.set(id, {
            id,
            name: row.student_name || row.name || "Student",
            registerNo: row.register_no || row.register_number || "-",
            _completedCount: 0,
            _marksSum: 0,
            _gradedCount: 0,
          });
        }

        const s = studentMap.get(id);
        if (isCompleted) {
          s._completedCount += 1;
        }
        if (isGraded) {
          s._marksSum += marks;
          s._gradedCount += 1;
        }
      });

      const processedStudents = Array.from(studentMap.values()).map((s) => ({
        ...s,
        completion: Math.min(100, Math.round((s._completedCount / totalExps) * 100)),
        avgGrade: s._gradedCount ? Number((s._marksSum / s._gradedCount).toFixed(1)) : 0,
      }));

      // 2. Fetch Gamification XP Map from manual API (service role bypasses RLS)
      let calculatedXpMap = new Map();
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${MANUAL_API_BASE_URL}/api/gamification/leaderboard?limit=2000&role=student`, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.success && Array.isArray(payload?.data)) {
          payload.data.forEach((row) => {
            calculatedXpMap.set(String(row.user_id || ""), {
              xp: Number(row.xp_points ?? 0),
              level: Number(row.level ?? 1),
              streak: Number(row.current_streak ?? 0),
              labs: Number(row.labs_completed ?? 0),
            });
          });
        }
      } catch (err) {
        console.warn("Could not fetch gamification details from API:", err);
      }

      setStudents(processedStudents);
      setXpMap(calculatedXpMap);
    } catch (e) {
      console.error(e);
      setError("Failed to load leaderboard data.");
    } finally {
      setLoading(false);
    }
  }, [subjectId, MANUAL_API_BASE_URL]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Map XP details to students and filter/sort
  const mappedStudents = useMemo(() => {
    return students.map((s) => {
      const xpData = xpMap.get(s.id) || { xp: 0, level: 1, streak: 0, labs: 0 };
      const syntheticXp = Math.round(
        Number(s.avgGrade || 0) * 10 + Number(s.completion || 0) * 2
      );
      const xp = xpData.xp || syntheticXp;
      const level = xpData.xp ? xpData.level : Math.max(1, Math.floor(xp / 100) + 1);
      return {
        ...s,
        xp,
        level,
        streak: xpData.streak,
        labs: xpData.xp ? xpData.labs : s._completedCount || 0,
      };
    });
  }, [students, xpMap]);

  // Filters & Sorting for Marks tab
  const filteredRankings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mappedStudents
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.registerNo.toLowerCase().includes(q))
      .sort((a, b) => b.avgGrade - a.avgGrade)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));
  }, [mappedStudents, query]);

  // Filters & Sorting for Gamification tab
  const filteredGamification = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mappedStudents
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.registerNo.toLowerCase().includes(q))
      .sort((a, b) => b.xp - a.xp)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));
  }, [mappedStudents, query]);

  // Metrics for Gamification
  const gamificationSummary = useMemo(() => {
    const activeStudents = mappedStudents.filter((s) => s.xp > 0);
    const totalXp = mappedStudents.reduce((sum, s) => sum + s.xp, 0);
    const avgLevel = mappedStudents.length
      ? Number((mappedStudents.reduce((sum, s) => sum + s.level, 0) / mappedStudents.length).toFixed(1))
      : 1;
    const totalLabs = mappedStudents.reduce((sum, s) => sum + s.labs, 0);

    return {
      studentsWithXp: activeStudents.length,
      totalXp,
      avgLevel,
      totalLabsCompleted: totalLabs,
    };
  }, [mappedStudents]);

  // Metrics for Marks
  const marksSummary = useMemo(() => {
    if (mappedStudents.length === 0) return { avgGrade: 0, avgCompletion: 0, topPerformer: null };
    const avgGrade = Number(
      (mappedStudents.reduce((sum, s) => sum + s.avgGrade, 0) / mappedStudents.length).toFixed(1)
    );
    const avgCompletion = Math.round(
      mappedStudents.reduce((sum, s) => sum + s.completion, 0) / mappedStudents.length
    );
    const topPerformer = [...mappedStudents].sort((a, b) => b.avgGrade - a.avgGrade)[0] || null;

    return {
      avgGrade,
      avgCompletion,
      topPerformer,
    };
  }, [mappedStudents]);

  if (!subjectId) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <BookOpen className="mb-4 h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-bold text-slate-800">No Subject Selected</h2>
        <p className="mt-1 text-slate-500">Select a subject from the sidebar to view the leaderboard.</p>
      </div>
    );
  }

  const podium = filteredRankings.slice(0, 3);

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header banner */}
      <div className="faculty-glass faculty-gradient-ring flex flex-col justify-between gap-4 rounded-3xl p-6 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent">
              Leaderboard &amp; Gamification
            </h1>
            <p className="text-sm text-slate-600">
              {subjectName} · Student rankings and achievement lookup
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLeaderboardTab("leaderboard")}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              leaderboardTab === "leaderboard"
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Rankings
          </button>
          <button
            onClick={() => setLeaderboardTab("gamification")}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              leaderboardTab === "gamification"
                ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Gamification (XP)
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      ) : null}

      {/* Render Leaderboard tab */}
      {leaderboardTab === "leaderboard" ? (
        <div className="space-y-6">
          {/* Stats summary cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <FadeSwitch
              loading={loading}
              skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
            >
              <ShellCard title="Average Grade" glow="blue">
                <p className="text-3xl font-semibold text-slate-900">{marksSummary.avgGrade}</p>
                <p className="mt-1 text-xs text-slate-500">Out of 10</p>
              </ShellCard>
            </FadeSwitch>
            <FadeSwitch
              loading={loading}
              skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
            >
              <ShellCard title="Average Completion" glow="emerald">
                <p className="text-3xl font-semibold text-slate-900">{marksSummary.avgCompletion}%</p>
                <p className="mt-1 text-xs text-slate-500">Subject syllabus progress</p>
              </ShellCard>
            </FadeSwitch>
            <FadeSwitch
              loading={loading}
              skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
            >
              <ShellCard title="Top Performer" glow="violet">
                <p className="truncate text-xl font-semibold text-slate-900">
                  {marksSummary.topPerformer?.name || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Grade: {marksSummary.topPerformer?.avgGrade ?? "—"}
                </p>
              </ShellCard>
            </FadeSwitch>
          </div>

          {/* Search bar */}
          <div className="flex max-w-md items-center rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search className="mr-2 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search student by name or register number..."
              className="w-full text-sm outline-none"
            />
          </div>

          {/* Podium for top 3 */}
          {podium.length > 0 && !loading && !query && (
            <div className="grid gap-4 md:grid-cols-3">
              {podium.map((student, idx) => {
                const color = MEDAL_COLORS[idx];
                return (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => setSelectedStudent({ id: student.id, name: student.name })}
                    className={`cursor-pointer rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition hover:shadow-md ${color.bg} ${color.border}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-white font-bold ring-4 shadow-sm ${color.ring} ${color.text}`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">{student.name}</p>
                        <p className="text-xs text-slate-500">Reg: {student.registerNo}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-800">{student.avgGrade}</p>
                        <p className="text-[10px] text-slate-400">Avg Grade</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Full Rankings list */}
          <ShellCard title="Subject Rankings">
            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
            ) : filteredRankings.length === 0 ? (
              <EmptyState title="No students found" description="Check back once students enroll in this subject." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-slate-600 w-12">Rank</th>
                      <th className="px-4 py-2.5 text-left text-slate-600">Name</th>
                      <th className="px-4 py-2.5 text-left text-slate-600">Register Number</th>
                      <th className="px-4 py-2.5 text-right text-slate-600">Avg Grade</th>
                      <th className="px-4 py-2.5 text-right text-slate-600">Completion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRankings.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedStudent({ id: row.id, name: row.name })}
                        className="bg-white/70 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-700">#{row.rank}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 flex items-center gap-2">
                          {row.name}
                          {row.rank <= 3 ? <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" /> : null}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{row.registerNo}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{row.avgGrade}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{row.completion}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ShellCard>
        </div>
      ) : (
        /* Render Gamification tab */
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <FadeSwitch
              loading={loading}
              skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
            >
              <ShellCard title="Students with XP" glow="violet">
                <p className="text-2xl font-semibold text-slate-900">{gamificationSummary.studentsWithXp}</p>
                <p className="mt-1 text-xs text-slate-500">Students with XP &gt; 0</p>
              </ShellCard>
            </FadeSwitch>
            <FadeSwitch
              loading={loading}
              skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
            >
              <ShellCard title="Total XP" glow="blue">
                <p className="text-2xl font-semibold text-slate-900">
                  {gamificationSummary.totalXp.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-500">Combined subject students</p>
              </ShellCard>
            </FadeSwitch>
            <FadeSwitch
              loading={loading}
              skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
            >
              <ShellCard title="Avg Level" glow="emerald">
                <p className="text-2xl font-semibold text-slate-900">{gamificationSummary.avgLevel}</p>
                <p className="mt-1 text-xs text-slate-500">Average student level</p>
              </ShellCard>
            </FadeSwitch>
            <FadeSwitch
              loading={loading}
              skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
            >
              <ShellCard title="Labs Completed" glow="cyan">
                <p className="text-2xl font-semibold text-slate-900">
                  {gamificationSummary.totalLabsCompleted.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-500">Combined labs completed</p>
              </ShellCard>
            </FadeSwitch>
          </div>

          {/* Search bar */}
          <div className="flex max-w-md items-center rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search className="mr-2 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search student by name or register number..."
              className="w-full text-sm outline-none"
            />
          </div>

          <ShellCard title="Top Students by XP">
            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
            ) : filteredGamification.length === 0 ? (
              <EmptyState title="No gamification data" description="Once students earn XP, they will appear here." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-slate-600 w-12">Rank</th>
                      <th className="px-4 py-2.5 text-left text-slate-600">Name</th>
                      <th className="px-4 py-2.5 text-left text-slate-600">Register Number</th>
                      <th className="px-4 py-2.5 text-right text-slate-600">XP</th>
                      <th className="px-4 py-2.5 text-right text-slate-600">Level</th>
                      <th className="px-4 py-2.5 text-right text-slate-600">Labs Completed</th>
                      <th className="px-4 py-2.5 text-right text-slate-600">Streak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredGamification.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedStudent({ id: row.id, name: row.name })}
                        className="bg-white/70 hover:bg-violet-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-700">#{row.rank}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 flex items-center gap-2">
                          {row.name}
                          {row.rank <= 3 ? <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" /> : null}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{row.registerNo}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-violet-700">
                          {row.xp.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{row.level}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{row.labs}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{row.streak}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ShellCard>
        </div>
      )}

      {/* Student Achievements Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-3xl bg-slate-50 p-6 shadow-2xl"
            >
              {/* Modal Header */}
              <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{selectedStudent.name}'s Achievements</h3>
                    <p className="text-xs text-slate-500">Achievements unlocked across all lab activities</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Achievements Content */}
              <AchievementsPanel userId={selectedStudent.id} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
