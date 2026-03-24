import type { Contact, InsertContact } from "@shared/schema";

const STORAGE_KEY = "outbound-contacts";

// ContactInput is based on InsertContact so new nullable/defaulted columns are optional.
// id and createdAt are overridden to allow pre-assigned or string values from localStorage.
export type ContactInput = InsertContact & {
  id?: string;
  createdAt?: Date | string | null;
};

function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Contact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function getContacts(): Contact[] {
  const contacts = loadContacts();
  return contacts.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function getContact(id: string): Contact | undefined {
  return loadContacts().find((c) => c.id === id);
}

export function createContact(
  input: Omit<ContactInput, "id" | "createdAt">
): Contact {
  const contacts = loadContacts();
  const now = new Date().toISOString();
  const contact: Contact = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
  } as Contact;
  contacts.push(contact);
  saveContacts(contacts);
  return contact;
}

export function updateContact(
  id: string,
  updates: Partial<InsertContact>
): Contact | undefined {
  const contacts = loadContacts();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  contacts[idx] = { ...contacts[idx], ...updates } as Contact;
  saveContacts(contacts);
  return contacts[idx];
}

export function deleteContact(id: string): boolean {
  const contacts = loadContacts().filter((c) => c.id !== id);
  if (contacts.length === loadContacts().length) return false;
  saveContacts(contacts);
  return true;
}

export function deleteContacts(ids: string[]): number {
  const idSet = new Set(ids);
  const contacts = loadContacts().filter((c) => !idSet.has(c.id));
  const removed = loadContacts().length - contacts.length;
  saveContacts(contacts);
  return removed;
}

export function bulkCreateContacts(
  items: Array<Omit<ContactInput, "id" | "createdAt">>
): Contact[] {
  const contacts = loadContacts();
  const now = new Date().toISOString();
  const created: Contact[] = items.map((input) => ({
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
  })) as Contact[];
  contacts.push(...created);
  saveContacts(contacts);
  return created;
}
