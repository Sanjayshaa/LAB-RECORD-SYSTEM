import { supabase } from "@/lib/supabase";

/**
 * Records a tab-switch / visibility loss for faculty exam monitoring.
 * Writes to `exam_activity_logs` (event: tab_switch) — the table faculty UIs aggregate.
 */
export async function logExamTabSwitchEvent(
  examId: string | null | undefined,
  registerNo: string | null | undefined
): Promise<void> {
  const eid = typeof examId === "string" ? examId.trim() : "";
  const reg = typeof registerNo === "string" ? registerNo.trim() : "";
  if (!eid || !reg) return;

  try {
    const { error } = await supabase.from("exam_activity_logs").insert({
      exam_id: eid,
      register_no: reg,
      event: "tab_switch",
    });
    if (error) {
      // RLS or network — keep exam running; no user-facing noise
      return;
    }
  } catch {
    // ignore
  }
}
