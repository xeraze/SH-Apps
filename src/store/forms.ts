import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config";
import { loadJson, saveJson } from "./json";

export interface FormQuestion {
  label: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}

export interface Form {
  id: string;
  title: string;
  description: string;
  color?: string;
  emoji?: string;
  ping_role_id?: string;
  channel_id?: string;
  questions: FormQuestion[];
}

export type SubmissionStatus =
  | "new"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "dialogue";

export interface Submission {
  id: string;
  form_id: string;
  user_id: string;
  author_name: string;
  author_icon: string | null;
  answers: { label: string; value: string }[];
  status: SubmissionStatus;
  message_id: string | null;
  channel_id: string | null;
  reviewer_id: string | null;
  review_reason: string | null;
  thread_id: string | null;
  thread_controls_id: string | null;
  attachments: string[];
}

const FORMS_DIR = path.join(DATA_DIR, "forms");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: "Нова заявка",
  reviewing: "На розгляді",
  accepted: "Прийнята",
  rejected: "Відхилена",
  dialogue: "Діалог розпочато",
};

export function loadForms(): Form[] {
  try {
    if (!fs.existsSync(FORMS_DIR)) return [];
    return fs
      .readdirSync(FORMS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => loadJson<Form | null>(path.join(FORMS_DIR, f), null))
      .filter((f): f is Form => !!f && !!f.id);
  } catch {
    return [];
  }
}

export function getForm(formId: string): Form | null {
  return loadForms().find((f) => f.id === formId) ?? null;
}

export function saveForm(form: Form): void {
  fs.mkdirSync(FORMS_DIR, { recursive: true });
  saveJson(path.join(FORMS_DIR, `${form.id}.json`), form);
}

export function loadSubmissions(): Submission[] {
  return loadJson<Submission[]>(SUBMISSIONS_FILE, []);
}

export function saveSubmissions(list: Submission[]): void {
  saveJson(SUBMISSIONS_FILE, list);
}

export function getSubmission(id: string): Submission | null {
  return loadSubmissions().find((s) => s.id === id) ?? null;
}

export function updateSubmission(id: string, fields: Partial<Submission>): Submission | null {
  const list = loadSubmissions();
  const sub = list.find((s) => s.id === id);
  if (!sub) return null;
  Object.assign(sub, fields);
  saveSubmissions(list);
  return sub;
}

export function createSubmission(input: {
  form_id: string;
  user_id: string;
  author_name: string;
  author_icon: string | null;
  answers: { label: string; value: string }[];
}): Submission {
  const sub: Submission = {
    id: crypto.randomBytes(4).toString("hex"),
    form_id: input.form_id,
    user_id: input.user_id,
    author_name: input.author_name,
    author_icon: input.author_icon,
    answers: input.answers,
    status: "new",
    message_id: null,
    channel_id: null,
    reviewer_id: null,
    review_reason: null,
    thread_id: null,
    thread_controls_id: null,
    attachments: [],
  };
  const list = loadSubmissions();
  list.push(sub);
  saveSubmissions(list);
  return sub;
}

export function addSubmissionAttachments(id: string, urls: string[]): Submission | null {
  const list = loadSubmissions();
  const sub = list.find((s) => s.id === id);
  if (!sub) return null;
  sub.attachments = [...(sub.attachments ?? []), ...urls];
  saveSubmissions(list);
  return sub;
}

export function getSubmissionByThread(threadId: string): Submission | null {
  return (
    loadSubmissions().find(
      (s) => String(s.thread_id) === String(threadId) && s.status === "dialogue",
    ) ?? null
  );
}

export function getSubmissionDialogueByUser(userId: string): Submission | null {
  return (
    loadSubmissions().find(
      (s) => String(s.user_id) === String(userId) && s.status === "dialogue" && s.thread_id,
    ) ?? null
  );
}