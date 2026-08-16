import crypto from "node:crypto";
import path from "node:path";
import { DATA_DIR } from "../config";
import { loadJson, saveJson } from "./json";

export type CallTicketStatus =
  | "new"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "dialogue";

export interface CallTicket {
  id: string;
  user_id: string;
  author_name: string;
  author_icon: string | null;
  content: string;
  status: CallTicketStatus;
  created_at: number;
  thread_id: string;
  thread_parent_id: string;
  welcome_id: string | null;
  message_id: string | null;
  channel_id: string | null;
  reviewer_id: string | null;
  review_reason: string | null;
  operator_thread_id: string | null;
  attachments: string[];
}

const CALL_CENTER_FILE = path.join(DATA_DIR, "callcenter.json");

export const TICKET_STATUS_LABELS: Record<CallTicketStatus, string> = {
  new: "Нове звернення",
  reviewing: "На розгляді",
  accepted: "Прийняте",
  rejected: "Відхилене",
  dialogue: "Діалог розпочато",
};

export function loadTickets(): CallTicket[] {
  return loadJson<CallTicket[]>(CALL_CENTER_FILE, []);
}

export function saveTickets(tickets: CallTicket[]): void {
  saveJson(CALL_CENTER_FILE, tickets);
}

export function getTicketByThread(threadId: string): CallTicket | null {
  return loadTickets().find((t) => String(t.thread_id) === String(threadId)) ?? null;
}

export function getTicketByOperatorThread(threadId: string): CallTicket | null {
  return loadTickets().find((t) => String(t.operator_thread_id) === String(threadId)) ?? null;
}

export function getTicket(id: string): CallTicket | null {
  return loadTickets().find((t) => t.id === id) ?? null;
}

export function updateTicket(id: string, fields: Partial<CallTicket>): CallTicket | null {
  const tickets = loadTickets();
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return null;
  Object.assign(ticket, fields);
  saveTickets(tickets);
  return ticket;
}

export function createTicket(input: {
  user_id: string;
  author_name: string;
  author_icon: string | null;
  content: string;
  thread_id: string;
  thread_parent_id: string;
  attachments?: string[];
}): CallTicket {
  const ticket: CallTicket = {
    id: crypto.randomBytes(4).toString("hex"),
    user_id: input.user_id,
    author_name: input.author_name,
    author_icon: input.author_icon,
    content: input.content,
    status: "new",
    created_at: Date.now(),
    thread_id: input.thread_id,
    thread_parent_id: input.thread_parent_id,
    welcome_id: null,
    message_id: null,
    channel_id: null,
    reviewer_id: null,
    review_reason: null,
    operator_thread_id: null,
    attachments: input.attachments ?? [],
  };
  const tickets = loadTickets();
  tickets.push(ticket);
  saveTickets(tickets);
  return ticket;
}

export function getTicketDialogueByUser(userId: string): CallTicket | null {
  return (
    loadTickets().find(
      (t) => String(t.user_id) === String(userId) && t.status === "dialogue" && t.thread_id,
    ) ?? null
  );
}

export function hasActiveTicket(userId: string): boolean {
  return loadTickets().some(
    (t) =>
      String(t.user_id) === String(userId) &&
      (t.status === "new" || t.status === "reviewing" || t.status === "dialogue"),
  );
}