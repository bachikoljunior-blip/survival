/**
 * protocol.mjs — make the reader speak while they are still reading.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE QUESTIONS ARE ASKED MID-READ, AND NOT AT THE END
 *
 * This is the one design decision in this module that is worth writing down, because the
 * cheaper version — hand someone the text, ask what they thought — is what everybody
 * reaches for first, and it cannot see the defect this tool exists to find.
 *
 * An impression collected after the last page is a single number over the whole work, and
 * two completely different works produce the same one:
 *
 *   - a work that set up an expectation in chapter two and paid it off in chapter four, and
 *   - a work that never set up anything, so there was never anything to pay off.
 *
 * Both read back as "it was fine". The first is a functioning story; the second is a
 * sequence of events. The difference is only visible *at the moment the expectation should
 * exist and does not* — which is to say, before the reader has been told the answer.
 *
 * So the reader is stopped and made to commit, out loud, to something that can be wrong:
 *
 *   - at the end of each section — **what happens next, who do you trust, what are you
 *     afraid of losing.** An answer means an expectation was built. A blank means it was
 *     not, and a blank is a *result*, not a missing datum.
 *   - immediately before each choice, with the options visible and the consequences not —
 *     **which would you take, and what makes it hard.** A stated difficulty means the
 *     choice is alive. An instant answer means it is decoration.
 *   - after the last page, with the text taken away — **what do you remember.** Recall with
 *     the text in front of you is recognition, and recognition is not memory.
 *
 * None of these measure whether the reader was moved. They measure the three things that
 * have to be true before being moved is even possible: an expectation, a hesitation, and a
 * trace left behind. What the reader felt, and whether the prose is any good, this module
 * does not measure and must never claim to. See `unmeasured()`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CHECKPOINT_KINDS = new Set([
  'expectation',  // section end: what happens next
  'allegiance',   // section end: who do you trust
  'stakes',       // section end: what are you afraid of losing
  'hesitation',   // immediately before a choice
  'recall_free',  // after the read, no text, no cues
  'recall_cued',  // after the read, no text, chapter titles as the only cue
]);

/** Kinds a reader answers while the section is still unfinished business. */
const MID_READ = new Set(['expectation', 'allegiance', 'stakes', 'hesitation']);

const PROMPTS = {
  expectation: 'Without looking ahead: what do you think happens next? If you have no idea, say so — that is an answer.',
  allegiance: 'Who in this do you trust right now, and who do you not? If nobody has registered as either, say so.',
  stakes: 'What are you afraid of losing? If nothing is at risk yet, say so.',
  hesitation: 'You are about to choose. Which would you take, and what makes it hard? If it was instant, say it was instant and say why the others were not live.',
  recall_free: 'The text is gone. With no prompting at all, what do you remember? List it.',
  recall_cued: 'Still no text. Given only the chapter titles, what do you remember from each?',
};

/**
 * Build the checkpoint schedule for a reading.
 *
 * @param {object} reading a reading validated by `validateReading`
 * @returns {{checkpoints: Array, readerBrief: string}}
 */
export function buildProtocol(reading) {
  const checkpoints = [];
  let index = 0;

  for (const section of reading.sections || []) {
    for (const passage of section.passages || []) {
      index += 1;
      if (passage.kind === 'choice') {
        // The option labels are part of the question: you cannot say which you would take
        // without seeing them. What must still be hidden is everything after the choice, so
        // this checkpoint sits *with* the choice passage and before the next one.
        checkpoints.push({
          id: `${passage.id}:hesitation`,
          kind: 'hesitation',
          section: section.id,
          anchor: passage.id,
          position: 'at',
          afterPassages: index,
          prompt: PROMPTS.hesitation,
        });
      }
    }
    // A postscript is read after the work has ended. "What happens next" has no referent
    // there, and asking it would put a guaranteed blank into the measurement.
    for (const kind of (section.postscript ? [] : ['expectation', 'allegiance', 'stakes'])) {
      checkpoints.push({
        id: `${section.id}:${kind}`,
        kind,
        section: section.id,
        anchor: section.id,
        position: 'after',
        afterPassages: index,
        prompt: PROMPTS[kind],
      });
    }
  }

  checkpoints.push({
    id: 'recall_free', kind: 'recall_free', section: null, anchor: null,
    position: 'after', afterPassages: index, prompt: PROMPTS.recall_free,
  });
  checkpoints.push({
    id: 'recall_cued', kind: 'recall_cued', section: null, anchor: null,
    position: 'after', afterPassages: index, prompt: PROMPTS.recall_cued,
  });

  return { checkpoints, readerBrief: readerBrief(reading, checkpoints) };
}

