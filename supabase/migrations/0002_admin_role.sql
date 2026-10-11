-- Run this one ALONE, before 0003. Postgres cannot use a new enum value in the same transaction that adds it.
alter type user_role add value if not exists 'admin';
