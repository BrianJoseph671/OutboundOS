import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

const CONTACTS_QUERY_KEY = ["/api/contacts"];

export type ContactInput = Partial<Omit<Contact, "id" | "createdAt" | "userId">>;

export function useContacts() {
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: CONTACTS_QUERY_KEY,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY });

  const createContactMutation = useMutation({
    mutationFn: async (input: ContactInput) => {
      const res = await apiRequest("POST", "/api/contacts", input);
      return res.json() as Promise<Contact>;
    },
    onSuccess: () => invalidate(),
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: ContactInput }) => {
      const res = await apiRequest("PATCH", `/api/contacts/${id}`, updates);
      return res.json() as Promise<Contact>;
    },
    onSuccess: () => invalidate(),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/contacts/${id}`);
      return true;
    },
    onSuccess: () => invalidate(),
  });

  const deleteContactsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/contacts/bulk-delete", { ids });
      const data = await res.json();
      return data.count as number;
    },
    onSuccess: () => invalidate(),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (items: ContactInput[]) => {
      const res = await apiRequest("POST", "/api/contacts/bulk-create", { contacts: items });
      const data = await res.json();
      return data;
    },
    onSuccess: () => invalidate(),
  });

  const createContact = async (input: ContactInput): Promise<Contact> => {
    return createContactMutation.mutateAsync(input);
  };

  const updateContact = async (id: string, updates: ContactInput): Promise<Contact | undefined> => {
    return updateContactMutation.mutateAsync({ id, updates });
  };

  const deleteContact = async (id: string): Promise<boolean> => {
    return deleteContactMutation.mutateAsync(id);
  };

  const deleteContacts = async (ids: string[]): Promise<number> => {
    return deleteContactsMutation.mutateAsync(ids);
  };

  const bulkCreate = async (items: ContactInput[]): Promise<Contact[]> => {
    await bulkCreateMutation.mutateAsync(items);
    await invalidate();
    return queryClient.getQueryData<Contact[]>(CONTACTS_QUERY_KEY) || [];
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
