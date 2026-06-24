-- gen connect ... v0.1.13 ... back the inbound dedupe with a real db constraint
--
-- APPLIED to prod (fpposmirumtbocqtxued). additive, idempotent, forward-only.
-- the inbound webhook deduped replies with a check-then-insert on (user_id,
-- message_id_header), but nothing at the db level enforced it ... two concurrent
-- or redelivered resend deliveries of the same reply could both pass the check
-- and insert a duplicate (double unread + a re-lifted contact). this partial
-- unique index closes the race; the route now treats a 23505 as "already
-- ingested". nulls are excluded so legacy rows without a header are unaffected.

create unique index if not exists gc_unibox_messages_dedupe
  on public.gc_unibox_messages (user_id, message_id_header)
  where message_id_header is not null;

-- next migration ... v0_1_14_gc_<feature>.sql. keep this file forward-only.
