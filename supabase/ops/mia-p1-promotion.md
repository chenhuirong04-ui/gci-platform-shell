# MIA P1 promotion configuration

This integration is fail-closed and remains in preview unless both sides are explicitly enabled after migrations and preview acceptance.

GCI server environment names (values are never committed):

- `MIA_PROMOTION_SECRET`
- `MIA_PROMOTION_MODE=preview` (change to `execute` only for activation)
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `GCI_CRM_BASE_URL`

MIA server environment names:

- `MIA_P1_PROMOTION_MODE=preview`
- `GCI_CRM_PROMOTION_URL`
- `GCI_CRM_PROMOTION_SECRET` (same secret as GCI `MIA_PROMOTION_SECRET`)
- `GCI_CRM_BASE_URL`
- `MIA_P1_TELEGRAM_MODE=preview`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Activation order: apply reviewed GCI migration, apply reviewed MIA migration, configure secrets, verify preview, enable GCI execute, then enable MIA execute. No backfill job is part of this change.
