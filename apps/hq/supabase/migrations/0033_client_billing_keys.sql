-- ---------------------------------------------------------------------------
-- 0033_client_billing_keys — how a client row finds its money.
--
-- Paid state used to be a name-contains match between display_name and the
-- Mercury counterparty. It could never match a name under 3 characters ("SB")
-- and missed a payer whose bank name is a person ("Technology Associates" paid
-- under a personal name). A client now carries the keys instead:
--   mercury_customer_id  Mercury's /ar/customers id (invoice match, exact)
--   aliases              exact payer / customer names, the fallback
--   billing_source       where MRR comes from: 'mercury' = this row's
--                        monthly_rate_cents counts toward Mercury MRR while
--                        churn_date is null; 'stripe' = Stripe subscription;
--                        'none' = no recurring billing (e.g. a handed-off app).
-- churn_date and monthly_rate_cents already exist (0020). No data is invented
-- here: the ids and aliases are set through item D's Clients Edit form
-- (the lib/clients/fields.ts whitelist) or a Nate-run
-- `update clients set aliases = ..., mercury_customer_id = ... where slug = ...`.
-- ---------------------------------------------------------------------------
begin;

alter table clients
  add column if not exists mercury_customer_id text,
  add column if not exists aliases             text[] default '{}',
  add column if not exists billing_source      text default 'mercury'
    check (billing_source in ('mercury', 'stripe', 'none'));

commit;
