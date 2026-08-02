---
name: first-reader
description: Measure whether a story is reaching a reader, by giving people who have never seen it only the text that appears on screen, stopping them mid-read to commit to what they expect, who they trust and what they are afraid of losing, and keeping only the confusions several independent readers reached on their own. Also decomposes "the voice is off" into distributions that can be counted. Use when asked whether a story lands, whether a choice matters, whether a chapter sets anything up, whether the characters sound different from each other, or to record a before-and-after baseline around a narrative fix. 物語が読者に届いているかの測定・期待と迷いと記憶の確認・語感と語調の分解にも使う。
---

# Read what is on the screen. Nothing else.

On `survival`, an independent critique raised six major narrative findings and **all six were
the same shape**: the design document was better written than the thing it described. A
chapter the bible describes as a three-way dilemma is implemented as a two-way one. An ending
the bible describes as earned across five chapters is decided by the last click.

Every one of those is invisible from inside the bible, because the bible is where the good
version lives. Structural checks do not see them either — a terminology check, a missing-string
check and a link check can all be green over a story that arrives as a sequence of events.

So the reader gets the rendered text, in order, and gets **nothing else**: no bible, no
specification, no summary, no source, no flag names, no author's note about what a scene is
doing. `leakCheck` in `lib/read/reading.mjs` makes that a checked claim rather than an
intention, and it runs on the rendered string because that is what the reader receives.

An option must arrive without its consequence. An option carrying a trust delta, a flag or a
`goto` has answered the question the reader is about to be asked, and the reading is refused.

# Ask while they are still reading

This is the decision worth defending, because the cheap version — hand it over, ask what they
thought — is what everybody reaches for and it cannot see the thing this exists to find.

An impression collected after the last page is one number over the whole work, and two
completely different works produce the same one:

- a work that set up an expectation in chapter two and paid it off in chapter four, and
- a work that never set anything up, so there was never anything to pay off.

Both read back as "it was fine". The difference only exists **at the moment the expectation
should be there and is not** — before the reader has been told the answer. Afterwards, the
answer has filled the hole and the reader cannot tell you it was ever empty.

So the reader is stopped and made to commit to something that can be wrong:

| When | Asked | An answer means | A blank means |
|---|---|---|---|
| end of each section | what happens next / who do you trust / what are you afraid of losing | the section built an expectation, an allegiance, a stake | it did not — and that is a **result**, not missing data |
| at each choice, labels visible, consequences hidden | which would you take, and what makes it hard | the choice is alive | an instant answer means it is decoration |
| after the last page, text withdrawn | what do you remember, unprompted, then by chapter title only | something landed | nothing did |

**A blank answer and an unasked question are not the same event.** `{answered: false}` is the
most valuable row this tool produces; a checkpoint absent from the transcript invalidates that
reader, because afterwards "had no expectation" and "was never asked" are indistinguishable and
only one of them is about the story. `validateTranscript` refuses the second and records the
first.

Recall is collected with the text gone. Recall with the text in front of you is recognition,
and recognition is not memory.

# Several readers, or it is an anecdote

One reader is a person. Several readers who were never allowed to talk to each other, all
stopping at the same passage for the same reason, are a property of the text.

- Run **at least three** independent readers. Each gets its own context, its own directory, and
  is told not to read the others, the source, or anything outside its step files.
- A confusion reported by fewer than a quorum is **recorded as individual variation, not
  filed**. It is real for that reader and is not evidence about the text.
- Where a quorum of readers land on the same anchor but their statements barely overlap, the
  finding is marked `anchor_only` and downgraded, rather than being claimed as agreement the
  tool cannot demonstrate.

Readers report confusion from a closed list — `contradiction`, `unfollowable`, `unplaceable`,
`unmotivated`, `dead_choice`, `unearned` — in their own words first, label second. The list is
short on purpose: a first reader is a detector, not a diagnostician.

# The findings carry no mechanism

Output goes on the existing findings structure and inherits its rule unchanged: `problem` is
the observed symptom with the count behind it, `hypothesis` is a proposed mechanism and is
kept apart from it. Across the measured rounds on these projects the critic's symptom calls
were right 6/6 and its mechanism guesses were wrong 4/4.

