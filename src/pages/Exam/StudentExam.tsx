import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { useToast } from "@/components/ui/ToastProvider";
import { logExamTabSwitchEvent } from "@/lib/examTabSwitchLog";
import { computeExamPhase, computeStudentExamDeadlineMs } from "@/lib/examWindow";
import {
  Clock,
  User,
  Hash,
  Crosshair,
  ListOrdered,
  Code2,
  Terminal,
  CheckCircle2,
  SendHorizontal,
  AlertTriangle,
  FlaskConical,
} from "lucide-react";

type ExamRow = {
  id: string;
  title: string | null;
  duration_minutes: number;
  subject_id: string;
  start_time: string | null;
  end_time: string | null;
};

type ExperimentRow = {
  id: string;
  experiment_no: string | number | null;
  title: string | null;
};

const FIELD_CONFIG = [
  { key: "aim" as const, label: "Aim", icon: Crosshair, accent: "indigo", minH: "min-h-20" },
  { key: "procedure" as const, label: "Procedure", icon: ListOrdered, accent: "blue", minH: "min-h-24" },
  { key: "program" as const, label: "Program", icon: Code2, accent: "indigo", minH: "min-h-28" },
  { key: "output" as const, label: "Output", icon: Terminal, accent: "amber", minH: "min-h-24" },
  { key: "result" as const, label: "Result", icon: CheckCircle2, accent: "emerald", minH: "min-h-20" },
] as const;