/** The instructions a first reader is given. Deliberately says nothing about what to find. */
export function readerBrief(reading, checkpoints) {
  const sections = (reading.sections || []).length;
  const choices = checkpoints.filter((c) => c.kind === 'hesitation').length;
  return [
    `You are reading ${reading.work} for the first time. You have not seen any design document,`,
    'specification, summary or source for it, and you must not go looking for one. If you already',
    'know something about this work, say so now rather than reading on.',
    '',
    `There are ${sections} sections and ${choices} points where the text stops and offers you a choice.`,
    '',
    'Read straight through, in order, and do not read ahead. You will be stopped at the end of each',
    'section and just before each choice, and asked to commit to an answer before you are allowed to',
    'continue. Answer from where you are, not from what you later find out.',
    '',
    '"I have no idea" and "nothing yet" are real answers and are as useful as any other. Do not',
    'manufacture an expectation you do not have — a blank is exactly the thing being measured.',
    '',
    'This is a recording of ONE path through a branching work. At a choice you are asked which',
    'you would take — and then the text carries on down the path that was actually recorded,',
    'which is often not yours. That is a property of the recording, not of the story, so do not',
    'report it as the outcome ignoring your pick. What you are being asked at a choice is only',
    'whether the decision was hard, before you knew what any of it led to.',
    '',
    'Report anything that confused you at the point it confused you: a name you could not place, a',
    'number that did not add up, a scene you could not follow, a decision you did not understand.',
    'Confusion you resolved two pages later still counts, and say that you resolved it.',
    '',
    'When you report one, quote a short exact phrase from the text at the point it happened. The',
    'quote is how two readers who noticed the same thing are recognised as having noticed the',
    'same thing.',
    '',
    'Do not review the writing. You are not being asked whether it is good.',
  ].join('\n');
}

/**
 * Check one reader's transcript against the schedule.
 *
 * The distinction this function exists to keep: an **unanswered** checkpoint and a **missing**
 * one are not the same event. `{answered: false}` is a measurement — the reader had no
 * expectation — and it is the single most valuable row this tool produces. An absent entry is
 * a protocol violation and invalidates the reader, because "no expectation" and "never asked"
 * are indistinguishable afterwards and only one of them is about the story.
 *
 * @param {{checkpoints: Array}} protocol
 * @param {object} report
 * @returns {{ok: boolean, failures: string[], warnings: string[]}}
 */
