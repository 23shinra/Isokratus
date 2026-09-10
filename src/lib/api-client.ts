import type { ApiErrorBody, LoginResult, Session } from "@/lib/lms/types";
import { useAuthStore } from "@/lib/auth-store";
import {
  findCredentialsForSession,
  rememberAccount,
} from "@/lib/saved-accounts";

function applySessionCookies(cookies: string | undefined) {
  if (!cookies) return;
  const session = useAuthStore.getState().session;
  if (!session || session.cookies === cookies) return;
  useAuthStore.getState().setSession({ ...session, cookies });
}

function friendlyHttpError(status: number, text: string): string {
  const trimmed = text.trim();
  if (
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<html") ||
    /<!DOCTYPE|<html[\s>]/i.test(trimmed.slice(0, 200))
  ) {
    if (status === 502 || status === 503 || status === 504) {
      return "Сервер временно недоступен. Обнови страницу через пару секунд.";
    }
    if (status === 400) {
      return "Слишком длинная сессия. Выйди и войди снова.";
    }
    return "Сервер вернул ошибку. Обнови страницу или войди снова.";
  }
  if (status === 401 || status === 403) {
    return "Сессия истекла. Выйди и войди снова.";
  }
  if (status >= 500) {
    return "Сервер вуза не ответил. Попробуй ещё раз.";
  }
  return trimmed.slice(0, 280) || `Ошибка HTTP ${status}`;
}

function sanitizeUserError(msg: string, status: number): string {
  if (/рабочий эндпоинт|endpoint|Передайте x-iso/i.test(msg)) {
    return status === 401 || status === 403
      ? "Сессия истекла. Выйди и войди снова."
      : "Не удалось связаться с сервером вуза. Выйди и войди снова.";
  }
  if (/tried\s*\(|<!DOCTYPE|<html[\s>]/i.test(msg)) {
    return friendlyHttpError(status, msg);
  }
  return msg;
}

function isAuthFailure(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  return /сессия истекла|не авториз|access denied|invalid token|unauthorized/i.test(
    message,
  );
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T | ApiErrorBody | null = null;

  if (text) {
    try {
      data = JSON.parse(text) as T | ApiErrorBody;
    } catch {
      throw new Error(friendlyHttpError(res.status, text));
    }
  }

  if (!res.ok) {
    const err = (data || {}) as ApiErrorBody;
    applySessionCookies((data as { cookies?: string } | null)?.cookies);
    const raw =
      err.error ||
      err.detail ||
      friendlyHttpError(res.status, text || `HTTP ${res.status}`);
    const message = sanitizeUserError(raw, res.status);
    throw Object.assign(new Error(message), {
      status: res.status,
      authExpired: isAuthFailure(res.status, message),
    });
  }

  applySessionCookies((data as { cookies?: string } | null)?.cookies);
  return data as T;
}

function sessionHeaders(session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-iso-base": session.baseUrl,
    "x-iso-token": session.token,
    "x-iso-lang": session.lang,
    ...(session.personId != null
      ? { "x-iso-person": String(session.personId) }
      : {}),
    ...(session.sid ? { "x-iso-sid": session.sid } : {}),
    ...(session.uid ? { "x-iso-uid": session.uid } : {}),
    ...(session.clientId ? { "x-iso-client": session.clientId } : {}),
    ...(session.groupId != null
      ? { "x-iso-group": String(session.groupId) }
      : {}),
    ...(session.cookies ? { "x-iso-cookies": session.cookies } : {}),
  };
}

let refreshPromise: Promise<Session | null> | null = null;
let lastRefreshAt = 0;

export async function apiLogin(input: {
  baseUrl: string;
  login: string;
  password: string;
  iin?: string;
  lang?: string;
  silent?: boolean;
}): Promise<
  LoginResult & {
    baseUrl: string;
    fio?: string;
    groupId?: string | number;
    groupName?: string;
    clientId?: string;
    uid?: string;
    cookies?: string;
    adminProof?: string;
  }
