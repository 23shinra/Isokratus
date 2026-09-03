import type { ApiErrorBody, LoginResult, Session } from "@/lib/platonus/types";
import { useAuthStore } from "@/lib/auth-store";

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T | ApiErrorBody;
  if (!res.ok) {
    const err = data as ApiErrorBody;
    const bits = [err.error || err.detail || `HTTP ${res.status}`];
    if (err.tried?.length) {
      bits.push(`Tried: ${err.tried.slice(0, 6).join(" · ")}`);
    }
    // Persist refreshed cookies even on error (session may have warmed)
    const cookies = (data as { cookies?: string }).cookies;
    if (cookies) {
      const session = useAuthStore.getState().session;
      if (session) {
        useAuthStore.getState().setSession({ ...session, cookies });
      }
    }
    throw new Error(bits.join("\n"));
  }

  const cookies = (data as { cookies?: string }).cookies;
  if (cookies) {
    const session = useAuthStore.getState().session;
    if (session && session.cookies !== cookies) {
      useAuthStore.getState().setSession({ ...session, cookies });
    }
  }

  return data as T;
}

function sessionHeaders(session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-platonus-base": session.baseUrl,
    "x-platonus-token": session.token,
    "x-platonus-lang": session.lang,
    ...(session.personId != null
      ? { "x-platonus-person": String(session.personId) }
      : {}),
    ...(session.sid ? { "x-platonus-sid": session.sid } : {}),
    ...(session.uid ? { "x-platonus-uid": session.uid } : {}),
    ...(session.clientId ? { "x-platonus-client": session.clientId } : {}),
    ...(session.groupId != null
      ? { "x-platonus-group": String(session.groupId) }
      : {}),
    ...(session.cookies ? { "x-platonus-cookies": session.cookies } : {}),
  };
}

export async function apiLogin(input: {
  baseUrl: string;
  login: string;
  password: string;
  iin?: string;
  lang?: string;
}): Promise<
  LoginResult & {
    baseUrl: string;
    fio?: string;
    groupId?: string | number;
    groupName?: string;
    clientId?: string;
    uid?: string;
    cookies?: string;
  }
> {
  const res = await fetch("/api/platonus/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function apiStudyYears(session: Session) {
  const res = await fetch("/api/platonus/study-years", {
    headers: sessionHeaders(session),
  });
  return parseJson<{ items: { id: string; label: string }[] }>(res);
}

export async function apiTerms(session: Session) {
  const res = await fetch("/api/platonus/terms", {
    headers: sessionHeaders(session),
  });
  return parseJson<{ items: { id: string; label: string }[] }>(res);
}

export async function apiSchedule(
  session: Session,
  params: { year: string; term: string; week: string },
) {
  const q = new URLSearchParams(params);
  const res = await fetch(`/api/platonus/schedule?${q}`, {
    headers: sessionHeaders(session),
  });
  return parseJson<{ lessons: import("@/lib/platonus/types").ScheduleLesson[]; path: string }>(
    res,
  );
}

export async function apiJournal(
  session: Session,
  params: { year: string; term: string },
) {
  const q = new URLSearchParams(params);
  const res = await fetch(`/api/platonus/journal?${q}`, {
    headers: sessionHeaders(session),
  });
  return parseJson<{
    subjects: import("@/lib/platonus/types").JournalSubject[];
    path: string;
  }>(res);
}

export async function apiJournalRecords(
  session: Session,
  params: { year: string; term: string; subjectId: string },
) {
  const q = new URLSearchParams(params);
  const res = await fetch(`/api/platonus/journal/records?${q}`, {
    headers: sessionHeaders(session),
  });
  return parseJson<{
    records: import("@/lib/platonus/types").JournalRecord[];
    path: string;
  }>(res);
}

export async function apiMarkQr(session: Session, code: string) {
  const res = await fetch("/api/platonus/qr", {
    method: "POST",
    headers: sessionHeaders(session),
    body: JSON.stringify({ code }),
  });
  return parseJson<{ ok: boolean; data: unknown; path: string }>(res);
}

export async function apiAvatar(session: Session): Promise<string | null> {
  const res = await fetch("/api/platonus/avatar", {
    headers: sessionHeaders(session),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data.url || null;
}
