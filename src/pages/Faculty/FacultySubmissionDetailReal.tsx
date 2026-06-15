import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Brain, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateSubmissionMarks } from "@/services/facultyDataService";
import { evaluateSubmissionContent } from "@/utils/evaluationEngine";
import { evaluateWithLocalModel } from "@/services/localModelEvaluator";

type DetailRow = {
  id: string;
  student_id: string | null;
  subject_id: string | null;
  exp_id: string | null;
  student_name: string | null;
  register_no: string | null;
  experiment_title: string | null;
  experiment_no: number | null;
  aim: string | null;
  procedure: string | null;
  program: string | null;
  output: string | null;
  result: string | null;
  attachments: string[];
  marks: number | null;
  faculty_marks: number | null;
  status: string | null;
};

function parseAttachments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || "").trim()).filter(Boolean);
        }
      } catch (_error) {
        return [];
      }
    }
    return [trimmed];
  }
  return [];
}

type AiEvaluationDisplay = {
  ai_score: number | null;
  confidence: number | null;
  status: string | null;
  breakdown: Record<string, number> | null;
  marksOutOf10: number;
  source: "database" | "local" | "local_model";
};

let aiEvaluationsTableUnsupported = false;

function formatAiScoreOutOf10(aiScore: number | null | undefined): string {
  if (aiScore == null || !Number.isFinite(Number(aiScore))) return "—";
  const raw = Number(aiScore);
  const out10 = raw > 10 ? raw / 10 : raw;
  return `${out10.toFixed(1)} / 10`;
}

async function fetchAiEvaluationFromDb(submissionId: string): Promise<AiEvaluationDisplay | null> {
  if (aiEvaluationsTableUnsupported) return null;
  const submissionIdText = String(submissionId || "").trim();
  if (!submissionIdText) return null;
  const idForQuery = /^\d+$/.test(submissionIdText) ? Number(submissionIdText) : submissionIdText;
  const selectCandidates = [
    "submission_id, ai_score, predicted_score, confidence, status, breakdown",
    "submission_id, ai_score, predicted_score, confidence, status",
    "submission_id, ai_score, predicted_score",
    "submission_id, ai_score",
    "submission_uuid, ai_score, predicted_score, confidence, status, breakdown",
    "submission_uuid, ai_score, predicted_score",
    "submission_uuid, ai_score",
  ];
  const filters: Array<{ key: string; value: string | number }> = [
    { key: "submission_id", value: idForQuery as string | number },
    { key: "submission_uuid", value: submissionIdText },
  ];

  for (const filter of filters) {
    for (const selectClause of selectCandidates) {
      const res = await supabase
        .from("ai_evaluations")
        .select(selectClause)
        .eq(filter.key, filter.value as any)
        .maybeSingle();
      if (res.error) {
        aiEvaluationsTableUnsupported = true;
        return null;
      }
      if (!res.data) continue;
      const row = res.data as Record<string, unknown>;
      const aiRaw = row.ai_score ?? row.predicted_score;
      const aiNum = aiRaw != null ? Number(aiRaw) : null;
      const marksOutOf10 =
        aiNum != null && Number.isFinite(aiNum) ? (aiNum > 10 ? aiNum / 10 : aiNum) : 0;
      return {
        ai_score: aiNum,
        confidence: row.confidence != null ? Number(row.confidence) : null,
        status: row.status != null ? String(row.status) : null,
        breakdown:
          row.breakdown && typeof row.breakdown === "object" && !Array.isArray(row.breakdown)
            ? (row.breakdown as Record<string, number>)
            : null,
        marksOutOf10: Math.max(0, Math.min(10, marksOutOf10)),
        source: "database",
      };
    }
  }
  return null;
}

function computeLocalAi(row: DetailRow): AiEvaluationDisplay {
  const evaluated = evaluateSubmissionContent({
    aim: row.aim,
    algorithm: row.procedure,
    program: row.program,
    output: row.output,
    result: row.result,
    experimentId: row.exp_id,
    autoGenerateIfEmpty: true,
  });
  return {
    ai_score: evaluated.aiScore,
    confidence: evaluated.confidence,
    status: evaluated.status,
    breakdown: evaluated.breakdown,
    marksOutOf10: evaluated.marksOutOf10,
    source: "local",
  };
}

