---
name: fix-types
description: After each edit of typescript files, run this to catch type errors immediately. 
---

# Fix TypeScript Errors

1. Run `npx tsc --noEmit` to get all current errors
2. Group errors by file
3. Fix each file, re-running tsc after each fix
4. Do NOT consider done until `npx tsc --noEmit` returns 0 errors
5. If a fix causes new errors in other files, fix those too