# Launch video-first layout

## Problem

The Launches directory and detail pages treated editorial framing as the primary content. At a 1280 × 720 viewport, the first directory card began at 1027px and the detail video began at 701px. The primary user tasks—finding a video and watching a video—were therefore outside the first screen.

## Design decision

Use a video-first hierarchy while preserving VentureDex's editorial typography and neutral visual system.

- Directory: replace the full-screen hero with a compact channel header, small index heading, inline filters, and the card grid immediately below.
- Detail: place a restrained title-and-facts column beside the video player on desktop. Stack the same two regions on narrow screens, with the player directly after the title.
- Remove duplicate summary copy above the player. Keep the fuller VentureDex brief below the video.
- Cap page-level display type below the former poster-scale sizes; card typography remains unchanged.

## Acceptance criteria

- At 1280 × 720, at least one directory video preview is visible without scrolling.
- At 1280 × 720, the detail video is substantially visible without scrolling.
- At 390 × 844, both pages retain a clear single-column reading order with no horizontal overflow.
- Search, category filters, video playback, canonical URLs, and native VentureDex detail routes continue to work.
