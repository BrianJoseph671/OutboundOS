import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contact, InsertContact } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

const CONTACTS_QUERY_KEY = ["contacts"];
const STORAGE_KEY = "outbound-contacts";

/**
 * Write-through cache: persist the latest API-fetched contacts to localStorage
 * so that code reading directly from contactsStorage (e.g. batch research callbacks)
 * sees up-to-date data without needing to re-fetch.
 */
function writeToLocalStorage(contacts: Contact[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  } catch {
    // Non-critical — localStorage might be full or unavailable (e.g. private mode)
  }
}

export function useContacts() {
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: CONTACTS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contacts");
      const data: Contact[] = await res.json();
      // Write-through: keep localStorage in sync so contactsStorage helpers
      // (getContact, updateContactStorage) still work for non-hook callers.
      writeToLocalStorage(data);
      return data;
    },
    staleTime: 30_000, // 30 seconds — contacts change infrequently
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY });

  const createContact = async (input: InsertContact): Promise<Contact> => {
    const res = await apiRequest("POST", "/api/contacts", input);
    const contact: Contact = await res.json();
    invalidate();
    return contact;
  };

  const updateContact = async (
    id: string,
    updates: Partial<InsertContact>,
  ): Promise<Contact | undefined> => {
    try {
      const res = await apiRequest("PATCH", `/api/contacts/${id}`, updates);
      const contact: Contact = await res.json();
      invalidate();
      return contact;
    } catch {
      invalidate();
      return undefined;
    }
  };

  const deleteContact = async (id: string): Promise<boolean> => {
    try {
      await apiRequest("DELETE", `/api/contacts/${id}`);
      invalidate();
      return true;
    } catch {
      return false;
    }
  };

  const deleteContacts = async (ids: string[]): Promise<number> => {
    try {
      const res = await apiRequest("POST", "/api/contacts/bulk-delete", {
        ids,
      });
      const data = await res.json();
      invalidate();
      return (data as { count?: number }).count ?? 0;
    } catch {
      return 0;
    }
  };

  const bulkCreate = async (items: InsertContact[]): Promise<Contact[]> => {
    try {
      await apiRequest("POST", "/api/contacts/bulk-import", {
        contacts: items,
      });
      invalidate();
    } catch {
      // Non-blocking — invalidate to refresh the list
      invalidate();
    }
    return [];
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
