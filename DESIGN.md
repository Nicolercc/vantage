# Vantage design

One page on how Vantage looks and why, written from what the code already
uses. When the code and this page disagree, fix one of them in the same PR.

## Principles

1. **Answer first, then proof, then context.** A brief opens with the
   30-second answer, then the checked facts with their quotes, then who and
   where. Nobody should scroll past background to reach what happened.
2. **Every fact shows where it came from.** A number or quote links to its
   source in one tap, and the outlet's name is on the way out.
3. **Say what things are.** Labels name what a tap opens ("Explore coverage
   of Sudan", "Read the original on Africanews"), never a vague "Learn more".
4. **Plain words, sentence case.** No all-caps labels, no jargon a reader
   must already know.

## Tokens

Defined in `artifacts/vantage/src/index.css` (`:root`) and, for the home
page, `src/pages/HomePage.css` (`.home`). Use the variable, not the hex.

| Token | Value | Use |
| --- | --- | --- |
| `--gutter` | 20px | Side margin on every page; everything shares this left edge |
| `--content` | 760px | Reading width of a brief |
| `--tap` | 44px | Minimum height of anything you can tap |
| `--bg-primary` | #f7f4ef | Page background (brief) |
| `--bg-surface` | #ffffff | Cards, pop-ups |
| `--text-primary` | #1a1614 | Body text and headlines |
| `--text-secondary` | #3d3835 | Supporting text |
| `--text-muted` | #6b6561 | Dates, counts, meta lines (4.5:1 on white) |
| `--accent-navy` | #2b4c7e | Links, focus rings, quiet actions |
| `--risk-low` / `-bg` | #2d6a4f / #ebf5f0 | "Ready", checked |
| `--risk-medium` / `-bg` | #8b6914 / #fbf5e6 | "More than two weeks old", partly checked |
| `--risk-high` / `-bg` | #8b3a3a / #f5eaea | Errors, unverified |
| `--home-sand` → `--home-sand-deep` | #f3efe8 → #e8e2d8 | Home hero gradient; test contrast against the deeper end |
| `--home-accent` | #b84356 | The one primary button (Explain) |

**Text floor.** Nothing below 13px in the app; home stylesheet tests enforce
11px minimum and 4.5:1 contrast for every text style
(`src/pages/home-text.test.ts`), and the browser tests enforce 13px and
44px taps on real pages (`e2e/support.ts`).

## Type roles

| Face | Role | Examples |
| --- | --- | --- |
| Newsreader (serif) | Headlines and reading text | Brief headline, Start here headline, facts |
| Plus Jakarta Sans | Interface: labels, buttons, meta lines, cards' small print | "Start here", "Explain", "Sudan · Nov 16, 2026" |
| IBM Plex Mono | Small data labels: dates, counts, map tags, source meta | Citation pop-up meta, map labels |

Don't add mono to new section titles; PR 1 moved those to sentence-case sans.

Sizes in use: home h1 40–60px, brief h1 26–36px (both `clamp`), card
headline 22px, reading text 17px, UI text 15px, meta 13px.

## Components added in PR 1

**Sample banner** (`.ci-sample-banner`, `BriefView` with `sample`). One line
above a sample brief's headline: "Reviewed sample from Nov 16, 2026 ·
doesn't update". `role="note"`. The date is the UTC date, so it reads the
same everywhere.

**Start here card** (`.home-start__card`, `Home.tsx`). The whole card is one
link to `/sample/<slug>`. Pill ("Ready", or amber "More than two weeks old"
after 14 days), place and date, serif headline, one line on why it matters,
and a 44px "Read in about a minute →" row. On a 375×812 phone the search box
and the whole card must fit above the fold; `e2e/home.spec.ts` checks it.

**Quote disclosure** (`QuoteDisclosure` in `Evidence.tsx`). On the first
checked fact that has a quote: a "See source quote ▾" button
(`aria-expanded`, `aria-controls`) opening the exact quoted words, the
outlet and date, and "Read the original on {outlet}" (new tab, said aloud).
Escape or "Hide quote" closes it and returns focus to the button. It shares
`SourceBody` with the numbered citation pop-ups, so both always show the
same thing.

**Sentence-case label** (`.home-label`). 15px semibold sans, no tracking, no
capitals: "Start here", "Try a topic", "More from today's coverage". Replaces
the old monospace uppercase section titles.

## Checks before merging UI work

- `pnpm --filter @workspace/vantage e2e`: phone 375×812 and desktop
  1280×800, axe WCAG 2.1 AA, 44px taps, 13px text, shared left edge, no
  sideways scroll.
- Look at the page at both sizes yourself; tests catch rules, not taste.
- VoiceOver pass on any new interactive part.
