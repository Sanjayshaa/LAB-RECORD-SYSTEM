import AdminShell from "@/layouts/AdminShell";
import NotificationComposerCard from "@/components/notifications/NotificationComposerCard";

export default function NotificationsPage() {
  return (
    <AdminShell title="Notifications">
      <div className="col-span-12">
        <NotificationComposerCard title="Messages" />
      </div>
    </AdminShell>
  );
}
