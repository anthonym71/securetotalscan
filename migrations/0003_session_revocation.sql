-- 0003_session_revocation — "Sign out everywhere".
--
-- Customer sessions are signed, stateless cookies, so the only way to end
-- every copy of one at once is a server-side watermark: any customer session
-- issued before `sessions_revoked_at` is treated as dead. Owner sessions are
-- bound to the owner credentials and are revoked by rotating those instead.

ALTER TABLE customer ADD COLUMN sessions_revoked_at timestamptz;
