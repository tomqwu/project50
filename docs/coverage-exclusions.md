# Coverage Exclusions (audited)

Hard gate: 99% lines/branches/functions/statements across the repo.
Only files that cannot or should not carry unit coverage are excluded — each with a reason.
Adding to this list is a reviewed decision, not a way to pass the gate.

| Pattern | Reason |
|---|---|
| `**/*.config.*` | Build/tool config, no runtime logic to test. |
| `**/*.generated.*` | Generated code (e.g. Prisma client) — owned by the generator. |
| `**/dist/**`, `**/.next/**` | Build output. |
| `**/*.d.ts` | Type declarations only. |

We do NOT pad coverage with assertion-free tests. If a real file is hard to cover,
we refactor it to be testable rather than exclude it.
