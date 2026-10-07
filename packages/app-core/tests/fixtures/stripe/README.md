Stripe event fixtures, written by hand in the shape Stripe documents for API version
2025-03-31.basil (https://docs.stripe.com/api/events/object). Not captured from a live account:
every id is fake, and the client id is a placeholder. Tests sign them at runtime with a test secret.
Re-record from `stripe trigger <event>` against a test-mode account if the shape ever drifts.
