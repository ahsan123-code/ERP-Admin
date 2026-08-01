# ERP Redesign Prototype

A clickable prototype of a redesigned UI for the Ahsan Brothers Steel ERP.
Plain HTML/CSS/JS — no build step, no dependencies, no network.

## Open it

Double-click **`index.html`**. That's it. It works from `file://`.

If your browser blocks `localStorage` on `file://` the theme and branch simply
won't persist between pages; everything else behaves normally. To avoid that:

```bash
cd design
python -m http.server 8080
# then open http://localhost:8080
```

## What's here

| File | What it shows |
|---|---|
| `index.html` | Foundations — colour, type, spacing, radius. Start here. |
| `components.html` | Buttons, pills, form controls, numeric tables, loading states |
| `dashboard.html` | Stat tiles, sales chart, activity feed, low-stock table |
| `customer-balance.html` | The report we have been fixing, with its loading state |
| `expense-accounts.html` | Branch-scoped create form beside its list |

`assets/tokens.css` is the whole design system. Change a value there and every
screen follows — that is the point of the exercise.

## Things to try

- **Toggle Dark / Light** (top right of the amber bar) on every page.
- **Switch branch** in the top bar — it persists across pages, and the figures
  change with it.
- **"Simulate loading"** on Customer Balance and Components — shows the skeleton
  state rather than a stale number.
- **Tab through** the form controls to see focus rings.

## What changed, and why

**Neutrals are cooler and flatter.** The current greys sit on a warm axis while
the indigo accent is cool, which makes surfaces look slightly muddy beside it.

**Shadows are much lighter.** This is a dense data tool. Heavy card shadows add
visual noise between tables sitting side by side, so hierarchy comes from
hairline borders and surface steps instead.

**Colour only ever carries meaning.** One accent, used for interactive and
selected states — never decoration. Status and money use the semantic ramp.

**Debit reads cool, credit reads warm.** A column of figures becomes scannable
without reading the Dr/Cr suffix on every row.

**Body text is 13px, not 14.** At this data density 14px forces either fewer
rows on screen or tighter line-height; 13px with tabular figures reads better.

**Tables lost their zebra striping.** Stripes fight the status pills and the
Dr/Cr colouring. Hairline row dividers and a sticky header do the same job
without competing for attention.

**One branch selector per screen.** Two separate branch controls — one to view,
one to write — let you file a record against a branch you are not looking at.

## Status

Nothing here is wired into the app. `erp-client/` is untouched.

Verified: every token referenced is defined, markup is balanced, and all asset
paths resolve. **Not** verified by eye — this session has no browser automation,
so nobody has actually looked at these pages yet. Open `index.html` and judge it
before any of it gets implemented.

## If we proceed

The app is well set up for this: it already uses CSS custom properties and
shared components (`Card`, `Button`, `DataTable`, `Badge`, `Input`), so most of
a redesign lands by replacing `erp-client/src/styles/tokens.css` and updating
those few shared components. Page-level work is mostly removing one-off inline
styles that bypass the tokens.

Suggested order:

1. Agree the foundations here
2. Port `tokens.css` into the app — this alone reskins most of it
3. Update the shared components to match the prototype
4. Sweep pages for inline styles that ignore the tokens
