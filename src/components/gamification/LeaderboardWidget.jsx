import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Medal, Users } from "lucide-react";
import { getLeaderboard } from "@/services/studentGamificationService";

const podiumConfig = [
  { place: 1, order: "order-2", barH: "h-28", medal: "from-amber-400 to-yellow-500", ring: "ring-amber-400/40", label: "1st" },
  { place: 0, order: "order-1", barH: "h-20", medal: "from-slate-300 to-slate-400", ring: "ring-slate-300/30", label: "2nd" },
  { place: 2, order: "order-3", barH: "h-14", medal: "from-amber-600 to-amber-700", ring: "ring-amber-700/30", label: "3rd" },
];

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function LeaderboardWidget({ department, currentUserId }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await getLeaderboard(department, 5, currentUserId);
        if (mounted) setRows(data);
      } catch (error) {
        console.error("LeaderboardWidget load error:", error);
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [department, currentUserId]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const hasTop3 = top3.length >= 3;

  const currentUserInTop5 = rows.slice(0, 5).some((r) => r.user_id === currentUserId);
  const appendedUser = !currentUserInTop5 && rows.length > 5 ? rows[rows.length - 1] : null;
  const displayRest = appendedUser
    ? rest.filter((r) => r.user_id !== appendedUser.user_id)
    : rest;

  return (
    <motion.div
      className="faculty-surface rounded-2xl p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
          <Crown className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-semibold text-slate-900">Leaderboard</h3>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="student-shimmer h-10 rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <Users className="w-7 h-7 text-slate-500" />
          </div>
          <p className="text-sm text-slate-500">No rankings available yet</p>
        </div>
      ) : (
        <div>
          {hasTop3 && (
            <div className="flex items-end justify-center gap-3 mb-6 pt-4">
              {podiumConfig.map(({ place, order, barH, medal, ring, label }) => {
                const entry = top3[place];
                if (!entry) return null;
                const isCurrent = entry.user_id === currentUserId;

                return (
                  <motion.div
                    key={entry.user_id}
                    className={`flex flex-col items-center ${order} flex-1 max-w-[120px]`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + place * 0.1, duration: 0.5, ease: "easeOut" }}
                  >
                    <div className={`relative mb-2 ${isCurrent ? "ring-2 ring-indigo-500/50 rounded-full" : ""}`}>
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${medal} flex items-center justify-center ring-2 ${ring}`}>
                        <span className="text-sm font-bold text-white">{getInitials(entry.name)}</span>
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br ${medal} flex items-center justify-center border-2 border-white`}>
                        <span className="text-[9px] font-bold text-white">{label}</span>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-slate-800 truncate max-w-full text-center">
                      {isCurrent ? "You" : entry.name}
                    </p>
                    <p className="text-[10px] text-slate-500">{entry.xp_points} XP</p>
                    <motion.div
                      className={`w-full ${barH} rounded-t-lg bg-gradient-to-t ${medal} opacity-20 mt-2`}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.3 + place * 0.1, duration: 0.6, ease: "easeOut" }}
                      style={{ transformOrigin: "bottom" }}
                    />
                  </motion.div>
                );
              })}
            </div>
          )}

          {displayRest.length > 0 && (
            <div className="space-y-2">
              {displayRest.map((row, i) => {
                const isCurrent = row.user_id === currentUserId;
                return (
                  <motion.div
                    key={`${row.user_id}-${row.rank}`}
                    className={`flex items-center justify-between text-sm rounded-lg border px-3 py-2.5 ${
                      isCurrent
                        ? "bg-indigo-50 border-indigo-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-mono text-slate-500">{row.rank}</span>
                      <span className={isCurrent ? "font-medium text-indigo-700" : "text-slate-800"}>
                        {isCurrent ? "You" : row.name}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-600">{row.xp_points} XP</span>
                  </motion.div>
                );
              })}
            </div>
          )}

          {appendedUser && (
            <>
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Your Rank</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <motion.div
                className="flex items-center justify-between text-sm rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-xs font-mono text-indigo-600">{appendedUser.rank}</span>
                  <span className="font-medium text-indigo-700">You</span>
                </div>
                <span className="text-xs font-medium text-indigo-600">{appendedUser.xp_points} XP</span>
              </motion.div>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