export function validateTranscript(protocol, report) {
  const failures = [];
  const warnings = [];

  if (!report || typeof report !== 'object') return { ok: false, failures: ['report is not an object'], warnings };
  if (typeof report.reader !== 'string' || !report.reader.trim()) failures.push('report has no reader id');
  if (report.priorKnowledge === undefined) {
    failures.push('report must declare priorKnowledge (false, or what the reader already knew)');
  }
  if (!Array.isArray(report.checkpoints)) {
    failures.push('report.checkpoints must be an array');
    return { ok: false, failures, warnings };
  }

  const byId = new Map();
  for (const entry of report.checkpoints) {
    if (!entry || typeof entry !== 'object' || !entry.id) { failures.push('a checkpoint entry has no id'); continue; }
    if (byId.has(entry.id)) failures.push(`checkpoint ${entry.id} answered twice`);
    byId.set(entry.id, entry);
  }

  for (const cp of protocol.checkpoints) {
    const entry = byId.get(cp.id);
    if (!entry) { failures.push(`checkpoint ${cp.id} (${cp.kind}) was never put to the reader`); continue; }
    byId.delete(cp.id);

    if (typeof entry.answered !== 'boolean') {
      failures.push(`${cp.id}: answered must be true or false; a blank is a result and has to be stated as one`);
      continue;
    }
    // A recall checkpoint answers in `items` so the answer can be counted; every other kind
    // answers in prose. Both are "said something", and an empty one is not an answer.
    if (entry.answered && !cp.kind.startsWith('recall')
        && (typeof entry.text !== 'string' || entry.text.trim().length < 2)) {
      failures.push(`${cp.id}: answered true with no text`);
    }
    if (!entry.answered && entry.text && entry.text.trim().length > 0) {
      warnings.push(`${cp.id}: answered false but carries text; the text is kept and the blank stands`);
    }

    if (cp.kind === 'hesitation' && entry.answered && typeof entry.hesitated !== 'boolean') {
      failures.push(`${cp.id}: a hesitation checkpoint must record hesitated true or false`);
    }
    if (cp.kind === 'hesitation' && entry.answered && entry.chose === undefined) {
      failures.push(`${cp.id}: the reader must name which option they would take`);
    }

    if (MID_READ.has(cp.kind)) {
      if (entry.afterPassages === undefined) {
        failures.push(`${cp.id}: the reader must record how much they had read when they answered`);
      } else if (Number(entry.afterPassages) !== cp.afterPassages) {
        failures.push(`${cp.id}: answered after ${entry.afterPassages} passages, but the checkpoint sits at ${cp.afterPassages} — the reader read ahead, so the answer is hindsight`);
      }
    }

    if (cp.kind.startsWith('recall')) {
      if (entry.sawTextAgain !== false) {
        failures.push(`${cp.id}: recall must be collected with the text withdrawn (sawTextAgain must be false)`);
      }
      if (entry.answered && !Array.isArray(entry.items)) {
        failures.push(`${cp.id}: recall must be a list of items, so it can be counted`);
      }
    }
    if (cp.kind === 'recall_cued' && entry.answered) {
      if (entry.bySection !== undefined && (typeof entry.bySection !== 'object' || entry.bySection === null || Array.isArray(entry.bySection))) {
        failures.push(`${cp.id}: bySection must map section id to what was remembered from it`);
      } else {
        for (const [sectionId, items] of Object.entries(entry.bySection || {})) {
          // Prose or a list, both countable. Anything else is a shape the fold would drop
          // silently, and a dropped answer reads back as "nobody remembered anything".
          const ok = Array.isArray(items) || (typeof items === 'string' && items.trim().length > 0);
          if (!ok) failures.push(`${cp.id}: bySection.${sectionId} is neither a list nor a sentence, so it cannot be counted`);
        }
      }
    }
  }

  for (const extra of byId.keys()) failures.push(`${extra} is not a checkpoint in this protocol`);

  if (!Array.isArray(report.confusions)) {
    failures.push('report.confusions must be an array (an empty one is a real result)');
  } else {
    report.confusions.forEach((c, i) => {
      if (!c || typeof c !== 'object') { failures.push(`confusions[${i}] is not an object`); return; }
      if (!c.at) failures.push(`confusions[${i}] has no anchor (the passage id where it happened)`);
      if (!CONFUSION_KINDS.has(c.kind)) failures.push(`confusions[${i}].kind must be one of ${[...CONFUSION_KINDS].join('|')}, got ${JSON.stringify(c.kind)}`);
      if (typeof c.statement !== 'string' || c.statement.trim().length < 15) {
        failures.push(`confusions[${i}].statement is missing or too short to be compared against another reader's`);
      }
      if (c.hypothesis !== undefined && typeof c.hypothesis !== 'string') {
        failures.push(`confusions[${i}].hypothesis must be a string when present`);
      }
      if (c.quote !== undefined && typeof c.quote !== 'string') {
        failures.push(`confusions[${i}].quote must be a string when present`);
      }
    });
  }

  return { ok: failures.length === 0, failures, warnings };
}

/**
 * The kinds of confusion a reader can report. Deliberately short: a first reader is a
 * detector, not a diagnostician, and a long list invites them to categorise instead of
 * report.
 */
export const CONFUSION_KINDS = new Set([
  'contradiction',   // two statements in the text cannot both be true
  'unfollowable',    // could not work out what happened
  'unplaceable',     // a person, place or thing arrived with nothing to attach it to
  'unmotivated',     // somebody did something for no reason the text supplies
  'dead_choice',     // the options were not distinguishable, or the outcome ignored the pick
  'unearned',        // an outcome arrived that the text had not paid for
]);

/**
 * A compliant transcript for a reading, used as the must-pass control in the self-tests and
 * as the shape a reader agent is asked to produce.
 *
 * Deliberately answers everything: the broken variants below each break exactly one thing, so
 * a failure names the rule that caught it rather than the first rule in the list.
 */
export function sampleReport(reading, protocol, { reader = 'reader-1', confusions = [] } = {}) {
  const sectionIds = (reading.sections || []).map((s) => s.id);
  return {
    reader,
    priorKnowledge: false,
    checkpoints: protocol.checkpoints.map((cp) => {
      if (cp.kind === 'hesitation') {
        return { id: cp.id, kind: cp.kind, answered: true, hesitated: true, chose: 1, afterPassages: cp.afterPassages, text: 'Both options cost her something and I could not tell which cost more.' };
      }
      if (cp.kind === 'recall_free') {
        return { id: cp.id, kind: cp.kind, answered: true, sawTextAgain: false, items: ['the gate nobody was watching', 'the wind turning by morning'] };
      }
      if (cp.kind === 'recall_cued') {
        return {
          id: cp.id, kind: cp.kind, answered: true, sawTextAgain: false,
          items: ['the gate', 'the wind'],
          bySection: Object.fromEntries(sectionIds.map((id) => [id, ['something from this section']])),
        };
      }
      return { id: cp.id, kind: cp.kind, answered: true, afterPassages: cp.afterPassages, text: 'She goes in and somebody stops her at the far side.' };
    }),
    confusions,
  };
}

