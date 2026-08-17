-- 0001_init — Phase 2, PR 2.1.
--
-- Schema only. Nothing writes to these tables yet; PR 2.2 starts recording
-- scans, PR 2.3 reads entitlements, PR 2.6 writes purchases. Landing the shape
-- on its own means a mistake here is a migration rather than an outage.
--
-- Conventions, applied without exception:
--
--   * Every table that holds customer data carries `customer_id` and is
--     indexed on it. Tenant isolation is only as good as the ability to scope
--     a query, and PR 3.4 has to be able to prove that scoping.
--   * Money is integer minor units (cents). Never float — 0.1 + 0.2 is not
--     0.3, and this ends up on an invoice.
--   * Timestamps are `timestamptz`. A naive timestamp is a bug waiting for a
--     customer in another timezone.
--   * Deletions are explicit. Retention is enforced in Phase 4, so nothing
--     here cascades a customer's history away by accident.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── customer ──────────────────────────────────────────────────────────────
-- Identity. Phase 3 replaces the shared STS_ACCESS_CODES with rows here.

CREATE TABLE customer (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email        text NOT NULL,
    -- Set when a GHL contact exists, so CRM state can be reconciled without a
    -- second source of truth for who someone is.
    ghl_contact_id text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Addresses are compared case-insensitively everywhere else in the codebase
-- (`email.trim().toLowerCase()`), so the uniqueness constraint has to agree —
-- otherwise Alice@example.com and alice@example.com become two customers.
CREATE UNIQUE INDEX customer_email_lower_key ON customer (lower(email));

-- ── subscription ──────────────────────────────────────────────────────────
-- One row per subscription. A customer may have had several over time, so
-- this is history, not a flag on `customer`.

CREATE TABLE subscription (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   uuid NOT NULL REFERENCES customer(id),
    -- Tier label as sold, e.g. 'pro'. Deliberately text rather than an enum:
    -- pricing changes more often than schemas, and an enum turns a pricing
    -- change into a migration.
    tier          text NOT NULL,
    -- active | past_due | cancelled | refunded. Constrained below.
    status        text NOT NULL,
    -- The GHL/Stripe identifier this subscription came from, so a webhook can
    -- find its row without guessing.
    external_id   text,
    -- The anniversary that resets the scan allowance (PR 3.2). Stored rather
    -- than derived, because a customer who upgrades mid-cycle keeps their
    -- original date and deriving it from created_at would silently move it.
    renews_on     date,
    started_at    timestamptz NOT NULL DEFAULT now(),
    ended_at      timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subscription_status_check
        CHECK (status IN ('active', 'past_due', 'cancelled', 'refunded'))
);

CREATE INDEX subscription_customer_idx ON subscription (customer_id);
CREATE UNIQUE INDEX subscription_external_id_key ON subscription (external_id)
    WHERE external_id IS NOT NULL;

-- ── site ──────────────────────────────────────────────────────────────────
-- A saved target (PR 3.3). Scans may exist without one — a free scan has no
-- customer — so `scan.site_id` is nullable.

CREATE TABLE site (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES customer(id),
    url         text NOT NULL,
    label       text,
    -- Free-text grouping, so a customer can organise sites without us
    -- inventing a folder hierarchy before anyone has asked for one.
    site_group  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_customer_idx ON site (customer_id);
CREATE UNIQUE INDEX site_customer_url_key ON site (customer_id, url);

-- ── scan ──────────────────────────────────────────────────────────────────
-- Every scan, free or paid. PR 2.2 starts writing these, which is what lets a
-- peer-comparison cohort accrue while Phases 3–4 are built (plan §3.2).

CREATE TABLE scan (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null for an anonymous free scan. Present once accounts exist.
    customer_id  uuid REFERENCES customer(id),
    site_id      uuid REFERENCES site(id),
    target_url   text NOT NULL,
    -- Denormalised so cohort queries can group by host without parsing URLs.
    target_host  text NOT NULL,
    kind         text NOT NULL,
    grade        text,
    score        integer,
    findings     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Measured cost of this scan in USD micros (millionths). PR 0.6 showed a
    -- deep scan costs ~$0.004, so cents would round every scan to zero.
    cost_usd_micros bigint NOT NULL DEFAULT 0,
    duration_ms  integer,
    created_at   timestamptz NOT NULL DEFAULT now(),
    -- Six months, per PRD §5.7. Phase 2 stores and displays this honestly;
    -- Phase 4 is what actually deletes on it. Storing it now means the date a
    -- customer was shown is the date we enforce, rather than one recomputed
    -- later under different rules.
    expires_at   timestamptz NOT NULL DEFAULT (now() + interval '6 months'),
    CONSTRAINT scan_kind_check CHECK (kind IN ('surface', 'deep')),
    CONSTRAINT scan_grade_check CHECK (grade IS NULL OR grade IN ('A','B','C','D','F')),
    CONSTRAINT scan_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);

CREATE INDEX scan_customer_idx ON scan (customer_id);
CREATE INDEX scan_site_idx ON scan (site_id);
CREATE INDEX scan_created_idx ON scan (created_at DESC);
-- Drives the Phase 4 deletion job and the expiry-warning emails.
CREATE INDEX scan_expires_idx ON scan (expires_at);
-- Drives the Phase 5 peer comparison, which is hidden below a 100-scan cohort.
CREATE INDEX scan_cohort_idx ON scan (kind, created_at DESC) WHERE score IS NOT NULL;

-- ── report ────────────────────────────────────────────────────────────────
-- A generated PDF (PR 2.4). Separate from `scan` because one scan can produce
-- several reports over time, and because the blob reference has a different
-- lifecycle from the findings.

CREATE TABLE report (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id     uuid NOT NULL REFERENCES scan(id),
    customer_id uuid REFERENCES customer(id),
    -- Where the rendered PDF lives. Null while generation is pending.
    storage_key text,
    -- Which tier's content was baked in, so a downgrade cannot retroactively
    -- widen what an already-issued PDF contained.
    entitlement text NOT NULL,
    delivered_to text,
    delivered_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX report_scan_idx ON report (scan_id);
CREATE INDEX report_customer_idx ON report (customer_id);

-- ── purchase ──────────────────────────────────────────────────────────────
-- One-time purchases (Extended Archive, single deep scans). Subscriptions live
-- in `subscription`; mixing them would make "what did this customer buy?"
-- two queries with different shapes.

CREATE TABLE purchase (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  uuid NOT NULL REFERENCES customer(id),
    scan_id      uuid REFERENCES scan(id),
    product      text NOT NULL,
    -- Integer minor units. See the note at the top of this file.
    amount_cents integer NOT NULL,
    currency     text NOT NULL DEFAULT 'USD',
    status       text NOT NULL,
    external_id  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT purchase_status_check
        CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
    CONSTRAINT purchase_amount_nonneg CHECK (amount_cents >= 0)
);

CREATE INDEX purchase_customer_idx ON purchase (customer_id);
-- A payment webhook can arrive more than once. This makes a replay a no-op
-- instead of a second charge record.
CREATE UNIQUE INDEX purchase_external_id_key ON purchase (external_id)
    WHERE external_id IS NOT NULL;

-- ── event_log ─────────────────────────────────────────────────────────────
-- Append-only audit trail: entitlement grants, revocations, deletions,
-- webhook receipts. Phase 4's retention job must be able to prove a deletion
-- happened, and Phase 3's lifecycle work must be able to explain why someone
-- lost access.

CREATE TABLE event_log (
    id          bigserial PRIMARY KEY,
    customer_id uuid REFERENCES customer(id),
    -- Machine label, e.g. 'entitlement.granted', 'scan.deleted'.
    kind        text NOT NULL,
    -- Structured context. No secrets, no tokens, no request bodies — same
    -- rule as docs/ALERTING.md.
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_log_customer_idx ON event_log (customer_id);
CREATE INDEX event_log_kind_idx ON event_log (kind, created_at DESC);
