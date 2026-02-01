# Writing Effective Cursor Project Rules (.mdc)

This guide explains how to design, structure, and maintain high‑impact Cursor project rules for this codebase. It reflects current 2025 practices and the conventions already used here.

## What project rules are
Project rules are versioned instructions stored in `.cursor/rules/*.mdc` that guide Cursor Agent and Inline Edit. They are included in prompts based on the rule type and `globs` scope.

## Rule anatomy (frontmatter + body)
Keep frontmatter minimal and consistent:

```md
---
description: Concise, action-oriented summary (<= 60 chars)
globs: path/pattern1,another/pattern2,one/more/**
alwaysApply: false
---

- Actionable bullet one
- Actionable bullet two
```

Notes:
- Use one-line, comma-separated `globs` (house style).
- Prefer `alwaysApply: false` unless the rule is very small and universally safe.
- Put additional details in the body, not in frontmatter.

## Rule types (how they attach)
- Always: Always included in context (use sparingly; small rules only).
- Auto Attached: Included when referenced files match `globs` (default for most rules).
- Agent Requested: Available for the agent to attach when relevant; requires a good `description`.
- Manual: Only included when explicitly mentioned (e.g., `@004-auth-and-middleware`).

Set the type from Cursor's Rules UI; the file content uses the same frontmatter either way.

## Content style
- Be specific and imperative: "Use NextAuth v5 server-side sessions; never expose tokens client-side."
- Encode decisions and constraints the model must follow, not vague suggestions.
- Prefer short, scannable bullets; group by topic.
- Include references to local files with `@path/to/file.ts` when useful.
- Keep rules under ~100 lines. Split by domain when they grow.

## Naming and organization
- Use numeric prefixes to convey category and ordering:
  - 001-099: Core and AI integration
  - 100-199: (unused yet)
  - 200-299: (unused yet)
  - Add new rules after existing numbers (e.g., 008-...)
- Keep domain-specific topics separate (auth, testing, deployment, streaming/RAG, etc.).

## Globs: house patterns
- Single line, comma-separated list, no quotes: `globs: app/**,components/**,middleware.ts`
- Prefer precise scopes: target only where the rule applies.
- Common examples in this repo:
  - App routes/components: `app/**/*.ts,app/**/*.tsx`
  - Components: `components/**`
  - Server/db: `lib/db/**`
  - AI: `lib/ai/**,app/(chat)/api/chat/**`
  - Testing/config: `tests/**,playwright.config.ts`

## Templates

### Short "standards" rule (Auto Attached)
```md
---
description: API route input validation and error patterns with zod
globs: app/**/api/**,lib/**
alwaysApply: false
---

- Validate all request bodies with zod schemas before use.
- Return 400 with details on validation errors; never leak stack traces.
- Use NextResponse.json({ error: '...'}, { status }) for errors.
- Log errors server-side; never include secrets in error messages.
- Add or update route tests under tests/routes/ for new endpoints.

@tests/routes/document.test.ts
```

### Domain rule (Manual or Agent Requested)
```md
---
description: UI component patterns with Tailwind and shadcn/ui
globs: components/**,app/**/*.tsx
alwaysApply: false
---

- Prefer RSC; mark interactive components with 'use client'.
- Style with Tailwind utilities; reuse shadcn/ui where available.
- Keep props typed; avoid any. Co-locate variants with components.
- Use Suspense/Skeletons for async boundaries.
- Avoid inline secrets/env; read from server boundaries only.
```

## Referencing local files
Add `@relative/path` lines to have Cursor include those files as context whenever the rule attaches. Use for canonical examples, schemas, or config.

Examples:
- `@lib/ai/models.ts` for abstract model IDs
- `@lib/ai/providers.ts` for provider mapping
- `@middleware.ts` for protected route matcher

## What to put in rules vs code
- Put non-obvious constraints, repeatable patterns, naming, architecture decisions, and error handling policies in rules.
- Keep implementation details in code (and tests); reference them from rules with `@file` lines.

## Testing rules work
1. From Cursor, open the Rules panel; ensure the rule is present and of the expected type.
2. Open a file that matches `globs`; confirm the rule shows as Active.
3. Manually tag a rule in chat: `@005-testing-and-quality` to include it.
4. Verify behavior (e.g., the agent follows the constraints) or ask: "Which rules are active now?"

If a rule does not attach:
- Check `globs` spelling (house style: one line, comma-separated).
- Ensure `.mdc` extension and file in `.cursor/rules/`.
- Provide a meaningful `description` (required for Agent Requested).
- Restart Cursor if UI shows stale rule metadata.

## Anti-patterns to avoid
- Bloated frontmatter (only keep `description`, `globs`, `alwaysApply`).
- Vague bullets (e.g., "Write good code"). Make them testable.
- Over-broad `globs` that pull rules into unrelated edits.
- Giant single rule files. Split by domain at ~300-500 lines.
- Duplicating the same guidance across multiple rules (link with `@file` instead).

## Repo-specific best practices
- Use abstract model IDs from `lib/ai/models.ts` and provider mapping in `lib/ai/providers.ts`.
- Handle xAI exhaustion with user-friendly messages in chat routes; hide provider details.
- Keep streaming architecture (`createUIMessageStream`, `smoothStream`, `JsonToSseTransformStream`).
- Use Drizzle migrations in builds (Vercel); never hardcode secrets.
- Maintain tests with Playwright; ensure `pnpm lint` and `pnpm test` pass prior to commit.

## Maintenance checklist
- Rule has clear `description` and minimal, one-line `globs`.
- Scoped and actionable bullets; no filler text.
- Links `@file` for canonical examples where helpful.
- Sized reasonably; split when too long.
- Verified attaches to intended files and not to others.

## Quick start: create a new rule
1. Cmd/Ctrl + Shift + P -> New Cursor Rule.
2. Fill frontmatter using the house style (one-line `globs`).
3. Add 5-15 focused bullets; include `@file` references as needed.
4. Choose type (Auto Attached is typical) in the Rules UI.
5. Test attachment with a matching file open.

## References
- Cursor docs: Rules, rule types, nested rules, and best practices.
- Existing rules in this repo (001-007) as concrete examples.

---
For questions or improvements, open a PR updating this guide or add a focused rule and reference it here.
