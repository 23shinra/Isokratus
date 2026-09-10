import type { ScheduleChange } from "@/lib/schedule-history";
import { t } from "@/lib/i18n";
import { usePrefsStore } from "@/lib/prefs-store";

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function summarizeChange(change: ScheduleChange): string {
  const lang = usePrefsStore.getState().lang;
  if (change.added.length && !change.removed.length && !change.changed.length) {
    return t(lang, "notify_body_added");
  }
  if (change.removed.length && !change.added.length && !change.changed.length) {
    return t(lang, "notify_body_removed");
  }
  if (change.changed.length && !change.added.length && !change.removed.length) {
    return t(lang, "notify_body_moved");
  }
  return t(lang, "notify_body_mixed");
}

/** Local SW notification when schedule diffs appear. */
export async function notifyScheduleChange(
  change: ScheduleChange,
): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // Tab already in focus — badge on History is enough
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  const lang = usePrefsStore.getState().lang;
  const title = `Sokratus · ${t(lang, "notify_title")}`;
  const body = summarizeChange(change);
  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "sokratus-schedule",
    renotify: true,
    data: { url: "/history" },
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // fall through
  }

  try {
    new Notification(title, options);
  } catch {
    // ignore
  }
}
