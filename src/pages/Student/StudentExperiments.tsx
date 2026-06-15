import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getStatusConfig } from "@/utils/statusConfig";
import { getStudentExperimentData } from "@/utils/unifiedStudentData";
import { useSelectedSubject } from "@/context/SubjectContext";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { applyOoseExperimentOrderIfNeeded } from "@/utils/ooseExperimentOrder";
import { supabase } from "@/lib/supabase";
import { repairLeadingTitle } from "@/utils/titleRepair";
import {
  isNndlSubjectName,
  shouldHideLegacyNndlUnifiedExperiment,
} from "@/utils/nndlExperimentFilter";
import { motion } from "framer-motion";
import { ExperimentsSkeleton } from "@/components/ui/StudentSkeletons";
import EmptyState from "@/components/ui/EmptyState";
import ErrorScreen from "@/components/ui/ErrorScreen";

const STUDENT_DATA_UPDATED_EVENT = "student-data-updated";
type ExperimentRow = {
  id: string;
  experimentId: string;
  experimentNo: number;
  title: string;
  status: string;
  effectiveStatus: string;
  finalMarks: number;
};

function getOpenLabel(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "locked") return "Locked";
  if (normalized === "unlocked") return "Start";
  if (normalized === "draft") return "Continue";
  if (normalized === "pending" || !normalized) return "Start";
  if (normalized === "submitted") return "View";
  if (normalized === "evaluated" || normalized === "completed") return "Review";
  return "Open";
}

function getWorkspaceHint(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "locked") return "Submit the previous experiment to unlock this one.";
  if (normalized === "unlocked") return "Start this experiment now.";
  if (normalized === "draft") return "Continue editing your saved draft.";
  if (normalized === "pending" || !normalized) return "Start filling Aim, Procedure, Code, Output and Result.";
  if (normalized === "submitted") return "Open to review and update before next submission.";
  if (normalized === "evaluated" || normalized === "completed") {
    return "Reopen to improve content after faculty evaluation.";
  }
  return "Open experiment workspace.";
}

function applySequentialUnlock(rows: ExperimentRow[]): ExperimentRow[] {
  let canOpenNext = true;
  return rows.map((row) => {
    const actual = String(row.status || "").trim().toLowerCase();
    const isCompletedStep =
      actual === "submitted" || actual === "evaluated" || actual === "completed";

    if (isCompletedStep) {
      canOpenNext = true;
      return { ...row, effectiveStatus: actual };
    }

    if (canOpenNext) {
      canOpenNext = false;
      // DB often uses "locked" for not-yet-started; treat like pending so exp 1 (and next after submit) can open.
      if (actual === "pending" || !actual || actual === "locked") {
        return { ...row, effectiveStatus: "unlocked" };
      }
      return { ...row, effectiveStatus: actual };
    }

    return { ...row, effectiveStatus: "locked" };
  });
}

