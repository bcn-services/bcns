-- P1 owner self-service sign-up: a self-created account starts `pending` and stays that way until
-- bcns activates it by hand (platform/scripts/activate-client.ts). Own file on purpose: a value added
-- by ALTER TYPE ... ADD VALUE cannot be used in the transaction that adds it, and
-- 20261001000200_signup_pending.sql uses it. Additive only: no row is pending until the signup
-- function's SIGNUP_ENABLED secret is set, so this is safe before or after the hub deploy.
alter type data.client_status add value if not exists 'pending';
