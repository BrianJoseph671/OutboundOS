---
name: frontend-worker
description: Implements frontend features — React components, hooks, pages, and UI integration with TDD
---

# Frontend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features involving:
- React components (client/src/components/)
- React pages (client/src/pages/)
- Custom hooks (client/src/hooks/)
- Routing changes (App.tsx, wouter)
- Sidebar navigation (app-sidebar.tsx)
- TanStack Query integration
- UI styling with TailwindCSS v4 and shadcn/ui

## Work Procedure

### 1. Understand the Feature

Read the feature description and check existing code:
- `client/src/App.tsx` — routing, layout shell
- `client/src/hooks/useContacts.ts` — data fetching pattern
- `client/src/lib/queryClient.ts` — apiRequest helper
- `client/src/components/app-sidebar.tsx` — navigation
- `client/src/pages/contacts.tsx` — contacts page structure
- `.factory/library/architecture.md` — patterns

### 2. Write Tests First (RED)

Before implementing:
- Create test file (e.g., `client/src/__tests__/` or co-located)
- Write component tests for rendering, user interactions, data display
- For hooks: test query behavior, mutation side effects
- For forms: test validation, submission, error display
- Run tests to confirm they FAIL

### 3. Implement (GREEN)

Implement to make tests pass:
- Use shadcn/ui components from client/src/components/ui/
- Use Lucide React icons (h-4 w-4 inline, h-5 w-5 buttons)
- Use TailwindCSS v4 utility classes only
- Use wouter for routing (NOT react-router)
- Use TanStack Query for data fetching
- Use apiRequest() for HTTP calls
- Follow existing page patterns (contacts.tsx is the reference)

### 4. Verify Manually with agent-browser

After tests pass:
- Start the dev server: `npm run dev` (wait for port 5000)
- Use agent-browser to navigate to the relevant page
- Verify visual rendering: layout, spacing, icons, badges
- Test user interactions: clicks, form submissions, navigation
- Check both light and dark modes for new components
- Verify no console errors

### 5. Run Checks

- `npm run check` — TypeScript must pass
- `npx vitest run` — all tests must pass

## Conventions

- **Imports:** Use `@/` for client/src, `@shared/` for shared/
- **Components:** Use existing shadcn/ui (Dialog, Sheet, Badge, Button, etc.)
- **Icons:** Lucide React only. Standard sizes: h-4 w-4 (inline), h-5 w-5 (buttons)
- **Styling:** TailwindCSS utilities. Semantic colors (text-muted-foreground, bg-secondary, etc.)
- **State:** TanStack Query for server state. No Redux, no Zustand.
- **Forms:** react-hook-form + @hookform/resolvers (Zod bridge)
- **No CSS modules, no inline styles, no styled-components**

## Example Handoff

```json
{
  "salientSummary": "Built interaction-timeline.tsx component with chronological list, channel icons, direction badges, and empty state. Integrated into contacts.tsx detail panel. Added 'Log Interaction' dialog with form validation. Dark mode verified via agent-browser. 8 tests passing.",
  "whatWasImplemented": "Created client/src/components/interaction-timeline.tsx rendering interactions sorted by occurred_at desc with Mail/Phone/Calendar/Linkedin Lucide icons, inbound/outbound Badge indicators, and date-fns formatted timestamps. Added useInteractions hook fetching from GET /api/interactions?contactId=X. Integrated timeline into ContactDetail component in contacts.tsx. Added 'Log Interaction' Sheet with react-hook-form (channel select, direction radio, date picker, summary textarea). On submit, POST /api/interactions with query invalidation. Empty state shows MessageSquare icon with 'No interactions yet' text and 'Log your first interaction' CTA.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm run check", "exitCode": 0, "observation": "No TypeScript errors" },
      { "command": "npx vitest run", "exitCode": 0, "observation": "8 tests passing, 0 failing" }
    ],
    "interactiveChecks": [
      { "action": "Navigate to /contacts, select a contact with interactions", "observed": "Timeline renders 5 interactions in reverse chronological order with correct icons and dates" },
      { "action": "Select a contact with no interactions", "observed": "Empty state with MessageSquare icon and 'No interactions yet' message shown" },
      { "action": "Click 'Log Interaction' button, submit empty form", "observed": "Validation errors appear for channel and date fields, no network request made" },
      { "action": "Fill form and submit", "observed": "Success toast, dialog closes, timeline updates with new entry" },
      { "action": "Toggle dark mode", "observed": "Timeline entries, badges, and form render correctly in dark theme" }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "client/src/__tests__/interaction-timeline.test.tsx",
        "cases": [
          { "name": "renders interactions in reverse chronological order", "verifies": "Timeline sorting" },
          { "name": "shows empty state when no interactions", "verifies": "Empty state rendering" },
          { "name": "displays correct channel icon for each type", "verifies": "Channel icon mapping" },
          { "name": "form validation prevents empty submission", "verifies": "Required field validation" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- API endpoint the component depends on doesn't exist or returns unexpected data
- A shadcn/ui component needed isn't installed (check client/src/components/ui/)
- The existing page structure requires significant refactoring beyond the feature scope
- Auth flow can't be tested because backend auth isn't wired up yet
