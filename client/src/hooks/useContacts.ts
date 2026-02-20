import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@shared/schema";
import {
  getContacts,
  createContact as createContactStorage,
  updateContact as updateContactStorage,
  deleteContact as deleteContactStorage,
  deleteContacts as deleteContactsStorage,
  bulkCreateContacts,
} from "@/lib/contactsStorage";
import { apiRequest } from "@/lib/queryClient";

const CONTACTS_QUERY_KEY = ["contacts"];

async function syncContactToServer(contact: Contact): Promise<void> {
  try {
    await apiRequest("POST", "/api/contacts/sync", contact);
  } catch {
    // Non-blocking; FK sync is best-effort
  }
}

export function useContacts() {
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: CONTACTS_QUERY_KEY,
    queryFn: getContacts,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY });

  const createContact = async (
    input: Omit<Contact, "id" | "createdAt">
  ): Promise<Contact> => {
    const contact = createContactStorage(input);
    await syncContactToServer(contact);
    invalidate();
    return contact;
  };

  const updateContact = async (
    id: string,
    updates: Partial<Omit<Contact, "id" | "createdAt">>
  ): Promise<Contact | undefined> => {
    const contact = updateContactStorage(id, updates);
    if (contact) await syncContactToServer(contact);
    invalidate();
    return contact;
  };

  const deleteContact = async (id: string): Promise<boolean> => {
    const ok = deleteContactStorage(id);
    invalidate();
    return ok;
  };

  const deleteContacts = async (ids: string[]): Promise<number> => {
    const count = deleteContactsStorage(ids);
    invalidate();
    return count;
  };

  const bulkCreate = async (
    items: Array<Omit<Contact, "id" | "createdAt">>
  ): Promise<Contact[]> => {
    const created = bulkCreateContacts(items);
    for (const c of created) await syncContactToServer(c);
    invalidate();
    return created;
  };

  return {
    contacts,
    isLoading,
    createContact,
    updateContact,
    deleteContact,
    deleteContacts,
    bulkCreate,
    invalidate,
  };
}
