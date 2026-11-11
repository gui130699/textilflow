# TêxtilFlow

## Architecture

- Next.js App Router, React, strict TypeScript, Tailwind, shadcn-style Radix components.
- All business writes go through Firebase callable Cloud Functions in `functions/src`.
- `functions/src/domain.ts` is the shared Zod contract. Do not import Admin SDK into client code.
- `src/features` contains workflows, `src/services` callable transport, `src/hooks` session and pagination.
- Firestore Standard, production region `southamerica-east1`. Project `textilflow-gui130699`.
- Only `demo-textilflow` may receive test data. Never run seed against production.

## Mandatory invariants

1. Every operational path is scoped to a company. Read the active membership inside every write transaction.
2. Owner is read-only. Inspector claim permits creating companies; membership permits managing an existing company.
3. Production uses integers, atomic balances and immutable ledger entries. Never update or delete ledger entries.
4. Repeated operation IDs must match payload hashes. Reversals use unique compensating events.
5. Sum of balances, including shipped and losses, must equal net cut. Never confuse cumulative totals and current stock.
6. Lot color and size are immutable. No transfers across lots or variants.
7. Material decimals use scaled integers with precision 0.001. Critical timestamps come from the server.
8. Public signup never grants membership. Invitations require verified matching email, expiry and one-time consumption.
9. Files remain private. Use authenticated Storage downloads, not persistent public download tokens.
10. Preserve historical references by deactivating, never deleting, catalogs.

## Workflow

- Read `docs/IMPLEMENTATION_STATUS.md` before claiming completion.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Build Functions before integration tests: `npm --prefix functions run build`.
- Start `npm run emulators`, run `npm run test:integration`, then `npm run seed` and `npm run test:e2e`.
- Use `npm ci` and `npm --prefix functions ci` for reproducibility.
- Do not commit environment files, credential files, emulator state, screenshots of private data or logs.
- Never enable Blaze or provision billable resources without explicit user authorization.
- Production deployment is not verified until login, callable writes and multi-company permissions have been checked online.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
