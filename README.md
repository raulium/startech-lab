# Startech Lab — Prototype #1

Throwaway playtest page (D-17). Nothing in this folder gets reused in the Godot build.

## Files
- `index.html` / `style.css`: the page
- `config.js`: build tag, Google Form IDs, tuning knobs (O2 drain, costs, fuse timer)
- `content.js`: **all writing and procedures**. Rewrite the manual entries and margin notes here (Week 2).
- `game.js`: the logic
- `analyze.py`: summarizes the Sheet export

## Test locally
Open `index.html` in a browser, adding `?dev=1` to the address. Dev mode logs submissions to the console without sending them.
`?v=A` or `?v=B` forces a variant: A = deferred debt, B = immediate O2 cost.
To reset your own unlocks or variant, clear the site's local storage.

## Deploy
Push to your GitHub Pages repo and share the unlisted URL. Before each round:
1. Bump `build` in `config.js` (e.g. `proto1-r2`) whenever tuning or content changes.
2. Make sure the Form is accepting responses. Close it when the round ends.
3. Do one real run yourself and confirm the row lands in the Sheet.

## Analyze
In the Sheet: File → Download → CSV. Then run:

    python3 analyze.py "Startech Lab — Round 1 (Responses).csv"

## Notes
- The form's `rating_funny` column now holds answers to "How fun was it?" (changed in `proto1-r1b`).
- `proto1-r1b` adds random overloads (never starting mid-action), overloads on wrong moves, generator strain → desync,
  shuffled button order, and the final "Transmit Voyage Data Core" objective on the comms panel.