> {
  const res = await fetch("/api/lms/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

/**
 * Silent re-login using the saved account password for the current session.
 * Deduplicated — parallel 401s share one refresh.
 */
export async function silentRefreshSession(force = false): Promise<Session | null> {
  if (refreshPromise) return refreshPromise;

  const minGap = 20_000;
  if (!force && Date.now() - lastRefreshAt < minGap) {
    return useAuthStore.getState().session;
  }

  refreshPromise = (async () => {
    const current = useAuthStore.getState().session;
    if (!current) return null;

    const creds = findCredentialsForSession(current);
    if (!creds) return null;

    try {
      const result = await apiLogin({
        baseUrl: current.baseUrl,
        login: creds.login,
        password: creds.password,
        lang: current.lang || "ru",
        silent: true,
      });

      if (!result.auth_token) return null;

      const next: Session = {
        ...current,
        login: creds.login,
        token: result.auth_token,
        sid: result.sid ? String(result.sid) : current.sid,
        uid: result.uid ? String(result.uid) : current.uid,
        clientId: result.clientId ? String(result.clientId) : current.clientId,
        cookies: result.cookies || current.cookies,
        personId: result.personID ?? current.personId,
        fio: result.fio || current.fio,
        groupId: result.groupId ?? current.groupId,
        groupName: result.groupName ?? current.groupName,
        universityName: current.universityName || creds.universityName,
        lang: current.lang || "ru",
        adminProof: result.adminProof || current.adminProof,
      };

      useAuthStore.getState().setSession(next);
      rememberAccount({
        baseUrl: next.baseUrl,
        universityName: next.universityName || creds.universityName,
        login: creds.login,
        password: creds.password,
        fio: next.fio,
      });
      lastRefreshAt = Date.now();
      return next;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function authedJson<T>(
  build: (session: Session) => Promise<Response>,
): Promise<T> {
  const session = useAuthStore.getState().session;
  if (!session) throw new Error("Нужен вход");

  try {
    const res = await build(session);
    return await parseJson<T>(res);
  } catch (err) {
    const authExpired =
      err &&
      typeof err === "object" &&
      "authExpired" in err &&
      Boolean((err as { authExpired?: boolean }).authExpired);

    if (!authExpired) throw err;

    const refreshed = await silentRefreshSession(true);
    if (!refreshed) throw err;

    const res = await build(refreshed);
    return parseJson<T>(res);
  }
}

export async function apiStudyYears(session: Session) {
  return authedJson<{ items: { id: string; label: string }[] }>((live) =>
    fetch("/api/lms/study-years", { headers: sessionHeaders(live || session) }),
  );
}

export async function apiTerms(session: Session) {
  return authedJson<{ items: { id: string; label: string }[] }>((live) =>
    fetch("/api/lms/terms", { headers: sessionHeaders(live || session) }),
  );
}

export async function apiSchedule(
  session: Session,
  params: { year: string; term: string; week: string },
) {
  const q = new URLSearchParams(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    return await authedJson<{
      lessons: import("@/lib/lms/types").ScheduleLesson[];
      path: string;
    }>((live) =>
      fetch(`/api/lms/schedule?${q}`, {
        headers: sessionHeaders(live || session),
        signal: controller.signal,
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "Сервер вуза отвечает слишком долго. Показано сохранённое, если есть.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiJournal(
  session: Session,
  params: { year: string; term: string },
) {
  const q = new URLSearchParams(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16_000);
  try {
    return await authedJson<{
      subjects: import("@/lib/lms/types").JournalSubject[];
      path: string;
    }>((live) =>
      fetch(`/api/lms/journal?${q}`, {
        headers: sessionHeaders(live || session),
        signal: controller.signal,
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "Журнал долго не отвечает. Показано сохранённое, если есть.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiJournalRecords(
  session: Session,
  params: {
    year: string;
    term: string;
    subjectId: string;
    tutorSubjectId?: string;
  },
) {
  const q = new URLSearchParams({
    year: params.year,
    term: params.term,
    subjectId: params.subjectId,
  });
  if (params.tutorSubjectId) q.set("tutorSubjectId", params.tutorSubjectId);
  return authedJson<{
    records: import("@/lib/lms/types").JournalRecord[];
    path: string | null;
    error?: string;
  }>((live) =>
    fetch(`/api/lms/journal/records?${q}`, {
      headers: sessionHeaders(live || session),
    }),
  );
}

export async function apiMarkQr(session: Session, code: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);

  async function once(live: Session) {
    const res = await fetch("/api/lms/qr", {
      method: "POST",
      headers: sessionHeaders(live),
      body: JSON.stringify({ code }),
      signal: controller.signal,
    });

    const data = (await res.json()) as {
      ok?: boolean;
      marked?: boolean;
      message?: string;
      kind?: "success" | "expired" | "already" | null;
      path?: string;
      status?: number;
      data?: unknown;
      error?: string;
      detail?: string;
      cookies?: string;
    };

    const cookies = data.cookies;
    if (cookies) {
      const current = useAuthStore.getState().session;
      if (current && current.cookies !== cookies) {
        useAuthStore.getState().setSession({ ...current, cookies });
      }
    }

    if (!res.ok) {
      const blob = `${data.error || ""} ${data.detail || ""} ${data.message || ""}`;
      if (isAuthFailure(res.status, blob)) {
        throw Object.assign(new Error("Сессия истекла"), {
          authExpired: true,
          status: res.status,
        });
      }

      let kind: "expired" | "already" | "missing" = "missing";
      if (/просроч|expired/i.test(blob)) kind = "expired";
      else if (/уже\s+отмечен|already/i.test(blob)) kind = "already";

      const friendly =
        kind === "expired"
          ? "QR просрочен"
          : kind === "already"
            ? "Уже отмечен"
            : "QR не найден";

      throw Object.assign(new Error(friendly), { kind, soft: true });
    }

    return {
      ok: Boolean(data.ok),
      marked: Boolean(data.marked),
      message: data.message,
      kind: data.kind ?? null,
      path: data.path || "",
      status: data.status ?? res.status,
      data: data.data,
    };
  }

  try {
    try {
      return await once(session);
    } catch (err) {
      const authExpired =
        err &&
        typeof err === "object" &&
        "authExpired" in err &&
        Boolean((err as { authExpired?: boolean }).authExpired);
      if (!authExpired) throw err;
      const refreshed = await silentRefreshSession(true);
      if (!refreshed) throw err;
      return await once(refreshed);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw Object.assign(new Error("Сервер вуза не ответил"), {
        kind: "missing" as const,
        soft: true,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiAvatar(session: Session): Promise<string | null> {
  try {
    return await authedJson<{ url?: string }>((live) =>
      fetch("/api/lms/avatar", { headers: sessionHeaders(live || session) }),
    ).then((data) => data.url || null);
  } catch {
    return null;
  }
}

export async function apiUsage(session: Session): Promise<{
  total: number;
  users: Array<{
    id: string;
    fio: string;
    login: string;
    university: string;
    baseUrl: string;
    firstSeenAt: string;
    lastSeenAt: string;
    loginCount: number;
  }>;
}> {
  return authedJson((live) => {
    const s = live || session;
    return fetch("/api/usage", {
      headers: {
        ...sessionHeaders(s),
        ...(s.adminProof ? { "x-sokratus-admin": s.adminProof } : {}),
      },
    });
  });
}

export type UniRequestRow = {
  id: string;
  universityName: string;
  telegram: string;
  createdAt: string;
  done: boolean;
};

function adminHeaders(session: Session): HeadersInit {
  return {
    ...sessionHeaders(session),
    ...(session.adminProof ? { "x-sokratus-admin": session.adminProof } : {}),
  };
}

export async function apiUniRequests(session: Session): Promise<{
  total: number;
  pending: number;
  requests: UniRequestRow[];
}> {
  return authedJson((live) =>
    fetch("/api/uni-requests", {
      headers: adminHeaders(live || session),
    }),
  );
}

export async function apiUniRequestDone(
  session: Session,
  id: string,
  done: boolean,
): Promise<void> {
  await authedJson((live) =>
    fetch("/api/uni-requests", {
      method: "PATCH",
      headers: {
        ...adminHeaders(live || session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, done }),
    }),
  );
}

export async function apiSubmitUniRequest(input: {
  universityName: string;
  telegram: string;
}): Promise<void> {
  const res = await fetch("/api/uni-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Не удалось отправить заявку");
  }
}
