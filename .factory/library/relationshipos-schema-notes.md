## RelationshipOS schema rollout note

- `contacts.user_id` is enforced as `NOT NULL` at the database level.
- `insertContactSchema` currently allows missing `userId` at input level.
- Any contact creation path must assign a valid `userId` before `storage.createContact(...)` to avoid runtime `NOT NULL` insert failures.
- Seed-user fallback should be resolved deterministically (the seeding script uses username `brian_placeholder` in `scripts/seed.ts`) rather than arbitrary user selection.
