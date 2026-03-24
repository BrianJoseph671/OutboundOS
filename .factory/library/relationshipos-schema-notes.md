## RelationshipOS schema rollout note

- `contacts.user_id` is enforced as `NOT NULL` at the database level.
- `insertContactSchema` currently allows missing `userId` at input level.
- Any contact creation path must assign a valid `userId` before `storage.createContact(...)` to avoid runtime `NOT NULL` insert failures.