**This tool emits no hypothesis of its own.** A reader can observe that 380 households will not
fit inside 406 people. A reader cannot know whether that is a typo, a stale draft or a
deliberately unreliable narrator, and neither can the fold. Where a reader offered a mechanism
it is passed through labelled as reader-proposed and unverified.

The `verdict` field says whether **this run** produced findings that reached quorum. It is not
an acceptance criterion for the work and must never become one — the findings schema already
says a PASS "closes the review workstream only, never the product criteria", and that holds
doubly here. Do not invent a pass mark for a story out of these numbers.

# Reader-side, not source-side

Measured on a real run against a story with eight known, numbered defects. Seven of them had
their text in front of five readers. The split in the result is the most useful thing this
skill can tell you about its own scope:

- **Found** — every defect a reader trips over *as a reader*: a number that will not reconcile
  inside one paragraph, an option that punishes you for a conversation you never had, an
  epilogue calling back to a line you were never shown. Most reached quorum.
- **Not found** — defects that are arithmetic across two statements many pages apart, checked
  with the intent of auditing. A grade system that contradicts itself between chapters, a
  career whose years do not sum. A first reader is reading, not auditing, and asking them to
  cross-check every number against every other number is asking for a validator wearing a
  person.
- **Also found: eight defects nobody had on any ledger.** Four choices readers answered
  instantly, two callbacks to unshown lines, an unanchored pronoun, a leap between two names
  nobody could follow. That is the argument for running this at all.

So: do not retire the numeric and structural checks because this exists, and do not read a
clean first-reader run as a clean story. The two instruments find different things and neither
one covers for the other.

# The one thing a reader structurally cannot see

A three-way choice whose second and third options lead to the same downstream text is a two-way
choice wearing three labels. Every reader hesitates over it honestly and reports it as live, and
every reader is right about their own experience — **because a reader sees exactly one branch.**
The defect is a relation between branches, and no observation from inside one contains it.
Measured, not reasoned: five readers over a work with a known collapsed three-way choice, and
none of them could have found it. Forcing a second reading down the collapsing branch does not
help either; that reader also sees one branch.

So comparing the branches is a tool:

```bash
node .kit/tools/first-reader.mjs branches --variants=<dir> --at=<choice-id> --min-distinct-words=1
```

One reading per option, each produced by forcing that option and changing nothing else. It
reports two relations, and neither is a threshold it invented:

- **collapsed** — two options whose downstream text differs by fewer than a floor *you* declare.
- **dominated** — an option where some other option delivers every ending and epilogue paragraph
  it delivers, **and more**. This is the one that catches the real cases: picking it gets you a
  subset of what picking something else would have got you, so nothing about the ending is
  yours. An earlier version counted "text no other option delivers" instead, and gave a number
  that did not survive being checked by hand — an option that adds a paragraph of its own scored
  zero because a fourth option, switching to a different ending entirely, happened to carry the
  same paragraph. Domination states itself in one sentence and names the option that dominates,
  so the claim is checkable by reading two paragraphs rather than by trusting a count.

The seam, written down so the two are not confused later: **if it asks what one reader
experienced, it is the reading protocol; if it compares what two different picks produce, it is
this.** Neither substitutes for the other. A choice can be distinct here and dead to every
reader, and alive to every reader and dominated here.

# What it does not measure

Say this out loud in every report; `unmeasured()` returns it so it cannot be quietly dropped.

- **Whether the writing is any good.** A work can build expectation, sustain hesitation and be
  remembered while being entirely derivative. Nothing here detects that.
- **Whether the reader was moved.** Expectation, hesitation and recall are the preconditions
  for being moved. They are not evidence of it.
- **Whether a reader would have kept going.** These readers were told to finish.
- **Whether a change improved anything.** That needs the same protocol run again over the same
  reading, and compared. Which is the whole reason to run it *before* the fixes.
- **Whether a reader really did not read ahead.** One step file at a time with its questions at
  the foot makes reading ahead awkward and deliberate, not impossible.
- Anything about a passage no reader reached. Report the coverage; do not let a low number pass
  as a clean result.

# Running it

