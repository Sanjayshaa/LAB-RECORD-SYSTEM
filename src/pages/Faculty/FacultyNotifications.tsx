import NotificationComposerCard from "@/components/notifications/NotificationComposerCard";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";
import { getFacultyInboxNotifications } from "@/services/studentNotificationsService";

export default function FacultyNotifications() {
  const [department, setDepartment] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; title: string; message: string; createdAt: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const result = await getFacultyInboxNotifications(10);
    if (result.success) {
      setMessages(
        result.data.map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
          createdAt: item.createdAt,
        }))
      );
    } else {
      setMessages([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data } = await supabase
        .from("profiles")
        .select("department")
        .eq("id", user.id)
        .maybeSingle();
      if (!mounted) return;
      setDepartment(String(data?.department || "").trim());
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  return (
    <div className="mx-auto max-w-5xl">
      <NotificationComposerCard
        title="Faculty Notifications to Students"
        defaultDepartment={department}
        onSent={fetchMessages}
      />
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent Messages</h3>
        {loading ? <p className="text-xs text-slate-500">Loading...</p> : null}
        {!loading && messages.length === 0 ? (
          <p className="text-xs text-slate-500">No recent messages.</p>
        ) : null}
        {messages.map((item) => (
          <div key={item.id} className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-semibold text-slate-800">{item.title}</p>
            <p className="text-xs text-slate-600">{item.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
