/**
 * contactMatcher — resolves an email address to an existing contact.
 *
 * Uses a case-insensitive exact match against contacts stored in the database
 * for the given user.
 */
import { storage } from "../../storage";
import type { Contact } from "@shared/schema";

/**
 * matchContact — find a contact by email address (case-insensitive).
 *
 * @param email   - The email address to match (case-insensitive)
 * @param userId  - The user whose contacts to search
 * @returns The matched Contact, or undefined if no match found
 */
export async function matchContact(email: string, userId: string): Promise<Contact | undefined> {
  const contacts = await storage.getContacts(userId);
  const normalizedEmail = email.toLowerCase().trim();
  return contacts.find(
    (c) => c.email != null && c.email.toLowerCase().trim() === normalizedEmail
  );
}
