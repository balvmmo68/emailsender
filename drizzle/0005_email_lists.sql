CREATE TABLE IF NOT EXISTS email_lists (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_list_contacts (
  id TEXT PRIMARY KEY NOT NULL,
  list_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS email_list_contacts_list_idx ON email_list_contacts(list_id);
CREATE INDEX IF NOT EXISTS email_list_contacts_email_idx ON email_list_contacts(email);
