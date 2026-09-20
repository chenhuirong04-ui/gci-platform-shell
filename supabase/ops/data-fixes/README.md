# ops/data-fixes — one-off Production data changes

Scripts here change **data**, not schema. They are not migrations: they are never replayed, never part of a rebuild, and each one is
hard-coded to the state Production had on the day it was written (row counts, ids). Keep them as the record of what was done.

| file | what it does | executed? |
|---|---|---|
| `20260915_transactions_cleanup.sql` | Deletes/dedups historical `transactions` rows and assigns bank accounts. Written against 8932 rows, ends at exactly 8; hard guards abort on any mismatch. | **UNCONFIRMED.** Production now has **7** rows, not the 8 its post-flight guard requires, so the row count alone proves nothing (it may have run and a row changed later, or it never ran). Run `verify_20260915_transactions_cleanup.sql` (read-only): if conditions 2–8 hold it very likely ran; if 6/7/8 fail it did not. The definitive record is the SQL Editor history. **Do not register it in the ledger as executed until confirmed.** |

Rules: one transaction, pre-flight guard, post-flight guard, no dependence on wall-clock time, header states the Production state it expects and the date it was executed.
