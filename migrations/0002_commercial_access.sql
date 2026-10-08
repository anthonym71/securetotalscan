-- 0002_commercial_access — paid customer login and credit ledger.

CREATE TABLE magic_link (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid NOT NULL REFERENCES customer(id),
    token_hash   text NOT NULL UNIQUE,
    expires_at   timestamptz NOT NULL,
    used_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX magic_link_customer_idx ON magic_link (customer_id);
CREATE INDEX magic_link_expires_idx ON magic_link (expires_at);

CREATE TABLE credit_ledger (
    id              bigserial PRIMARY KEY,
    customer_id     uuid NOT NULL REFERENCES customer(id),
    subscription_id uuid REFERENCES subscription(id),
    delta           integer NOT NULL,
    reason          text NOT NULL,
    external_ref    text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_customer_idx ON credit_ledger (customer_id, created_at DESC);
CREATE UNIQUE INDEX credit_ledger_external_ref_key ON credit_ledger (external_ref)
    WHERE external_ref IS NOT NULL;
