import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";
import EmptyState from "@/components/admin/EmptyState";
import { supabase } from "@/lib/supabase";
import { formatDepartmentName, formatDepartmentNameUpper } from "@/utils/departmentLabel";
import AdminProctorPanel from "@/pages/Admin/AdminProctorPanel.jsx";

type SubmissionRow = {
  id: string;
  student_name: string;
  experiment: string;
  status: string;
  marks: number;
  submitted_date: string;
  department: string;
};

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(value: string): string {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function normalizeDept(value: string): string {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function isFacultyLikeName(value: string): boolean {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return true;
  if (/^(mr|mrs|ms|miss|dr|prof|sir)\b/.test(name)) return true;
  if (name.includes("faculty") || name.includes("admin")) return true;
  return false;
}

function isValidRegisterNo(value: unknown): boolean {
  const registerNo = String(value || "").trim();
  if (!registerNo) return false;
  const lowered = registerNo.toLowerCase();
  return lowered !== "-" && lowered !== "null" && lowered !== "undefined";
}

function toCsv(rows: SubmissionRow[]): string {
  const headers = ["Student", "Experiment", "Status", "Marks", "Submission Date", "Department"];
  const body = rows.map((row) => [
    row.student_name,
    row.experiment,
    row.status,
    String(row.marks),
    row.submitted_date,
    row.department,
  ]);
  const lines = [headers, ...body].map((columns) =>
    columns
      .map((column) => `"${String(column || "").replaceAll('"', '""')}"`)
      .join(",")
  );
  return lines.join("\n");
}

export default function AdminSubmissions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const reportTab = searchParams.get("tab") === "proctor" ? "proctor" : "submissions";
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [department, setDepartment] = useState("");
  const [allowedDepartments, setAllowedDepartments] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase
        .from("profiles")
        .select("department")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      const adminDept = formatDepartmentNameUpper(data?.department || "", "");
      if (adminDept) {
        setAllowedDepartments([adminDept]);
        setDepartment(adminDept);
      } else {
        setAllowedDepartments([]);
        setDepartment("");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let profilesQuery = supabase
        .from("profiles")
        .select("id, name, register_no, role, department")
        .eq("role", "student");
      if (department) {
        profilesQuery = profilesQuery.ilike("department", department);
      }
      const { data: profiles, error: profileError } = await profilesQuery;
      if (profileError) throw profileError;

      const cleanProfiles = (profiles || []).filter((row) => {
        const name = String(row.name || "").trim();
        if (isFacultyLikeName(name)) return false;
        return isValidRegisterNo(row.register_no);
      });
      const studentIds = cleanProfiles.map((row) => String(row.id || "").trim()).filter(Boolean);
      if (studentIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const profileById = new Map(cleanProfiles.map((row) => [String(row.id), row]));
      const { data, error: fetchError } = await supabase
        .from("full_student_data")
        .select("*")
        .in("student_id", studentIds);
      if (fetchError) throw fetchError;

      const mapped = (data || [])
        .filter((row) => {
          const sid = String(row.student_id || "").trim();
          if (!sid || !profileById.has(sid)) return false;
          const profile = profileById.get(sid);
          const name = String(row.full_name || row.name || row.student_name || profile?.name || "").trim();
          if (isFacultyLikeName(name)) return false;
          if (!isValidRegisterNo(row.register_no || profile?.register_no)) return false;
          if (department) {
            const rowDept = formatDepartmentNameUpper(row.department || profile?.department || "", "");
            if (!rowDept || normalizeDept(rowDept) !== normalizeDept(department)) return false;
          }
          return true;
        })
        .map((row, index) => {
          const sid = String(row.student_id || "").trim();
          const profile = profileById.get(sid);
          return {
            id: String(row.id || `${row.student_id || "s"}-${index}`),
            student_name: String(row.full_name || row.name || row.student_name || profile?.name || "Student"),
            experiment: String(row.experiment_title || row.experiment_name || row.title || "Experiment"),
            status: String(row.status || "pending"),
            marks: toNumber(row.final_marks ?? row.faculty_marks ?? row.ai_marks ?? row.marks ?? 0),
            submitted_date: String(row.submitted_date || row.submission_date || row.updated_at || ""),
            department: formatDepartmentName(row.department || profile?.department, "Unassigned"),
          };
        });
      setRows(mapped);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedRows = useMemo(
    () =>
      rows
        .slice()
        .sort(
          (a, b) =>
            new Date(b.submitted_date || 0).getTime() -
            new Date(a.submitted_date || 0).getTime()
        ),
    [rows]
  );

  const downloadCsv = () => {
    if (!sortedRows.length) {
      setError("No records found for CSV export.");
      return;
    }
    const csv = toCsv(sortedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin_submissions_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!sortedRows.length) {
      setError("No records found for PDF export.");
      return;
    }
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(12);
    doc.text("Admin Submissions Report", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Student", "Experiment", "Status", "Marks", "Submission Date", "Department"]],
      body: sortedRows.map((row) => [
        row.student_name,
        row.experiment,
        row.status,
        String(row.marks),
        formatDate(row.submitted_date),
        row.department,
      ]),
      styles: { fontSize: 8 },
    });
    doc.save("admin_submissions_report.pdf");
  };

  return (
    <AdminShell title="Reports">
      <div className="col-span-12 mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            reportTab === "submissions"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Submissions
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: "proctor" })}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            reportTab === "proctor"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Proctor
        </button>
      </div>

      {reportTab === "proctor" ? (
        <div className="col-span-12 space-y-4">
          <p className="text-sm text-slate-600">
            Live exam sessions and violation events for your deployment.
          </p>
          <AdminProctorPanel />
        </div>
      ) : (
      <div className="col-span-12">
        <ShellCard title="All Submissions (full_student_data)">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              >
                {allowedDepartments.length === 0 ? (
                  <option value="">NO DEPARTMENT ASSIGNED</option>
                ) : (
                  allowedDepartments.map((dept) => (
                    <option key={dept} value={normalizeDept(dept)}>
                      {dept}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => void fetchData()}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                Refresh
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadCsv}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={downloadPdf}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                Download PDF
              </button>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">Loading submissions...</p>
          ) : sortedRows.length === 0 ? (
            <EmptyState title="No records found" description="No rows available in full_student_data." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-slate-600">Student</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Experiment</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Status</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Marks</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Submission Date</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Department</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedRows.map((row) => (
                    <tr key={row.id} className="bg-white">
                      <td className="px-4 py-2.5 text-slate-800">{row.student_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.experiment}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.status}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{row.marks}</td>
                      <td className="px-4 py-2.5 text-slate-600">{formatDate(row.submitted_date)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{formatDepartmentName(row.department, "Unassigned")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShellCard>
      </div>
      )}
    </AdminShell>
  );
}