async function computeLocalModelAi(row: DetailRow): Promise<AiEvaluationDisplay> {
  const result = await evaluateWithLocalModel({
    aim: row.aim,
    procedure: row.procedure,
    program: row.program,
    output: row.output,
    result: row.result,
    experimentTitle: row.experiment_title,
    experimentId: row.exp_id,
  });
  return {
    ai_score: result.ai_score,
    confidence: result.confidence,
    status: result.status,
    breakdown: result.breakdown,
    marksOutOf10: result.marksOutOf10,
    source: result.source,
  };
}

function isLikelyImage(url: string): boolean {
  const normalized = String(url || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("data:image/")) return true;
  return (
    normalized.includes(".png") ||
    normalized.includes(".jpg") ||
    normalized.includes(".jpeg") ||
    normalized.includes(".gif") ||
    normalized.includes(".webp")
  );
}

export default function FacultySubmissionDetailReal() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [row, setRow] = useState<DetailRow | null>(null);
  const [marks, setMarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [aiEval, setAiEval] = useState<AiEvaluationDisplay | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const marksInputRef = useRef<HTMLInputElement | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    let submissionId = String(id).trim();
    if (submissionId.startsWith("roster-")) {
      setError("No submission exists for this roster entry yet.");
      setRow(null);
      setLoading(false);
      return;
    }
    const isNumericSubmissionId = /^\d+$/.test(submissionId);
    const directSubmission = isNumericSubmissionId
      ? await supabase.from("submissions").select("*").eq("id", Number(submissionId)).maybeSingle()
      : ({ data: null, error: null } as any);
    const directSubmissionRow = (directSubmission.data || null) as any;
    if (directSubmission.error) {
      setError(directSubmission.error.message);
      setRow(null);
      setLoading(false);
      return;
    }

    if (!directSubmissionRow) {
      const lookup = await supabase
        .from("full_student_data")
        .select("student_id, subject_id, exp_id, experiment_no")
        .eq("id", submissionId)
        .maybeSingle();
      if (lookup.error) {
        setError(lookup.error.message);
        setRow(null);
        setLoading(false);
        return;
      }
      const ctx = lookup.data || null;
      const studentId = String(ctx?.student_id || "").trim();
      const subjectId = String(ctx?.subject_id || "").trim();
      const expId = String(ctx?.exp_id || "").trim();
      const experimentNo = ctx?.experiment_no == null ? null : Number(ctx.experiment_no);

      if (!studentId || !subjectId) {
        setError("Submission context not found for this record.");
        setRow(null);
        setLoading(false);
        return;
      }

      const submissionQueries: Array<() => Promise<any>> = [];
      if (expId) {
        submissionQueries.push(() =>
          supabase
            .from("submissions")
            .select("id")
            .eq("student_id", studentId)
            .eq("subject_id", subjectId)
            .eq("exp_id", expId)
            .limit(1)
        );
      }
      if (Number.isFinite(experimentNo)) {
        submissionQueries.push(() =>
          supabase
            .from("submissions")
            .select("id")
            .eq("student_id", studentId)
            .eq("subject_id", subjectId)
            .eq("experiment_no", experimentNo)
            .limit(1)
        );
      }
      submissionQueries.push(() =>
        supabase
          .from("submissions")
          .select("id")
          .eq("student_id", studentId)
          .eq("subject_id", subjectId)
          .limit(1)
      );

      let resolvedSubmissionId = "";
      let resolveError: string | null = null;
      for (const runQuery of submissionQueries) {
        const response: any = await runQuery();
        if (response.error) {
          resolveError = response.error.message || "Submission lookup failed.";
          continue;
        }
        const candidate = Array.isArray(response.data) ? response.data[0] : null;
        const candidateId = String(candidate?.id || "").trim();
        if (candidateId) {
          resolvedSubmissionId = candidateId;
          break;
        }
      }

      if (!resolvedSubmissionId) {
        setError(resolveError || "Submission id not found for this record.");
        setRow(null);
        setLoading(false);
        return;
      }
      submissionId = resolvedSubmissionId;
    }

    const submissionResponse = directSubmissionRow
      ? ({ data: directSubmissionRow, error: null } as any)
      : await supabase.from("submissions").select("*").eq("id", submissionId).maybeSingle();
    const data = (submissionResponse.data || null) as any;
    const loadError = submissionResponse.error as { message: string } | null;

    if (loadError) {
      setError(loadError.message);
      setRow(null);
    } else {
      const submissionRow = data || null;
      const studentId = String(submissionRow?.student_id || "").trim();
      const expId = String(submissionRow?.exp_id || "").trim();
      const subjectId = String(submissionRow?.subject_id || "").trim();

      const [profileRes, expRes, fullRes] = await Promise.all([
        studentId
          ? supabase.from("profiles").select("name, register_no").eq("id", studentId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        expId
          ? supabase.from("experiments").select("title, experiment_no").eq("id", expId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        studentId && subjectId
          ? supabase
              .from("full_student_data")
              .select("student_name,name,register_no,register_number,title,experiment_title,experiment_no")
              .eq("student_id", studentId)
              .eq("subject_id", subjectId)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const resolvedStudentName = String(
        profileRes?.data?.name ||
          submissionRow?.student_name ||
          submissionRow?.name ||
          fullRes?.data?.student_name ||
          fullRes?.data?.name ||
          ""
      ).trim();
      const resolvedRegisterNo = String(
        profileRes?.data?.register_no ||
          submissionRow?.register_no ||
          submissionRow?.register_number ||
          fullRes?.data?.register_no ||
          fullRes?.data?.register_number ||
          ""
      ).trim();
      const resolvedExperimentTitle = String(
        expRes?.data?.title || fullRes?.data?.title || fullRes?.data?.experiment_title || ""
      ).trim();
      const resolvedExperimentNo =
        expRes?.data?.experiment_no == null
          ? fullRes?.data?.experiment_no == null
            ? null
            : Number(fullRes.data.experiment_no)
          : Number(expRes.data.experiment_no);

      const mergedRow: DetailRow | null = submissionRow
        ? {
            id: String(submissionRow.id || submissionId),
            student_id: submissionRow.student_id ? String(submissionRow.student_id) : null,
            subject_id: submissionRow.subject_id ? String(submissionRow.subject_id) : null,
            exp_id: submissionRow.exp_id ? String(submissionRow.exp_id) : null,
            student_name: resolvedStudentName || null,
            register_no: resolvedRegisterNo || null,
            experiment_title: resolvedExperimentTitle || null,
            experiment_no: Number.isFinite(Number(resolvedExperimentNo)) ? Number(resolvedExperimentNo) : null,
            aim: submissionRow.aim ?? null,
            procedure: submissionRow.procedure ?? null,
            program: submissionRow.program ?? null,
            output: submissionRow.output ?? null,
            result: submissionRow.result ?? null,
            attachments: parseAttachments(submissionRow.attachments ?? submissionRow.images),
            marks: submissionRow.marks ?? submissionRow.faculty_marks ?? null,
            faculty_marks: submissionRow.faculty_marks ?? null,
            status: submissionRow.status ?? null,
          }
        : null;

      setRow(mergedRow);
      const resolvedMarks =
        submissionRow?.marks == null ? submissionRow?.faculty_marks : submissionRow?.marks;
      setMarks(
        resolvedMarks == null || Number.isNaN(Number(resolvedMarks))
          ? ""
          : String(resolvedMarks)
      );
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!row?.id) {
      setAiEval(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      try {
        if (cancelled) return;
        // DB ai_evaluations schema varies across deployments; use local model directly to avoid 400 loops.
        setAiEval(await computeLocalModelAi(row));
      } catch {
        if (!cancelled) setAiEval(computeLocalAi(row));
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row]);

  const refreshLocalAi = useCallback(async () => {
    if (!row?.id) return;
    setAiRefreshing(true);
    setError("");
    try {
      // Recalculate from currently loaded submission content to avoid schema-specific 400 queries.
      setAiEval(await computeLocalModelAi(row));
    } catch {
      setAiEval(computeLocalAi(row));
    } finally {
      setAiRefreshing(false);
    }
  }, [row]);

  const applyAiSuggestionToMarks = useCallback(() => {
    if (!aiEval) return;
    const v = Math.max(0, Math.min(10, aiEval.marksOutOf10));
    setMarks(String(Number.isInteger(v) ? v : Math.round(v * 10) / 10));
    setSuccessMessage("AI suggestion copied to marks field. Click Save Evaluation to persist.");
    window.setTimeout(() => {
      marksInputRef.current?.focus();
      marksInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }, [aiEval]);

  const finalMarks = useMemo(() => {
    if (!row) return 0;
    return Number(row.marks ?? row.faculty_marks ?? 0);
  }, [row]);

  const saveMarks = useCallback(async () => {
    if (!row) return;
    const value = Number(marks);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      setError("Marks must be between 0 and 10.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccessMessage("");
    try {
      const result = await updateSubmissionMarks({
        submissionId: row.id,
        marks: value,
        subjectId: row.subject_id || undefined,
        studentId: row.student_id || undefined,
        experimentId: row.exp_id || undefined,
      });
      if (!result.success) {
        setError(result.error || "Failed to save marks.");
        return;
      }
      setRow((prev) =>
        prev
          ? {
              ...prev,
              marks: value,
              faculty_marks: value,
              status: "evaluated",
            }
          : prev
      );
      setSuccessMessage("Evaluation saved successfully.");
      window.setTimeout(() => {
        navigate("/faculty/submissions");
      }, 1000);
      void fetchData();
    } catch (_error) {
      setError("Failed to save marks. Please retry.");
    } finally {
      setSaving(false);
    }
  }, [marks, row, fetchData, navigate]);

  return (
    <div className="space-y-4 text-slate-800">
      <button
        onClick={() => navigate("/faculty/submissions")}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {successMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {!loading && !row ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No submissions found
        </div>
      ) : null}

      {row ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Submission Details</h2>
            <p className="text-sm text-slate-700">
              Student: <span className="font-medium">{row.student_name || "Unknown Student"}</span>
            </p>
            <p className="text-sm text-slate-700">
              Register No: <span className="font-medium">{row.register_no || "-"}</span>
            </p>
            <p className="text-sm text-slate-700">
              Experiment:{" "}
              <span className="font-medium">
                {row.experiment_no ? `Experiment ${row.experiment_no} - ` : ""}
                {row.experiment_title || "Experiment"}
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Student Answer</h2>
            <Field title="Aim" value={row.aim} />
            <Field title="Procedure" value={row.procedure} />
            <Field title="Program" value={row.program} />
            <Field title="Output" value={row.output} />
            <Field title="Result" value={row.result} />
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Attachment Photos</p>
              {row.attachments.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No attachment photos uploaded.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {row.attachments.map((fileUrl, index) => {
                    const imageLike = isLikelyImage(fileUrl);
                    return (
                      <div key={`${fileUrl}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        {imageLike ? (
                          <a href={fileUrl} target="_blank" rel="noreferrer" className="block">
                            <img
                              src={fileUrl}
                              alt={`Student attachment ${index + 1}`}
                              className="h-40 w-full rounded-md object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700"
                          >
                            Open attachment {index + 1}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-900">AI-assisted evaluation</h2>
              </div>
              {aiEval ? (
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-indigo-200">
                  {aiEval.source === "database"
                    ? "Saved with submission"
                    : aiEval.source === "local_model"
                      ? "Calculated with local model"
                      : "Calculated on this page"}
                </span>
              ) : null}
            </div>
            <p className="mb-4 text-xs text-slate-600">
              Suggested score from rules (length, structure, keywords). Use as a guide — you always set final marks below.
            </p>
            {aiLoading ? (
              <p className="text-sm text-slate-500">Loading AI evaluation…</p>
            ) : aiEval ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">AI score (suggested)</p>
                    <p className="mt-1 text-2xl font-bold text-indigo-700">
                      {formatAiScoreOutOf10(aiEval.ai_score)}
                    </p>
                    <p className="text-xs text-slate-500">≈ {aiEval.marksOutOf10.toFixed(1)} / 10 marks</p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Confidence</p>
                    <p className="mt-1 text-2xl font-bold text-slate-800">
                      {aiEval.confidence != null ? `${Math.round(aiEval.confidence)}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
                    <p className="mt-1 text-lg font-semibold text-slate-800">{aiEval.status || "—"}</p>
                  </div>
                </div>
                {aiEval.breakdown && Object.keys(aiEval.breakdown).length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Section breakdown (0–100)</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(aiEval.breakdown).map(([key, val]) => (
                        <span
                          key={key}
                          className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                        >
                          {key}: {Math.round(Number(val))}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshLocalAi()}
                    disabled={aiRefreshing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    {aiRefreshing ? "Recalculating..." : "Recalculate from answers"}
                  </button>
                  <button
                    type="button"
                    onClick={applyAiSuggestionToMarks}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Copy suggestion to marks field
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No evaluation data available.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Saved Final Marks: {finalMarks}</p>
            <p className="mt-1 text-xs text-slate-500">
              Marks to save: {marks.trim() === "" ? "—" : marks}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                ref={marksInputRef}
                type="number"
                min="0"
                max="10"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() => void saveMarks()}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Evaluation"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Field({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{title}</p>
      <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        {String(value || "-")}
      </pre>
    </div>
  );
}
