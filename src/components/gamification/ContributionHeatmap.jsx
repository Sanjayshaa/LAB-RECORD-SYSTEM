import { useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonday(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getIntensityClass(count) {
  if (count === 0) return "bg-slate-100";
  if (count === 1) return "bg-emerald-500/30";
  if (count === 2) return "bg-emerald-500/55";
  return "bg-emerald-500/85";
}

export default function ContributionHeatmap({ submissions = [], weeks = 12 }) {
  const { weekColumns, monthLabels, total } = useMemo(() => {
    const counts = {};
    submissions.forEach((s) => {
      const raw = s.updated_at || s.created_at;
      if (!raw) return;
      const d = new Date(raw);
      const key = getDateKey(d);
      counts[key] = (counts[key] || 0) + 1;
    });

    const safeWeeks = Math.max(4, Number(weeks) || 12);
    const now = new Date();
    const thisMonday = startOfMonday(now);
    const firstMonday = new Date(thisMonday);
    firstMonday.setDate(firstMonday.getDate() - (safeWeeks - 1) * 7);

    const cols = [];
    for (let col = 0; col < safeWeeks; col += 1) {
      const days = [];
      for (let row = 0; row < 7; row += 1) {
        const date = new Date(firstMonday);
        date.setDate(firstMonday.getDate() + col * 7 + row);
        const key = getDateKey(date);
        days.push({ key, date, count: counts[key] || 0 });
      }
      cols.push(days);
    }

    const labels = [];
    let prevMonth = -1;
    cols.forEach((colDays, colIdx) => {
      const month = colDays[0].date.getMonth();
      if (colIdx === 0 || month !== prevMonth) {
        labels.push({
          col: colIdx,
          label: colDays[0].date.toLocaleString("default", { month: "short" }),
        });
      }
      prevMonth = month;
    });

    const submissionTotal = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { weekColumns: cols, monthLabels: labels, total: submissionTotal };
  }, [submissions, weeks]);

  return (
    <motion.div
      className="faculty-surface rounded-2xl p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600">
            <Calendar className="h-4 w-4 text-white" />
          </div>
          <h3 className="font-semibold text-slate-900">Submission Activity</h3>
        </div>
        <span className="text-sm font-medium text-emerald-700">{total} submissions</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="min-w-[760px]">
          {/* Month labels */}
          <div className="mb-2 grid items-center gap-1.5" style={{ gridTemplateColumns: `36px repeat(${weekColumns.length}, minmax(0, 1fr))` }}>
            <div />
            {Array.from({ length: weekColumns.length }).map((_, colIdx) => {
              const month = monthLabels.find((item) => item.col === colIdx);
              return (
                <div key={`month-${colIdx}`} className="h-4 text-[10px] text-slate-500">
                  {month ? month.label : ""}
                </div>
              );
            })}
          </div>

          {/* Grid */}
          <div className="space-y-1">
            {DAY_LABELS.map((label, rowIdx) => (
              <div
                key={label}
                className="grid items-center gap-1.5"
                style={{ gridTemplateColumns: `36px repeat(${weekColumns.length}, minmax(0, 1fr))` }}
              >
                <div className="text-[10px] text-slate-500">{rowIdx % 2 === 0 ? label : ""}</div>
                {weekColumns.map((colDays, colIdx) => {
                  const cell = colDays[rowIdx];
                  return (
                    <div
                      key={`${colIdx}-${cell.key}`}
                      className={`h-3 w-3 rounded-sm transition-colors ${getIntensityClass(cell.count)}`}
                      title={`${cell.date.toLocaleDateString()} - ${cell.count} submission${cell.count !== 1 ? "s" : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
