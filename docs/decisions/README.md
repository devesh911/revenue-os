# Decision records (ADRs)

One file per amendment when a locked decision changes, named `D<nn>-<slug>.md` — where `<nn>` is the **next free id in project-spec §3's log** (D1–D30 are taken; the first ADR here will be D31). Ids are append-only and global across all docs: an amendment to a tech-stack section is still a D-id, never a new T.

Each ADR: Context · Decision · Alternatives · Consequences · Reversal trigger — plus the edits to the affected law-doc(s) in the same PR (registry §0 updated if id classes change).

D1–D30 have **no** ADR files by design: they predate this protocol and their reasoning lives inside the law-docs themselves. ADRs record *changes*, the spec §3 log records *what currently stands*.