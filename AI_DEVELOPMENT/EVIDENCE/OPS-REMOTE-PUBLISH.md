# OPS-REMOTE-PUBLISH evidence

- Recorded: 2026-08-01 JST
- Repository: `bachikoljunior-blip/survival`
- Public URL: https://bachikoljunior-blip.github.io/survival/
- Final verified `main`: `cc96f3a6cd94e11d3c71342ed568816ed55a9e59`
- Rollback point before publication: `924c456df8ff62b904e148cee6b9ba0e87017235`

## Remote integration

- PR #2: https://github.com/bachikoljunior-blip/survival/pull/2
- PR #2 merge: `ceb34cc022997dc2e8e63d0628f44f6694a97318`
- Gate B remote head: `2335ea195506806916f5f3484e096922d5de2da7`
- The remote Gate B head used the exact local verified tree `08edf79599f92a045412a6ea44e4a0df9877a033`; its commit SHA differs from the local commit because the GitHub connector authored the commit after shell credentials were unavailable.
- PR #3: https://github.com/bachikoljunior-blip/survival/pull/3
- PR #3 merge and final baseline: `cc96f3a6cd94e11d3c71342ed568816ed55a9e59`
- Pages root-mirror tree: `d910f9c5c68dc772c18eb7d4ebd65c145c0de843`

## Deployment

- `Deploy to GitHub Pages` run `30662749145`: completed / success.
- Dynamic `pages build and deployment` run `30662747958`: completed / success.
- Initial PR #2 Actions deployment succeeded, but the still-enabled `main/(root)` branch deployment later replaced the game with rendered `README.md`.
- Recovery: PR #3 added a byte-identical production mirror at the configured Pages root plus deterministic generation and validation commands. Both deployment paths now publish the same game.

## Public-surface verification

- HTTP result: `200 OK`, `content-type: text/html; charset=utf-8`.
- HTML title: `CINDERLINE`; the page contains the game canvas and loads `cinderline.1.0.0.js`.
- `index.html`: `b8d3749a8151f54490876f57b2ced5ea1642348ffe5fbe0cfb53fd7cf3e50389`
- `cinderline.1.0.0.js`: `a3a8d61285b13ffc9d69ee9ee5bf280b00f2df5a11375f46f9cc1167108cf73d`
- `styles.css`: `aa3324f9f4a597878bd7406bac09531c169f612a750e2e4d8452693bc449031e`
- `manifest.webmanifest`: `04581fc9c19cf89456169c3f850c4421c72acafd4409d3f2a78292d17e971049`
- Each public hash exactly matched the corresponding verified local production file.

## Limitation

The cloud browser fetched and executed the public JavaScript, selected Japanese from its browser locale and reached renderer initialization, but its sandbox advertises WebGL as disabled. It therefore showed the intended localized WebGL-unavailable recovery message instead of setting `CINDERLINE.ready`. This is an environment limitation, not physical-device or gameplay evidence. The prior Playwright SwiftShader suite remains the runtime evidence, and no iPhone SE 3 FPS or real-touch claim is made.
