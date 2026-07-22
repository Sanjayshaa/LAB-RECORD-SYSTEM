import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  FilePlus2,
  Loader2,
  LogOut,
  GraduationCap,
  ArrowRight,
  ClipboardList,
  ChevronRight,
  Users,
  BarChart3,
  Clock,
  Plus,
  Sparkles,
  Building2,
  FlaskConical,
  FileText,
  ExternalLink,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { clearAllUserScope } from "@/lib/clientSession";

type FacultySubject = {
  subject_id: string;
  subjects: {
    id: string;
    name: string;
    code: string | null;
    year: string | null;
    semester: string | null;
    department: string | null;
  };
};

function normalizeDepartmentKey(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FacultySubjectSelect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasAutoNavigatedRef = useRef(false);
  const [subjects, setSubjects] = useState<FacultySubject[]>([]);
  const [facultyProfile, setFacultyProfile] = useState<{
    name: string;
    department: string;
    year: string;
    semester: string;
  }>({ name: "Faculty", department: "", year: "", semester: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shouldAutoSelect = searchParams.get("auto") === "1";

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        const profileRes = await supabase
          .from("profiles")
          .select("name, department, year, semester")
          .eq("id", user.id)
          .maybeSingle();

        if (profileRes.data) {
          setFacultyProfile({
            name: profileRes.data.name || "Faculty Member",
            department: profileRes.data.department || "",
            year: profileRes.data.year || "",
            semester: profileRes.data.semester || "",
          });
        }

        const facultyDepartment = normalizeDepartmentKey(profileRes.data?.department || "");
        const facultyYear = String(profileRes.data?.year || "").trim();
        const facultySemester = String(profileRes.data?.semester || "").trim();

        const { data, error: fetchError } = await supabase
          .from("faculty_subjects")
          .select(
            `
            subject_id,
            subjects (
              id,
              name,
              code,
              year,
              semester,
              department
            )
          `
          )
          .eq("faculty_id", user.id);

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }

        const filtered = ((data || []) as unknown as FacultySubject[]).filter((row) => {
          if (!facultyDepartment) return true;
          if (normalizeDepartmentKey(row?.subjects?.department || "") !== facultyDepartment) return false;
          if (facultyYear && String(row?.subjects?.year || "").trim() !== facultyYear) return false;
          if (facultySemester && String(row?.subjects?.semester || "").trim() !== facultySemester) return false;
          return true;
        });

        if (shouldAutoSelect && !hasAutoNavigatedRef.current && filtered.length === 1) {
          const onlySubject = filtered[0];
          const subjectId = String(onlySubject?.subject_id || onlySubject?.subjects?.id || "").trim();
          const subjectName = String(onlySubject?.subjects?.name || "").trim();
          if (subjectId && subjectName) {
            hasAutoNavigatedRef.current = true;
            localStorage.setItem("faculty_subject_id", subjectId);
            localStorage.setItem("faculty_subject_name", subjectName);
            navigate("/faculty", { replace: true });
            return;
          }
        }

        setSubjects(filtered);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load subjects:", err);
        setError("Failed to load subjects. Please try again.");
        setLoading(false);
      }
    }

    load();
  }, [navigate, shouldAutoSelect]);

  function selectSubject(subjectId: string, subjectName: string) {
    localStorage.setItem("faculty_subject_id", subjectId);
    localStorage.setItem("faculty_subject_name", subjectName);
    navigate("/faculty", { replace: true });
  }

  function openSubjectRoute(subjectId: string, subjectName: string, path: string) {
    localStorage.setItem("faculty_subject_id", subjectId);
    localStorage.setItem("faculty_subject_name", subjectName);
    navigate(path);
  }

  async function logout() {
    await supabase.auth.signOut();
    clearAllUserScope();
    navigate("/login");
  }

  if (loading) {
    return (
      <div className="faculty-bg-vibrant flex min-h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="faculty-glass faculty-gradient-ring flex flex-col items-center gap-4 rounded-3xl px-10 py-10 shadow-lg"
        >
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-3.5 shadow-md">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-sm font-semibold text-slate-700">Loading assigned subjects…</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="faculty-bg-vibrant flex min-h-screen items-center justify-center px-4">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg max-w-md">
          <p className="mb-4 text-sm font-bold text-rose-700">{error}</p>
          <button
            onClick={() => {
              setError(null);
              navigate(0);
            }}
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Main Workspace Body ── */}
      <div>
        {/* Header Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl border border-slate-200/80 bg-white p-6 md:p-8 shadow-sm mb-8 relative overflow-hidden"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 text-indigo-600 shrink-0">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">
                  Subject Management Console
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-500 max-w-2xl">
                  Select an assigned laboratory subject to manage experiments, evaluate student record submissions, and set lab deadlines.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Assigned Subjects</p>
                <p className="text-xl font-extrabold text-indigo-600">{subjects.length}</p>
              </div>
              {facultyProfile.department && (
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Department Scope</p>
                  <p className="text-sm font-bold text-slate-800">{facultyProfile.department}</p>
                </div>
              )}
            </div>
          </div>

        </motion.div>

        {/* ── Global Management Actions Card Grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.2 }}
          className="mb-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Faculty Global Workspace Actions</h2>
              <p className="text-xs text-slate-500">Management tools & consoles available across all your subjects</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Deadlines */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/experiments")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Clock className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Lab Deadlines</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Set due dates & submission rules</span>
              </div>
            </motion.button>

            {/* Add Experiment */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/add-experiment")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Plus className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Add New Experiment</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Publish new lab practical tasks</span>
              </div>
            </motion.button>

            {/* Exam Console */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/exams")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-amber-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Exam Console</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Conduct & monitor online lab exams</span>
              </div>
            </motion.button>

            {/* Templates */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/templates")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-violet-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                  <FilePlus2 className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Code Templates</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Starter code & record templates</span>
              </div>
            </motion.button>

            {/* Students Roster */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/students")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-sky-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <Users className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-sky-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Students Roster</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Enrolled student profiles & attendance</span>
              </div>
            </motion.button>

            {/* Analytics */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/reports")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Analytics & Reports</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Class performance & grade reports</span>
              </div>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