/** Self-test cases for `validateTranscript`, in the shape `runGateSelfTests` consumes. */
export function protocolSelfTestCases(reading) {
  const protocol = buildProtocol(reading);
  const fired = (r) => r.failures;
  const mutate = (fn) => { const r = sampleReport(reading, protocol); fn(r, protocol); return r; };
  const check = (report) => fired(validateTranscript(protocol, report));

  return [
    {
      name: 'a checkpoint that was never put to the reader is refused, not read as a blank',
      evaluate: () => check(mutate((r) => { r.checkpoints.shift(); })),
    },
    {
      name: 'an answer given after reading further on is refused as hindsight',
      evaluate: () => check(mutate((r, p) => {
        const cp = p.checkpoints.find((c) => c.kind === 'expectation');
        r.checkpoints.find((c) => c.id === cp.id).afterPassages = cp.afterPassages + 3;
      })),
    },
    {
      name: 'recall collected with the text still visible is refused',
      evaluate: () => check(mutate((r) => { r.checkpoints.find((c) => c.id === 'recall_free').sawTextAgain = true; })),
    },
    {
      name: 'a hesitation checkpoint with no hesitated flag is refused',
      evaluate: () => check(mutate((r) => {
        const e = r.checkpoints.find((c) => c.kind === 'hesitation');
        delete e.hesitated;
      })),
    },
    {
      name: 'answered true with nothing said is refused',
      evaluate: () => check(mutate((r) => { r.checkpoints[0].text = ''; })),
    },
    {
      name: 'a reader who never declared prior knowledge is refused',
      evaluate: () => check(mutate((r) => { delete r.priorKnowledge; })),
    },
    {
      name: 'cued recall in a shape the fold cannot count is refused rather than silently dropped',
      evaluate: () => check(mutate((r) => {
        const e = r.checkpoints.find((c) => c.id === 'recall_cued');
        e.bySection = { one: 42, two: null };
      })),
    },
    {
      name: 'a confusion with no anchor cannot be compared against another reader and is refused',
      evaluate: () => check(mutate((r) => { r.confusions = [{ kind: 'contradiction', statement: 'the numbers in this scene do not add up at all' }]; })),
    },
    {
      name: 'a confusion kind outside the closed list is refused',
      evaluate: () => check(mutate((r) => { r.confusions = [{ at: 'p1', kind: 'boring', statement: 'this scene went on much too long for me' }]; })),
    },
    {
      name: 'CONTROL: a blank answer is a result, not a violation',
      shouldFire: false,
      evaluate: () => check(mutate((r) => {
        const e = r.checkpoints.find((c) => c.kind === 'expectation');
        e.answered = false; delete e.text;
      })),
    },
    {
      name: 'CONTROL: a compliant transcript passes',
      shouldFire: false,
      evaluate: () => check(sampleReport(reading, protocol)),
    },
  ];
}

/**
 * What a run of this protocol cannot say, stated so it cannot be quietly dropped from a
 * report. Every one of these has been claimed by a reading study that could not support it.
 */
export function unmeasured() {
  return [
    'whether the writing is any good. Nothing here reads for quality, and a work can build',
    'expectation, sustain hesitation and be remembered while being entirely derivative.',
    'whether the reader was moved. Expectation, hesitation and recall are preconditions for',
    'being moved, not evidence of it.',
    'whether a reader would have kept reading voluntarily. These readers were instructed to',
    'finish, so the completion rate carries no information.',
    'whether a change improved anything. That needs this same protocol run again after the',
    'change, against the same reading, and compared.',
    'anything about a section no reader reached, and anything about a choice the reading did',
    'not contain.',
    'that the readers were blank slates. When the run is driven by agents, the harness\'s own',
    'project context can already name the work and its premise. Every disclosure a reader makes',
    'is recorded and has to be acknowledged in advance; what it cost is not measurable from here.',
    'whether a reader really did not read ahead. Handing out one step file at a time with its',
    'questions at the foot of it makes reading ahead awkward and deliberate; it does not make',
    'it impossible, and `afterPassages` is the reader\'s own account of themselves.',
  ];
}
