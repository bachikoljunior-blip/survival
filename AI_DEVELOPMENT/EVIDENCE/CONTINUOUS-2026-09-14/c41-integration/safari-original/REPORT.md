# C40 original Safari results

C40 source and PR reached product 8c through the new preopen procedure and both failed the existing street acquisition clock guard. Standalone passed its 27 checks with audio capture disabled. The current PR F3 blocker is the street clock, followed by the correctly rejected lifecycle precondition; it is not the C39 MobileSafari launch failure.

| Scope | Run / Safari job | Result | Preopen / exact bootstrap | Audio |
|---|---|---|---|---|
| source | 34895775143 / 104149240903 | 45 of 47 checks passed | one openurl, 12045 ms, URL and marker verified | 3 clips reported; street failed |
| PR | 34895779614 / 104149254034 | 45 of 47 checks passed | one openurl, 13285 ms, URL and marker verified | 3 clips reported; street failed |
| standalone | 34895774407 / 104149237314 | 27 of 27 passed | one openurl, 28366 ms, URL and marker verified | disabled; zero clips |

All are accepted attempt 1. Canonical source head is 8058f8431b7885e9e929e6cb57bb415d26d9f5b1. PR actually checked out merge 051d718255ef21c4ba37947f8177d4121cd159d3, whose parents are main 5456371249f5769c25d18f1686a44349e4292d6f and that source head. Its tree matches C40 56dad9f8c5fea165b63de2241b1016fcf20cef93. Source and standalone checked out the source head.

The explicit startup records show local-simctl-preopen, one successful invocation and the exact owned loopback URL with ready marker in all three sessions. Product checks followed. This is real evidence that the new sequence passed the previously blocking startup stage in these runs. Original Appium bytes are unavailable here, so internal native-session command ordering was not independently read. This does not establish complete repair of all historical C38 WebInspector or C39 WDA failures.

The source and PR recording provenance matches root/dist 8c5624edd96ba238135e46c90e53c6221b3c3303b977bb5d4e41b752264d94f0, harness a278b87f0fb2e15b843205b6fe211a8046f72463e2f29956bfbf867f5900adee and inline helper e4f36959ec83f4d4112bda7be27e081ba0e721ee27784705a21a59c4c31d0262. Recorder, transfer, frame probe, preparation and run pins were also checked in analysis.json. Standalone has no audio provenance assertions.

| Street endpoints | source | PR |
|---|---:|---:|
| Audio seconds | 10.488000 | 10.432000 |
| Engine seconds | 9.850000 | 9.866667 |
| Engine / audio | 0.939168574 | 0.945807771 |
| Audio minus engine | 0.638000 s | 0.565333 s |
| Existing tolerance | 0.524400 s | 0.521600 s |
| Excess beyond tolerance | 0.113600 s | 0.043733 s |

All six compact clip records report complete, finite, ordered telemetry. Gas and arcade clocks pass in each audio run. Actual full report timelines and MP4 bytes have not been recovered; their reported byte counts and SHA values are preserved without claiming local media verification. Source release passed after fixed-step progress in 5 ms; PR in 8 ms. Both report zero movement input and inactive stick afterward, with no cleanup errors. Lifecycle boundary operations were not run because the street acquisition failed. The lifecycle failure and final generic capture error follow that first failure. Both F3 execution logs explicitly report core=success Safari=failure.

Five completed original decoded log responses were fetched exactly once and saved without truncation: three Safari and two F3 execution logs, totaling 3,458,995 bytes. Response-byte SHA comparisons and trailing job cleanup were checked. The compact parsed JSON summaries are derived records, not recovered original pretty-printed report bytes.

All three jobs have frame-work environment 0 and no detailed profile. Original startup Appium export was absent: the workflow exports it for pre-session failure, while these sessions reached gameplay; the passing standalone explicitly skipped startup raw export. The adopted inline helper pin does not establish that a particular small-reply chunk command was omitted. Appium command evidence is still required. The C38 92-second street interval had different product/profile conditions; comparing these elapsed values cannot identify causal improvement or CPU/GPU work.

Canonical artifact metadata matches each original upload line:
- PR artifact 10369332540, 13,459,726 bytes, ZIP SHA256 1a316ac9b028cb6b3d1f126401c36bef33e8b9eac869db367ecb50e1cddcd1a2.
- Source artifact 10368853444, 13,097,311 bytes, ZIP SHA256 1841aaa343202a0709b5b9e7940f1017d9709a275d3131ae3f6a547337ecba60.

No ZIP was read. The next authorized preparation is a separately named fixed PR recovery helper/job for only the original full report and Appium log. This can locate the current street loss and inspect inline command intervals without guessing a product setting. No current runtime or threshold repair is claimed.

Verification: verify_results.py and the saved-response analysis scripts pass. Clock tolerance max(0.1 s, 5% audio), 4 fixed substeps, existing deadlines and caps are unchanged. Remote writes, additional CI, reruns, automation and Library access: zero. All 19 quality elements remain not measured; 71 criteria, valid blind 0, units 0, continuous mode. Start 2026-09-13T20:56:49+09:00 and deadline 2026-09-20T20:56:49+09:00 remain fixed.
