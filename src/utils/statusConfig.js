const STATUS_CONFIG = Object.freeze({
  draft: {
    key: "draft",
    label: "Draft",
    icon: "FileEdit",
    tone: "draft",
    color: "text-amber-300",
    dot: "bg-amber-400",
    background: "bg-amber-500/10 border border-amber-500/30",
  },
  submitted: {
    key: "submitted",
    label: "Submitted",
    icon: "Send",
    tone: "submitted",
    color: "text-sky-300",
    dot: "bg-sky-400",
    background: "bg-sky-500/10 border border-sky-500/30",
  },
  evaluated: {
    key: "evaluated",
    label: "Evaluated",
    icon: "CheckCircle2",
    tone: "completed",
    color: "text-emerald-300",
    dot: "bg-emerald-400",
    background: "bg-emerald-500/10 border border-emerald-500/30",
  },
  completed: {
    key: "completed",
    label: "Completed",
    icon: "CheckCircle2",
    tone: "completed",
    color: "text-emerald-300",
    dot: "bg-emerald-400",
    background: "bg-emerald-500/10 border border-emerald-500/30",
  },
  resubmit: {
    key: "resubmit",
    label: "Resubmit",
    icon: "RotateCcw",
    tone: "resubmit",
    color: "text-rose-300",
    dot: "bg-rose-400",
    background: "bg-rose-500/10 border border-rose-500/30",
  },
  pending: {
    key: "pending",
    label: "Pending",
    icon: "Clock3",
    tone: "pending",
    color: "text-slate-300",
    dot: "bg-slate-400",
    background: "bg-slate-500/10 border border-slate-500/30",
  },
});

export function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export function getStatusConfig(status) {
  const normalized = normalizeStatus(status);
  const legacyAlias = normalized === "approved" ? "completed" : normalized;
  const completedAlias = legacyAlias === "evaluated" ? "completed" : legacyAlias;
  const fallbackAlias = completedAlias === "rejected" ? "resubmit" : completedAlias;
  const base = STATUS_CONFIG[fallbackAlias] || STATUS_CONFIG.pending;
  return {
    normalized,
    ...base,
  };
}

export default STATUS_CONFIG;
