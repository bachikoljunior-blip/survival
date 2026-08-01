# tools/fixtures

Inputs for tests that need data this build did not write.

## `save-v1.json`

A save file in the format the **previously published** build wrote, used by
`tools/save_migration.mjs` to prove that a real player's progress survives a
version change instead of being discarded.

It is not hand-authored. `tools/fixtures/capture_legacy_save.mjs` produced it by
running the game as it stood at the revision recorded in the file's own
`_provenance` block — `source_revision`, which is the authority for where it
came from — and reading back what that build's own save path wrote. The blob
itself is under `payload`; everything outside `payload` is provenance and is not
part of the save.

The fixture must not be regenerated from current code. The moment it is, it
stops being an old-version fixture and the migration test becomes a test of
today's format against itself. If a second format change lands, capture the
new "old" fixture **before** changing the format, the same way, and keep this
one.

There is no automatic drift check. `tools/save_migration.mjs` asserts the
fixture's shape (`_provenance.save_version === 1`, no envelope `v`, real
progress inside) at the top of its unit layer, which is what would catch a
fixture quietly replaced by a current-format save.
