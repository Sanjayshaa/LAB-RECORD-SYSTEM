import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ShellCard from "@/components/admin/ShellCard";

/**
 * Proctor monitoring tables — embedded in Reports; no AdminShell.
 */
export default function AdminProctorPanel() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [violations, setViolations] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sessionsRes, violationsRes] = await Promise.all([
          supabase
            .from("exam_sessions")
            .select("id, student_id, exam_id, status, suspicion_score, start_time, end_time")
            .order("start_time", { ascending: false })
            .limit(50),
          supabase
            .from("violations")
            .select("id, session_id, violation_type, confidence, timestamp")
            .order("timestamp", { ascending: false })
            .limit(100),
        ]);

        if (!sessionsRes.error) {
          setSessions(sessionsRes.data || []);
        }
        if (!violationsRes.error) {
          setViolations(violationsRes.data || []);
        }
      } catch (error) {
        console.error("Failed loading proctor dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    void loadData();

    const channel = supabase
      .channel("admin-proctor-panel-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_sessions" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "violations" },
        () => void loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const activeSessions = sessions.filter((session) => session.status === "active");

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Loading proctor data...
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ShellCard title={`Active sessions (${activeSessions.length})`} glow="cyan">
        {activeSessions.length === 0 ? (
          <p className="text-sm text-slate-500">No active proctor sessions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="pb-2 pr-2">Session</th>
                  <th className="pb-2 pr-2">Student</th>
                  <th className="pb-2 pr-2">Exam</th>
                  <th className="pb-2 pr-2">Score</th>
                  <th className="pb-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 pr-2 font-mono text-xs text-slate-800">{row.id}</td>
                    <td className="py-2 pr-2 text-slate-700">{row.student_id || "—"}</td>
                    <td className="py-2 pr-2 text-slate-700">{row.exam_id || "—"}</td>
                    <td className="py-2 pr-2 text-slate-700">{row.suspicion_score ?? 0}</td>
                    <td className="py-2 text-slate-600">{row.start_time || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShellCard>

      <ShellCard title={`Recent violations (${violations.length})`} glow="amber">
        {violations.length === 0 ? (
          <p className="text-sm text-slate-500">No violations logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="pb-2 pr-2">Time</th>
                  <th className="pb-2 pr-2">Session</th>
                  <th className="pb-2 pr-2">Type</th>
                  <th className="pb-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">{row.timestamp || "—"}</td>
                    <td className="py-2 pr-2 font-mono text-xs text-slate-700">{row.session_id || "—"}</td>
                    <td className="py-2 pr-2 text-slate-700">{row.violation_type || "—"}</td>
                    <td className="py-2 text-slate-700">{row.confidence ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShellCard>
    </div>
  );
}
