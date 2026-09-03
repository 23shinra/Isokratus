export type Lang = "ru" | "kz" | "en";

export type Session = {
  baseUrl: string;
  token: string;
  sid?: string;
  uid?: string;
  clientId?: string;
  /** Forwarded Platonus Cookie jar (JSESSIONID, XSRF-TOKEN, …). */
  cookies?: string;
  personId?: number | string;
  personType?: number | string;
  fio?: string;
  universityName?: string;
  groupId?: string | number;
  groupName?: string;
  lang: Lang;
};

export type LoginPayload = {
  baseUrl: string;
  login: string;
  password: string;
  iin?: string;
  lang?: Lang;
};

export type LoginResult = {
  login_status: string;
  auth_token?: string;
  message?: string;
  personID?: number | string;
  personType?: number | string;
  sid?: string;
  uid?: string;
};

export type StudyYear = {
  id?: number | string;
  year?: number | string;
  name?: string;
  [key: string]: unknown;
};

export type Term = {
  id?: number | string;
  term?: number | string;
  name?: string;
  [key: string]: unknown;
};

export type ScheduleLesson = {
  id: string;
  day: number;
  dayName: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  type: string;
  group?: string;
};

export type JournalRecord = {
  id: string;
  date: string;
  title: string;
  mark: string;
  type: string;
  raw: Record<string, unknown>;
};

export type JournalSubject = {
  id: string;
  name: string;
  teacher: string;
  total?: string | number | null;
  letter?: string | null;
  percent?: string | number | null;
  /** РК / рейтинг / экзамен / итого из полей предмета */
  summary?: JournalRecord[];
  /** Текущие оценки, если уже пришли внутри предмета */
  embedded?: JournalRecord[];
  raw: Record<string, unknown>;
};

export type ApiErrorBody = {
  error: string;
  detail?: string;
  tried?: string[];
  cookies?: string;
};