```bash
node .kit/tools/first-reader.mjs check  --reading=reading.json
node .kit/tools/first-reader.mjs plan   --reading=reading.json --out=first-read/ --readers=3
node .kit/tools/first-reader.mjs fold   --reading=reading.json --reports=first-read/reports \
                                        --blind=@first-read/blind.txt --out=first-read/review.json
node .kit/tools/first-reader.mjs prose  --reading=reading.json --voice-floor=0.05
node .kit/tools/first-reader.mjs selftest
```

`plan` writes the reader packets: one step file per step, each ending with that step's
questions, plus a blank transcript with one entry per checkpoint so none can be skipped.

**The extraction is yours to write.** The kit owns the reading format, the protocol and the
fold; the repository owns turning its story into a reading, because only the repository knows
what its player sees and in what order. Expect to record three things about your extractor and
to treat all three as limits on what the run can claim: the **order** you chose, the **path**
you walked through branching material, and what your walker could not evaluate. A branching
work cannot be read whole without showing a reader the outcome of a choice they are about to
weigh, so walk one path and report the coverage.

Material the walked path never reaches — the other endings, an appendix — goes in a section
marked `postscript: true`. The protocol then stops asking what happens next there, because
nothing does, and an appendix scoring "no expectation" would be a finding the tool
manufactured rather than found.

```js
import { validateReading, leakCheck } from './.kit/lib/read/reading.mjs';
import { buildProtocol, validateTranscript, unmeasured } from './.kit/lib/read/protocol.mjs';
import { foldReports } from './.kit/lib/read/agreement.mjs';
import { proseReport } from './.kit/lib/read/prose.mjs';
import { compareBranches, branchFindings } from './.kit/lib/read/branches.mjs';
```

# Prove the negative before you report the positive

"Nothing was found" is not a result until the instrument has been seen finding something. This
project has an accident on record where a scan passed with all thirty-one of its rows empty.

`selftest` runs 58 cases across the five modules, each gate against a broken input and a good
one. That covers the code. It does **not** cover the readers, so before trusting a run, take an
excerpt, inject one defect of each kind you care about, and run the same readers over the
broken copy and the clean one. The claim to hold is differential — *the injected defects are
reported against the broken copy and not against the clean one* — because the clean copy is the
real work, and confusion it produces is a result rather than a false positive.

# Language and voice, decomposed

The second half of `prose.mjs` exists because "tone and texture cannot be checked by tooling"
was doing more work than it should. What had actually been tried was terminology consistency,
missing strings and layout breakage, none of which is about texture at all. Decomposed, several
parts are ordinary distribution facts:

| Measured | Question |
|---|---|
| `voiceDivergence` | are any two speakers statistically indistinguishable — one narrator wearing name tags? |
| `translationese` | a closed list of constructions, counted, with the line each sits on (English and Japanese lists) |
| `repetition` | phrases the work repeats to itself, with every location |
| `sentenceLengths` | the spread — monotony is the *absence* of spread, so read the cv, not the mean |
| `overExplanation` | narration naming the feeling the dialogue just performed, and how often it does so directly after a line |

**None of these returns a verdict on its own.** Where a threshold exists the caller supplies it
and it is echoed back as `declaredFloor`, the same way `compare-round` refuses to invent its own
tolerance. A number with a floor somebody chose is a measurement plus an opinion and the two
must stay separable.

What survives decomposition unmeasured is the part the record was right about: whether a
distinctive voice is the *right* voice, whether a repeated phrase is a motif or a tic, and
whether the author approves of it. That last one is not a measurement. It is a person reading
it and saying yes.

# Why this skill exists without a prior implementation

Every other module in this kit is a consolidation of two to six existing implementations, each
carrying the measurement that justified its shape. This one is the exception: no repository had
any of it, and the kit's own rule says an exception owes an argument in place of the evidence
it does not have. The argument is the table above — the six findings that were all the same
shape, and the fact that nothing on any of these projects reads the shipped text as a reader.

The part most worth keeping if the rest is rewritten: **ask during, not after.** Everything
else here is instrumentation around that one claim.

---

If `AI_DEVELOPMENT/SKILLS/OVERLAYS/first-reader.md` exists in this repository, read it as part of this
skill. It holds rules this project verified for itself that have not earned a place in the
shared kit — staying project-local is a normal outcome, not a lesser one. Add to the overlay
rather than editing this file: this file is vendored, so an edit in place is reported as drift
by `bootstrap.mjs --check`, and it destroys the baseline the next comparison needs.
