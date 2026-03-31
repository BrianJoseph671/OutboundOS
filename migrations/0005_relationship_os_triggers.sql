-- Migration: Add PostgreSQL triggers for contacts.updated_at and interactions → contacts.last_interaction_at
-- Idempotent: uses CREATE OR REPLACE FUNCTION and EXCEPTION WHEN duplicate_object for triggers.

-- Trigger 1: Auto-update contacts.updated_at on any UPDATE to the contacts table
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER contacts_updated_at_trigger
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_contacts_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Trigger 2: Update contacts.last_interaction_at and last_interaction_channel on interactions INSERT
-- Only updates if the new interaction is more recent than the current last_interaction_at.
CREATE OR REPLACE FUNCTION update_contact_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contacts
  SET last_interaction_at = NEW.occurred_at,
      last_interaction_channel = NEW.channel
  WHERE id = NEW.contact_id
    AND (last_interaction_at IS NULL OR last_interaction_at < NEW.occurred_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER interactions_update_contact_trigger
    AFTER INSERT ON interactions
    FOR EACH ROW
    EXECUTE FUNCTION update_contact_last_interaction();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
