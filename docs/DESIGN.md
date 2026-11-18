# Scriptorium design principles

This document records a direction, not a fixed specification. Layout, typography, spacing, composition, and interaction details are free to evolve. The working UI is the source of truth for exact implementation.

## Direction

- Make the reading material and the reader's place the focus.
- Keep the product calm and useful, with warmth rather than dashboard chrome or decorative clutter.
- Prefer book-led composition, clear hierarchy, and generous space over generic cards and visual noise.
- Use plain, direct copy. Avoid poetic microcopy, artificial status labels, and unnecessary explanations.
- Make visual experimentation welcome. A different layout can replace the current one when it serves the reader better.

## Shared foundations

- Use the variables in `src/styles/tokens.css` for colours, spacing, type, radii, shadows, and motion. Component styles should not introduce raw colours.
- Preserve the light, sepia, and dark themes. Test important surfaces in all three.
- Inter and Source Serif 4 are the shared typefaces; choose their roles to support hierarchy and reading rather than to imitate a fixed screen.
- Rubric oxblood is the primary accent. Note colours represent content and should not become general interface chrome.
- Icons and common controls should use the shared styles in `src/styles/base.css`.

## Durable experience constraints

- Maintain accessible contrast, visible keyboard focus, useful accessible names, and comfortable touch targets.
- Keep keyboard interactions discoverable; prefer a few simple shortcuts.
- Hide secondary controls to reduce clutter, but keep them available on keyboard focus and touch as well as hover.
- Respect reduced-motion preferences. Motion should explain a state change, not decorate the screen.
- Preserve a usable layout on narrow screens; do not assume desktop pointer or space.
- Never lose the reader's place. Navigation, filters, panels, and view changes should leave an evident way back.
- Avoid reading-time estimates and pressure-oriented progress language. Show pages, percentages, or other concrete progress.
- Protect annotations and user content through destructive actions with clear consequences.
- Keep missing, unavailable, loading, and error states truthful; do not disguise failure as success.

## Working method

Use this document to check intent, then design from the problem rather than from a template. Review the rendered result at multiple widths and themes. Prefer small, testable changes, but do not let the existing composition limit a stronger idea.
