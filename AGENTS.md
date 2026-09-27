# LocalLead

- This directory is the standalone LocalLead project root. Keep all project work within this repository.
- Use pnpm, preserve the lockfile, and run `pnpm lint`, `pnpm test`, `pnpm build` after material changes.
- Never expose provider secrets to client modules. Database calls use the user's session and RLS, not a service-role key.
- No automatic external messaging. Contact actions may only open a draft/page after a user click.
- Unknown is preferable to invented data. Positive scoring and outreach need attributable evidence. A public phone does not prove WhatsApp availability.
- Preserve opt-out records and dedup aliases. Keep source, message and event history.
- Demo mode must work without credentials and must not consume provider APIs.
- Unit/provider tests are offline; database tests execute the actual migration with an embedded Postgres and a simulated Auth identity function. Live Auth requires a configured Supabase project.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
