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
          .select("department, year, semester")
          .eq("id", user.id)
          .maybeSingle();
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

        // Auto-select only when there is a single assigned subject.
        // For multiple subjects, force explicit faculty choice to avoid incorrect defaults.
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
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="faculty-glass faculty-gradient-ring flex flex-col items-center gap-4 rounded-3xl px-10 py-10"
        >
          <div className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 p-3 shadow-md">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
          <p className="text-sm font-medium text-slate-600">Loading your subjects…</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="faculty-bg-vibrant flex min-h-screen items-center justify-center">
        <div className="faculty-surface rounded-2xl p-8 text-center">
          <p className="mb-4 text-sm text-rose-700">{error}</p>
          <button
            onClick={() => { setError(null); navigate(0); }}
            className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm text-rose-700 transition hover:bg-rose-100"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="faculty-bg-vibrant min-h-screen text-slate-800">

      {/* ── Top Command Bar (matches FacultyLayout desktop top bar) ── */}
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/70 px-6 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 p-2 shadow-md ring-1 ring-blue-300/40">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Faculty Panel</p>
              <p className="text-[11px] text-slate-500">Digital Lab Workspace</p>
            </div>
          </div>

          {/* Breadcrumb + Live pill */}
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-xs text-slate-500">Faculty</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-800">Subject Workspace</span>
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>

          {/* Logout */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </motion.button>
        </div>
      </div>

      {/* ── Hero Command Center (glass card matching dashboard) ── */}
      <div className="mx-auto max-w-[1380px] px-4 pt-8 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="faculty-glass faculty-gradient-ring mb-8 rounded-3xl p-6 md:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 p-3 shadow-md ring-1 ring-blue-300/30">
                <BookOpen className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
                  Subject Workspace
                </h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  Open one of your assigned subjects and continue managing students, submissions, and analytics.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600">
                {subjects.length} subject{subjects.length !== 1 ? "s" : ""} assigned
              </span>
            </div>
          </div>

          {/* Quick-access chips */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Quick Access:</span>
            <button
              type="button"
              onClick={() => navigate("/faculty/experiments")}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              title="Submissions and per-experiment due dates"
            >
              <Clock className="h-3.5 w-3.5" />
              Set deadlines
            </button>
            <button
              type="button"
              onClick={() => navigate("/faculty/add-experiment")}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Add experiment
            </button>
            <button
              type="button"
              onClick={() => navigate("/faculty/templates")}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              Templates
            </button>
            <button
              type="button"
              onClick={() => navigate("/faculty/students")}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              <Users className="h-3.5 w-3.5" />
              Students
            </button>
            <button
              type="button"
              onClick={() => navigate("/faculty/reports")}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </button>
            <button
              type="button"
              onClick={() => navigate("/faculty/exams")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Exam Console
            </button>
          </div>
        </motion.div>

        {/* ── Subject Grid ── */}
        {subjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="faculty-surface rounded-3xl py-24 text-center"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <BookOpen className="h-7 w-7 text-blue-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-800">No subjects assigned</h3>
            <p className="mx-auto max-w-sm text-sm text-slate-500">
              Contact your administrator to get subjects assigned to your account.
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 pb-12">
            {subjects.map((fs, idx) => (
              <motion.div
                key={fs.subject_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                whileHover={{ y: -5, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                role="button"
                tabIndex={0}
                onClick={() => selectSubject(fs.subject_id, fs.subjects.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectSubject(fs.subject_id, fs.subjects.name);
                  }
                }}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/70 bg-white/88 p-6 text-left shadow-[0_4px_16px_rgba(37,99,235,0.08),0_12px_28px_rgba(15,23,42,0.07)] backdrop-blur-md transition-all hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(37,99,235,0.14),0_16px_36px_rgba(15,23,42,0.1)] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              >
                {/* Hover tint overlay */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-50/60 to-indigo-50/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                {/* Left accent rail */}
                <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-gradient-to-b from-blue-500 to-indigo-500 opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="relative z-10 flex h-full flex-col">
                  {/* Top: code badge */}
                  {fs.subjects.code && (
                    <span className="mb-3 inline-flex self-start rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 tracking-wide">
                      {fs.subjects.code}
                    </span>
                  )}

                  {/* Subject name */}
                  <h3 className="mb-1 text-base font-bold leading-snug text-slate-900 transition-colors group-hover:text-blue-700">
                    {fs.subjects.name}
                  </h3>

                  {/* Meta chips */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {fs.subjects.department && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {fs.subjects.department}
                      </span>
                    )}
                    {fs.subjects.year && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Year {fs.subjects.year}
                      </span>
                    )}
                    {fs.subjects.semester && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Sem {fs.subjects.semester}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSubjectRoute(fs.subject_id, fs.subjects.name, "/faculty/experiments");
                      }}
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                      title="Set due dates per experiment"
                    >
                      Deadlines
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSubjectRoute(fs.subject_id, fs.subjects.name, "/faculty/add-experiment");
                      }}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      Add experiment
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSubjectRoute(fs.subject_id, fs.subjects.name, "/faculty/templates");
                      }}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      Templates
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSubjectRoute(fs.subject_id, fs.subjects.name, "/faculty/students");
                      }}
                      className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      Students
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSubjectRoute(fs.subject_id, fs.subjects.name, "/faculty/reports");
                      }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Analytics
                    </button>
                  </div>

                  {/* CTA row */}
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                    Open Subject Dashboard
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