const ACCENT_MAP: Record<string, { dot: string; text: string; border: string; bg: string }> = {
  blue: { dot: "bg-blue-500", text: "text-blue-700", border: "focus:border-blue-500/50 focus:ring-blue-500/20", bg: "bg-blue-50" },
  indigo: { dot: "bg-indigo-500", text: "text-indigo-700", border: "focus:border-blue-500/50 focus:ring-blue-500/20", bg: "bg-indigo-50" },
  amber: { dot: "bg-amber-500", text: "text-amber-700", border: "focus:border-blue-500/50 focus:ring-blue-500/20", bg: "bg-amber-50" },
  emerald: { dot: "bg-emerald-500", text: "text-emerald-700", border: "focus:border-blue-500/50 focus:ring-blue-500/20", bg: "bg-emerald-50" },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StudentExam() {
  const navigate = useNavigate();
  const toast = useToast();
  const examId = localStorage.getItem("exam_id");
  const studentName = localStorage.getItem("exam_student_name") || "";
  const registerNo = localStorage.getItem("exam_register_no") || "";

  const [exam, setExam] = useState<ExamRow | null>(null);
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [selectedExpId, setSelectedExpId] = useState("");
  const [aim, setAim] = useState("");
  const [procedure, setProcedure] = useState("");
  const [program, setProgram] = useState("");
  const [output, setOutput] = useState("");
  const [result, setResult] = useState("");
  const [remainingTime, setRemainingTime] = useState(0);
  const [examEndTime, setExamEndTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [invalidSession, setInvalidSession] = useState(false);
  const [error, setError] = useState("");
  const autoSubmittedRef = useRef(false);
  const clipboardBlockNotifiedRef = useRef(false);

  const fieldSetters: Record<string, (v: string) => void> = {
    aim: setAim,
    procedure: setProcedure,
    program: setProgram,
    output: setOutput,
    result: setResult,
  };
  const fieldValues: Record<string, string> = { aim, procedure, program, output, result };

  const clearExamSession = useCallback(() => {
    localStorage.removeItem("exam_room_id");
    localStorage.removeItem("exam_student_name");
    localStorage.removeItem("exam_register_no");
    localStorage.removeItem("exam_id");
    localStorage.removeItem("exam_start_time");
  }, []);

  useEffect(() => {
    if (invalidSession) {
      const timer = window.setTimeout(() => navigate("/exam/login"), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [invalidSession, navigate]);

  useEffect(() => {
    const loadExam = async () => {
      if (!examId || !studentName || !registerNo) {
        setInvalidSession(true);
        setLoading(false);
        return;
      }

      const { data: examData, error: examError } = await supabase
        .from("exams")
        .select("id, title, duration_minutes, subject_id, start_time, end_time")
        .eq("id", examId)
        .maybeSingle<ExamRow>();

      if (examError || !examData) {
        setInvalidSession(true);
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        clearExamSession();
        navigate("/login", { replace: true });
        setLoading(false);
        return;
      }

      const { data: existingSubmission } = await supabase
        .from("exam_submissions")
        .select("id")
        .eq("exam_id", examId)
        .eq("student_id", user.id)
        .limit(1);

      if (existingSubmission && existingSubmission.length > 0) {
        clearExamSession();
        navigate("/exam/login", { replace: true });
        setLoading(false);
        return;
      }

      setExam(examData);

      const phase = computeExamPhase(Date.now(), {
        start_time: examData.start_time,
        end_time: examData.end_time,
        duration_minutes: examData.duration_minutes,
      });
      if (phase === "draft") {
        setError("This exam has an incomplete schedule. Ask your faculty to set start, end, or duration.");
        setInvalidSession(true);
        setLoading(false);
        return;
      }
      if (phase === "scheduled" || phase === "completed") {
        setInvalidSession(true);
        setLoading(false);
        return;
      }

      const endAtMs = computeStudentExamDeadlineMs({
        start_time: examData.start_time,
        end_time: examData.end_time,
        duration_minutes: examData.duration_minutes,
      });
      setExamEndTime(endAtMs);

      const nowMs = Date.now();
      const nextRemaining = Math.max(0, Math.floor((endAtMs - nowMs) / 1000));
      setRemainingTime(nextRemaining);

      const { data: expData, error: expError } = await supabase
        .from("experiments")
        .select("id, experiment_no, title")
        .eq("subject_id", examData.subject_id)
        .order("experiment_no", { ascending: true });

      if (expError) {
        setError(expError.message);
      } else {
        const list = sortByExperimentNo(
          ((expData || []) as ExperimentRow[]).map((row, index) => ({
          ...row,
          experiment_no: row.experiment_no ?? index + 1,
          })),
          (row) => row.experiment_no
        );
        setExperiments(list);
        if (list.length > 0) setSelectedExpId(String(list[0].id));
      }

      setLoading(false);
    };

    void loadExam();
  }, [clearExamSession, examId, navigate, registerNo, studentName]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (!exam || !examId || submitting || alreadySubmitted) return;
    if (!registerNo.trim()) return;
    if (experiments.length === 0) {
      setError("No experiments are configured for this exam subject. Contact your faculty.");
      return;
    }
    if (!selectedExpId) {
      setError("Select an experiment before submitting.");
      return;
    }

    const normalizedAim = aim.trim();
    const normalizedProcedure = procedure.trim();
    const normalizedProgram = program.trim();
    const normalizedOutput = output.trim();
    const normalizedResult = result.trim();
    const hasAnyAnswer =
      normalizedAim.length > 0 ||
      normalizedProcedure.length > 0 ||
      normalizedProgram.length > 0 ||
      normalizedOutput.length > 0 ||
      normalizedResult.length > 0;
    if (!hasAnyAnswer) {
      setError(
        auto
          ? "Time ended, but no answer content was entered. Submission was blocked."
          : "Enter at least one answer section before submitting."
      );
      return;
    }

    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      setError("Please login again to submit your exam.");
      return;
    }

    const { data: existingSubmission } = await supabase
      .from("exam_submissions")
      .select("id")
      .eq("exam_id", examId)
      .eq("student_id", user.id)
      .limit(1);

    if (existingSubmission && existingSubmission.length > 0) {
      setAlreadySubmitted(true);
      setSubmitting(false);
      toast.info("You have already submitted this exam.");
      clearExamSession();
      navigate("/exam/login");
      return;
    }

    const { error: submitError } = await supabase.from("exam_submissions").insert({
      exam_id: exam.id,
      student_id: user.id,
      student_name: studentName,
      register_no: registerNo.trim(),
      exp_id: selectedExpId || null,
      aim: normalizedAim,
      procedure: normalizedProcedure,
      program: normalizedProgram,
      output: normalizedOutput,
      result: normalizedResult,
      submitted_at: new Date().toISOString(),
    });

    setSubmitting(false);

    if (submitError) {
      const code = (submitError as { code?: string }).code;
      const msg = String(submitError.message || "").toLowerCase();
      if (code === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
        setAlreadySubmitted(true);
        toast.info("This exam was already submitted.");
        clearExamSession();
        navigate("/exam/login");
        return;
      }
      setError(submitError.message);
      return;
    }

    setAlreadySubmitted(true);
    clearExamSession();

    if (auto) {
      toast.info("Time is over. Your exam was auto-submitted.");
    } else {
      toast.success("Exam submitted successfully.");
    }

    navigate("/exam/login");
  }, [
    aim,
    alreadySubmitted,
    clearExamSession,
    exam,
    examId,
    experiments.length,
    navigate,
    output,
    procedure,
    program,
    registerNo,
    result,
    selectedExpId,
    studentName,
    submitting,
    toast,
  ]);

  useEffect(() => {
    if (alreadySubmitted || examEndTime == null || loading) return;

    const tick = () => {
      const nextRemaining = Math.max(0, Math.floor((examEndTime - Date.now()) / 1000));
      setRemainingTime(nextRemaining);
      if (
        nextRemaining <= 0 &&
        !autoSubmittedRef.current &&
        experiments.length > 0
      ) {
        autoSubmittedRef.current = true;
        void handleSubmit(true);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [examEndTime, alreadySubmitted, loading, handleSubmit, experiments.length]);

  useEffect(() => {
    if (invalidSession || loading || alreadySubmitted) return undefined;

    const notifyOnce = () => {
      if (clipboardBlockNotifiedRef.current) return;
      clipboardBlockNotifiedRef.current = true;
      toast.info("Copy and paste are disabled during exam.");
    };

    const blockClipboardEvent = (event: ClipboardEvent) => {
      event.preventDefault();
      notifyOnce();
    };

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      notifyOnce();
    };

    const blockClipboardShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;
      if (hasModifier && (key === "c" || key === "v" || key === "x")) {
        event.preventDefault();
        notifyOnce();
      }
    };

    document.addEventListener("copy", blockClipboardEvent);
    document.addEventListener("cut", blockClipboardEvent);
    document.addEventListener("paste", blockClipboardEvent);
    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockClipboardShortcuts);

    return () => {
      document.removeEventListener("copy", blockClipboardEvent);
      document.removeEventListener("cut", blockClipboardEvent);
      document.removeEventListener("paste", blockClipboardEvent);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockClipboardShortcuts);
    };
  }, [alreadySubmitted, invalidSession, loading, toast]);

  // Faculty monitor / audit: log each time the student leaves the exam tab (visibility hidden).
  useEffect(() => {
    if (!exam || !examId || !registerNo.trim() || alreadySubmitted || invalidSession || loading) {
      return undefined;
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        void logExamTabSwitchEvent(examId, registerNo);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [alreadySubmitted, exam, examId, invalidSession, loading, registerNo]);

  const timerMinutes = remainingTime / 60;
  const timerColorClass =
    timerMinutes < 5 ? "text-amber-600" :
    timerMinutes < 15 ? "text-amber-300" :
    "text-indigo-300";
  const timerGlow = timerMinutes < 5;

  if (invalidSession) {
    return (
      <div className="faculty-bg-vibrant flex h-screen items-center justify-center">
          <div className="faculty-surface relative max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <div className="absolute inset-0 bg-card-shine pointer-events-none" />
          <div className="relative z-10">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-amber-700">
              Exam session invalid. Please login again.
            </h2>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="faculty-bg-vibrant flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          Loading exam...
        </div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="faculty-bg-vibrant flex h-screen items-center justify-center">
        <div className="faculty-surface relative max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <div className="absolute inset-0 bg-card-shine pointer-events-none" />
          <div className="relative z-10">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-emerald-700">
              You have already submitted this exam
            </h2>
          </div>
        </div>
      </div>
    );
  }

  const selectedExperiment =
    experiments.find((row) => String(row.id) === selectedExpId) ?? experiments[0] ?? null;

  return (
    <div className="faculty-bg-vibrant relative min-h-screen p-4 text-slate-900 md:p-8">
      {/* Decorative orbs */}
      <div className="pointer-events-none fixed right-0 top-0 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl" />
      <div className="pointer-events-none fixed bottom-0 left-0 h-64 w-64 rounded-full bg-indigo-200/50 blur-3xl" />

      <div className="mx-auto w-full max-w-4xl relative z-10">
        {/* Top bar: title + timer */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 p-2 shadow-lg shadow-blue-500/20">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-xl font-bold text-transparent">
              {exam?.title || "Student Exam"}
            </h1>
          </div>

          {/* Timer */}
          <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white px-6 py-3 shadow-sm ${timerGlow ? "ring-1 ring-amber-300" : ""}`}>
            {timerGlow && (
              <div className="pointer-events-none absolute inset-0 animate-glow-pulse bg-amber-50" />
            )}
            <div className="relative z-10 flex items-center gap-2" aria-live="polite">
              <Clock className={`w-4 h-4 ${timerColorClass}`} />
              <span className={`font-mono text-lg font-bold tracking-wider ${timerColorClass}`}>
                {formatTime(remainingTime)}
              </span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* Student info bar */}
        <div className="faculty-surface mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <User className="w-4 h-4 text-blue-600" />
            <span className="text-slate-400">Student:</span>
            <span className="font-medium text-slate-900">{studentName}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <Hash className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-400">Register No:</span>
            <span className="font-medium text-slate-900">{registerNo}</span>
          </div>
        </div>

        {/* Main form card */}
        <div className="faculty-surface relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="absolute inset-0 bg-card-shine pointer-events-none" />
          <div className="relative z-10">
            {/* Experiment selector */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-700">Experiment</label>
              {experiments.length > 1 ? (
                <select
                  value={selectedExpId}
                  onChange={(e) => setSelectedExpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                  disabled={submitting}
                >
                  {experiments.map((row) => (
                    <option key={row.id} value={row.id}>
                      Experiment {row.experiment_no ?? "-"} - {row.title || "Untitled"}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {selectedExperiment
                    ? `Experiment ${selectedExperiment.experiment_no ?? "-"} - ${selectedExperiment.title || "Untitled"}`
                    : "No experiment assigned"}
                </div>
              )}
            </div>

            {/* Textareas */}
            <div className="grid gap-5">
              {FIELD_CONFIG.map((field) => {
                const a = ACCENT_MAP[field.accent];
                const Icon = field.icon;
                return (
                  <div key={field.key}>
                    <label htmlFor={`exam-${field.key}`} className="flex items-center gap-2 mb-2 text-sm font-medium">
                      <span className={`w-6 h-6 rounded-md ${a.bg} flex items-center justify-center`}>
                        <Icon className={`w-3.5 h-3.5 ${a.text}`} />
                      </span>
                      <span className={a.text}>{field.label}</span>
                    </label>
                    <textarea
                      id={`exam-${field.key}`}
                      value={fieldValues[field.key]}
                      onChange={(e) => fieldSetters[field.key](e.target.value)}
                      placeholder={field.label}
                      className={`${field.minH} w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none ${a.border} focus:ring-2 transition-all`}
                      disabled={submitting}
                    />
                  </div>
                );
              })}
            </div>

            {/* Submit */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => void handleSubmit(false)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 hover:shadow-blue-500/30 hover:brightness-110 disabled:opacity-60 disabled:hover:brightness-100"
                disabled={submitting}
              >
                <SendHorizontal className="w-4 h-4" />
                {submitting ? "Submitting..." : "Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
