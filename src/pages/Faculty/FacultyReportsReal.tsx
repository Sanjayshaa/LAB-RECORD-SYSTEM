import { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import { sortByExperimentNo } from "@/utils/experimentOrder";

type ReportRow = {
  id: string;
  full_name: string;
  register_no: string;
  department: string;
  year: string;
  semester: string;
  experiment_no: string | number | null;
  title: string;
  faculty_marks: number | null;
  ai_marks: number | null;
};

const finalMarks = (row: { faculty_marks?: number | null; ai_marks?: number | null }) =>
  Number(row.faculty_marks ?? row.ai_marks ?? 0);

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();
const extractNumericToken = (value: unknown) => {
  const text = normalizeText(value);
  const direct = text.match(/\d+/)?.[0];
  if (direct) return direct;
  const romanMap: Record<string, string> = {
    i: "1",
    ii: "2",
    iii: "3",
    iv: "4",
    v: "5",
    vi: "6",
    vii: "7",
    viii: "8",
  };
  return romanMap[text] || "";
};
const canonicalDepartment = (value: unknown) =>
  normalizeText(value).replace(/[^a-z0-9]/g, "");
const sameDepartment = (a: unknown, b: unknown) => {
  const left = canonicalDepartment(a);
  const right = canonicalDepartment(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
};
const sameAcademicToken = (a: unknown, b: unknown) => {
  const left = extractNumericToken(a);
  const right = extractNumericToken(b);
  if (!left || !right) return false;
  return left === right;
};

function downloadCsv(rows: ReportRow[]) {
  const headers = ["full_name", "register_no", "experiment_no", "title", "final_marks"];
  const lines = rows.map((row) =>
    [row.full_name, row.register_no, row.experiment_no ?? "", row.title, finalMarks(row)].join(",")
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "faculty-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(rows: ReportRow[]) {
  const doc = new jsPDF();
  autoTable(doc, {
    head: [["Student", "Register No", "Experiment No", "Title", "Final Marks"]],
    body: rows.map((row) => [
      row.full_name,
      row.register_no,
      String(row.experiment_no ?? "-"),
      row.title,
      String(finalMarks(row)),
    ]),
    styles: { fontSize: 9 },
  });
  doc.save("faculty-report.pdf");
}

export default function FacultyReportsReal() {
  const subjectId = localStorage.getItem("faculty_subject_id");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError("");
    const { data: subjectMeta, error: subjectError } = await supabase
      .from("subjects")
      .select("id, department, year, semester")
      .eq("id", subjectId)
      .maybeSingle();
    if (subjectError) {
      setError(subjectError.message);
      setLoading(false);
      return;
    }
    const { data, error: loadError } = await supabase
      .from("full_student_data")
      .select(
        "id, student_id, subject_id, experiment_no, title, faculty_marks, ai_marks, student_name, name, register_no, register_number, department, year, semester"
      )
      .eq("subject_id", subjectId)
      .order("experiment_no", { ascending: true });
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const mapped = sortByExperimentNo(
      (data || [])
      .map((row: any) => ({
        id: String(row.id || `${row.student_id || "unknown"}-${row.experiment_no || "0"}`),
        full_name: String(row.student_name || row.name || "").trim(),
        register_no: String(row.register_no || row.register_number || "").trim(),
        department: String(row.department || "").trim(),
        year: String(row.year || "").trim(),
        semester: String(row.semester || "").trim(),
        experiment_no: row.experiment_no ?? null,
        title: String(row.title || "Experiment"),
        faculty_marks: row.faculty_marks ?? null,
        ai_marks: row.ai_marks ?? null,
      })),
      (row) => row.experiment_no
    )
      .filter((row) => row.full_name && row.register_no)
      .filter((row) => {
        const hasDeptRule = Boolean(subjectMeta?.department);
        const hasYearRule = Boolean(subjectMeta?.year);
        const hasSemesterRule = Boolean(subjectMeta?.semester);
        if (hasDeptRule && !sameDepartment(row.department, subjectMeta?.department)) return false;
        if (hasYearRule && !sameAcademicToken(row.year, subjectMeta?.year)) return false;
        if (hasSemesterRule && !sameAcademicToken(row.semester, subjectMeta?.semester)) return false;
        return true;
      });
    setRows(mapped);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + finalMarks(row), 0), [rows]);

  return (
    <div className="space-y-4 text-slate-800">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Faculty Reports</h1>
      </div>
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (!rows || rows.length === 0) return;
            downloadCsv(rows);
          }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
        >
          Download CSV
        </button>
        <button
          onClick={() => {
            if (!rows || rows.length === 0) return;
            downloadPdf(rows);
          }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
        >
          Download PDF
        </button>
        <span className="text-xs text-slate-500">Total Marks: {total}</span>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
      {!loading && (!rows || rows.length === 0) ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No submissions found
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Register No</th>
                <th className="px-4 py-3 text-left">Experiment No</th>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Final Marks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{row.full_name}</td>
                  <td className="px-4 py-3">{row.register_no}</td>
                  <td className="px-4 py-3">{row.experiment_no ?? "-"}</td>
                  <td className="px-4 py-3">{row.title}</td>
                  <td className="px-4 py-3">{finalMarks(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
