---
name: new-section
description: Creates a new section. Use when user asks to 'create a new section'.
---

# Steps

1. Read existing section examples: `libs/cms/section/feature/` for patterns
2. Extend SectionModel in libs/shared/models/src/lib/section.model.ts
3. Add vest validations in libs/cms/section/util/src/lib
2. Create component, store, and type files following existing conventions, consider the naming conventions in CLAUDE.md
3. Use Angular signals (not legacy inputs)
4. Register in section.store.ts
5. Run `npx tsc --noEmit` before reporting done