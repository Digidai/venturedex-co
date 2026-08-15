# Launch Card Refinement Design

## Decision

Use the approved compact editorial catalog direction: four columns on wide desktop, three on smaller desktop, two on tablet, and one on mobile. The card is a single interactive surface rather than a video tile followed by an unrelated article block.

## Visual system

Each launch sits inside one bordered, rounded shell. A 16:9 video preview forms the top of the card and the metadata, title, identity, tags, and compact action occupy a tightly spaced body below it. The title uses VentureDex's existing editorial serif but drops to roughly 18–20px and is clamped to two lines. Product identity is one line. Only three public tags are shown, on one clipped row, so a noisy record cannot increase card height.

The grid uses real gutters instead of a one-pixel spreadsheet lattice. A restrained shadow, slight upward movement, border emphasis, media zoom, and arrow movement provide one coherent hover response for the whole card. Keyboard focus receives the same clear boundary. Dark mode continues to use existing site tokens.

## Interaction and content

One anchor wraps the complete visual card, so the video, description, and action are a unified destination without nested links. Video previews remain muted, lazy-loaded first-frame evidence; failed media retains the existing typographic fallback. Search, category filtering, pagination, internal detail routes, accessibility labels, and public-data boundaries remain unchanged.

## Success criteria

- Four equal cards fit cleanly on a wide desktop viewport.
- Titles never exceed two lines and cards do not contain large artificial blank areas.
- Static server-rendered cards and client-rendered search/pagination cards have identical markup and styling.
- Video previews load, the full card is keyboard/click accessible, and no horizontal overflow appears at 390px.