export default function StudentExperiments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedSubjectId } = useSelectedSubject();
  const querySubjectId = searchParams.get("subject");
  const querySubjectName = searchParams.get("subjectName");
  const subjectId =
    selectedSubjectId ||
    querySubjectId ||
    localStorage.getItem("student_subject_id");
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "submitted" | "evaluated" | "draft">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!subjectId) {
        setExperiments([]);
        return;
      }
      const unified = await getStudentExperimentData({
        subjectId,
        subjectName:
          querySubjectName ||
          localStorage.getItem("student_subject_name") ||
          "",
        searchParams,
      });
      const mapped = sortByExperimentNo(
        unified.experiments.map((row) => ({
        id: row.id,
        experimentId: row.experimentId,
        experimentNo: row.experimentNo,
        title: row.title,
        status: row.status,
        effectiveStatus: row.status,
        finalMarks: row.finalMarks,
        })),
        (row) => row.experimentNo
      );
      if (mapped.length > 0) {
        setExperiments(applySequentialUnlock(mapped));
      } else {
        // Hard fallback: show subject experiment master list even if student rows are missing.
        const subjectNameCandidate =
          querySubjectName ||
          searchParams.get("subjectName") ||
          localStorage.getItem("student_subject_name") ||
          "";
        let subjectIdsToTry = [String(subjectId || "").trim()].filter(Boolean);
        if (subjectNameCandidate) {
          const subjectLookup = await supabase
            .from("subjects")
            .select("id")
            .eq("name", subjectNameCandidate);
          const lookupIds = (Array.isArray(subjectLookup.data) ? subjectLookup.data : [])
            .map((row) => String((row as Record<string, unknown>)?.id || "").trim())
            .filter(Boolean);
          subjectIdsToTry = [...new Set([...subjectIdsToTry, ...lookupIds])];
        }

        let experimentRows: Array<Record<string, unknown>> = [];
        let resolvedSubjectId = "";
        for (const candidateSubjectId of subjectIdsToTry) {
          const experimentsRes = await supabase
            .from("experiments")
            .select("id,title,experiment_no")
            .eq("subject_id", candidateSubjectId)
            .order("experiment_no", { ascending: true });
          if (!experimentsRes.error && Array.isArray(experimentsRes.data) && experimentsRes.data.length > 0) {
            experimentRows = experimentsRes.data as Array<Record<string, unknown>>;
            resolvedSubjectId = candidateSubjectId;
            break;
          }
        }

        if (resolvedSubjectId && resolvedSubjectId !== String(subjectId)) {
          localStorage.setItem("student_subject_id", resolvedSubjectId);
          if (subjectNameCandidate) localStorage.setItem("student_subject_name", subjectNameCandidate);
        }

        const rawFallback = experimentRows.map((row, index) => ({
          id: String(row?.id || `exp-${index + 1}`),
          experimentId: String(row?.id || `exp-${index + 1}`),
          experimentNo: Number(row?.experiment_no) || index + 1,
          title: repairLeadingTitle(String(row?.title || `Experiment ${index + 1}`)),
          status: "pending",
          effectiveStatus: "locked",
          finalMarks: 0,
        }));
        let fallbackMapped = sortByExperimentNo(rawFallback, (row) => row.experimentNo);
        fallbackMapped = applyOoseExperimentOrderIfNeeded(
          String(resolvedSubjectId || subjectId),
          subjectNameCandidate,
          fallbackMapped,
          (row) => row.title
        );
        if (isNndlSubjectName(subjectNameCandidate)) {
          fallbackMapped = fallbackMapped.filter(
            (row) =>
              !shouldHideLegacyNndlUnifiedExperiment(subjectNameCandidate, row.experimentNo, row.title)
          );
        }
        fallbackMapped = fallbackMapped.map((row, index) => ({
          ...row,
          experimentNo: index + 1,
        }));
        setExperiments(applySequentialUnlock(fallbackMapped));
      }
    } catch (fetchErr) {
      setError(fetchErr instanceof Error ? fetchErr.message : "Unable to load experiments.");
    } finally {
      setLoading(false);
    }
  }, [querySubjectName, searchParams, subjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredExperiments = useMemo(() => {
    if (activeTab === "all") return experiments;
    return experiments.filter((exp) => {
      const normalized = String(exp.effectiveStatus || exp.status || "").trim().toLowerCase();
      if (activeTab === "evaluated") return normalized === "evaluated" || normalized === "completed";
      if (activeTab === "pending") return normalized === "pending" || normalized === "unlocked" || normalized === "locked";
      return normalized === activeTab;
    });
  }, [activeTab, experiments]);

  useEffect(() => {
    const onDataUpdated = () => {
      void fetchData();
    };
    window.addEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    return () => {
      window.removeEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    };
  }, [fetchData]);

  /** Refetch when student returns to the tab so faculty title/number edits show without a hard refresh. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchData();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1280px]">
          <ExperimentsSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1280px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <ErrorScreen message={error} onRetry={() => void fetchData()} />
        </div>
      </div>
    );
  }

  if (!subjectId) {
    return (
      <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1280px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <EmptyState
            title="Select a subject first"
            description="Choose a subject from your list to view and start experiments."
            action={{
              label: "Go to subjects",
              onClick: () => navigate("/student/subjects"),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Student Experiments</h1>
            <p className="mt-1 text-xs text-slate-500">
              Use this page to start or continue experiments. Submission review and mark history are in Submissions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void fetchData()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Refresh
            </button>
            <span className="text-sm text-slate-500">{experiments.length} experiments</span>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/80 p-1 backdrop-blur-sm">
          {[
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "submitted", label: "Submitted" },
            { key: "evaluated", label: "Evaluated" },
            { key: "draft", label: "Draft" },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`min-h-[44px] rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {filteredExperiments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <EmptyState
              title="No experiments here"
              description={
                activeTab === "all"
                  ? "No experiments are available for this subject yet."
                  : `No experiments match the "${activeTab}" filter. Try another tab or refresh.`
              }
              action={{
                label: activeTab === "all" ? "Refresh" : "Show all",
                onClick: () => (activeTab === "all" ? void fetchData() : setActiveTab("all")),
              }}
            />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredExperiments.map((experiment, index) => {
              const normalizedStatus = String(experiment.effectiveStatus || "").toLowerCase();
              const statusLabel =
                normalizedStatus === "locked"
                  ? "Locked"
                  : normalizedStatus === "unlocked"
                    ? "Unlocked"
                    : getStatusConfig(experiment.effectiveStatus).label;
              const showMarks =
                (normalizedStatus === "evaluated" || normalizedStatus === "completed") &&
                Number(experiment.finalMarks || 0) > 0;
              const isLocked = normalizedStatus === "locked";
              const toneClass =
                normalizedStatus === "completed" || normalizedStatus === "evaluated"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : normalizedStatus === "draft"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : normalizedStatus === "submitted"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : normalizedStatus === "locked"
                        ? "border-slate-300 bg-slate-100 text-slate-600"
                        : "border-indigo-200 bg-indigo-50 text-indigo-700";
              return (
                <motion.div
                  key={experiment.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.18, ease: "easeOut" }}
                  whileHover={{ y: -3, scale: 1.01 }}
                  className="student-card-interactive student-row faculty-surface relative min-h-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/40 transition-all duration-200 hover:border-blue-200 hover:shadow-[0_10px_24px_rgba(37,99,235,0.12)]"
                >
                  <div className="p-5">
                    <div className="mb-4 flex items-start gap-3">
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-sm font-bold ${toneClass}`}>
                        {experiment.experimentNo}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{experiment.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{getWorkspaceHint(experiment.effectiveStatus)}</p>
                      </div>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className={`student-status-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
                        {statusLabel}
                      </span>
                      {showMarks && (
                        <span className="student-status-badge inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          {experiment.finalMarks}/10
                        </span>
                      )}
                      {showMarks && (
                        <span className="student-status-badge inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Faculty Verified
                        </span>
                      )}
                    </div>

                    <div className="mt-auto">
                      <button
                        type="button"
                        onClick={() => {
                          if (isLocked) return;
                          const subjectQuery = subjectId ? `?subject=${encodeURIComponent(subjectId)}` : "";
                          navigate(`/student/experiments/${experiment.experimentId}/submit${subjectQuery}`);
                        }}
                        disabled={isLocked}
                        className={`min-h-[44px] rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          isLocked
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}
                      >
                        {getOpenLabel(experiment.effectiveStatus)}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
