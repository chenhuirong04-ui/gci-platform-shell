# Knowledge Hub → GCI Platform migration (prepared, not executed)

Moves the standalone Knowledge Hub content (`otnluzvrhbygxvaesqgq`) into the platform database (`efrkvwhzpgahjgfukjth`).

| Step | What | Writes to |
|---|---|---|
| 1 | `supabase/migrations/20260926000100_knowledge_schema.sql` — 7 `knowledge_*` tables, `knowledge_can_read()` RLS, `knowledge_search()` | platform schema (paste in SQL Editor) |
| 2 | `export-kh.mjs --out <file outside repo>` — GET-only export of the 8 in-scope tables + `profiles(id,email)` | a local JSON file |
| 3 | `build-import.mjs --in <export>` — dry-run: counts, FKs, dropped-column checks, confidentiality distribution, commission scan | nothing |
| 4 | `build-import.mjs --in <export> --out <file outside repo>` — writes the guarded one-transaction import SQL | a local SQL file |
| 5 | Review, then paste the import SQL in the platform SQL Editor | 7 `knowledge_*` tables + ledger row `20260926000200` (`data_fix`) |

Guarantees of the generated import: inserts only into the 7 `knowledge_*` tables, `ON CONFLICT (legacy_source, legacy_id) DO NOTHING`
(re-run inserts 0 rows), never UPDATE/DELETE/TRUNCATE; an id already used by a non-Knowledge-Hub row aborts the whole transaction;
postflight fails the transaction unless every table holds exactly the expected rows.

Confidentiality (enforced in RLS): PUBLIC → `knowledge_public` / `knowledge` / `knowledge_confidential`; INTERNAL → `knowledge`;
CONFIDENTIAL → `knowledge_confidential`; ADMIN_ONLY → Admin. Old roles: LEARNER=`knowledge_public`, CONSULTANT=`knowledge`,
MANAGER=`knowledge`+`knowledge_confidential`, ADMIN=`role_label 'Admin'`. Levels are migrated as-is; raise specific rows with
`--raise-confidential id,id` (never lowered). The two "服务中心佣金" rule cards are the official service-centre fee, not partner
commission, and stay PUBLIC.

Export and import files contain INTERNAL content: keep them outside the repo and delete them after the import.
