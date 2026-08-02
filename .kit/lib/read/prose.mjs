/**
 * prose.mjs — decompose "the voice is off" into things that have numbers.
 *
 * The record on these projects says tone and texture cannot be checked by tooling, and read
 * literally that is true: no automatic check knows whether a line is good. But the sentence
 * was doing more work than it should. What automatic checks had actually been tried was
 * terminology consistency, missing strings and layout breakage — and none of those is about
 * texture at all. The real gap is that nobody had **decomposed** the complaint.
 *
 * Decomposed, several parts of it are ordinary distribution facts:
 *
 *   - **Does everyone speak the same?** A cast whose speakers are statistically
 *     indistinguishable is one narrator wearing name tags. `voiceDivergence` measures the
 *     distance between each pair of speakers and reports the closest pair.
 *   - **Translationese.** A closed list of constructions, counted, with a rate per thousand
 *     words and the line each one sits on.
 *   - **Self-repetition.** Repeated phrases across the whole work, with every location.
 *   - **Monotony.** The spread of sentence lengths.
 *   - **Narration explaining the feeling the dialogue just performed.** A frame that can be
 *     matched: an emotion word in a state construction, and whether it sits directly after a
 *     line of dialogue.
 *
 * What stays unmeasured is the part the record was right about, and it is stated as an export
 * rather than a caveat: see `unmeasured()`. In particular **none of these functions returns a
 * verdict on their own.** Where a threshold exists it is supplied by the caller and recorded
 * as declared, in the same way `compare-round` refuses to invent its own tolerance. A number
 * with a floor somebody chose is a measurement plus an opinion, and the two must stay
 * separable.
 */

/** Split into sentences. Japanese on its own terminators; otherwise on Latin ones. */
export function sentences(text, language = 'en') {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  if (language === 'ja') return s.split(/(?<=[。！？])/).map((x) => x.trim()).filter(Boolean);
  return s.split(/(?<=[.!?])\s+(?=[A-Z"'—(])|(?<=[.!?])$/).map((x) => x.trim()).filter(Boolean);
}

/** Word count, counting Japanese by character since it has no spaces. */
export function countWords(text, language = 'en') {
  const s = String(text || '');
  return language === 'ja'
    ? s.replace(/\s/g, '').length
    : s.split(/\s+/).filter(Boolean).length;
}

/** Every reader-visible passage, flattened, with its section. */
export function allPassages(reading) {
  const out = [];
  for (const section of reading.sections || []) {
    for (const p of section.passages || []) out.push({ ...p, section: section.id });
  }
  return out;
}

const textOf = (p) => (p.kind === 'choice' ? (p.options || []).map((o) => o.label).join(' ') : String(p.text || ''));

/* ------------------------------------------------------------------ sentence length */

/**
 * The spread of sentence lengths. Monotony is the *absence* of spread, so the number that
 * matters is the coefficient of variation, not the mean.
 */
export function sentenceLengths(reading) {
  const lang = reading.language;
  const lengths = [];
  for (const p of allPassages(reading)) {
    for (const s of sentences(textOf(p), lang)) lengths.push(countWords(s, lang));
  }
  if (!lengths.length) return { n: 0, mean: 0, sd: 0, cv: 0, min: 0, max: 0, histogram: {} };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
  const histogram = {};
  const bucket = (n) => (n <= 5 ? '1-5' : n <= 10 ? '6-10' : n <= 20 ? '11-20' : n <= 35 ? '21-35' : '36+');
  for (const l of lengths) histogram[bucket(l)] = (histogram[bucket(l)] || 0) + 1;
  return {
    n: lengths.length,
    mean: Number(mean.toFixed(2)),
    sd: Number(sd.toFixed(2)),
    cv: Number((sd / mean).toFixed(4)),
    min: Math.min(...lengths),
    max: Math.max(...lengths),
    histogram,
  };
}

/* ------------------------------------------------------------------ speaker voice */

const EN_FUNCTION = 'the a an and but or so then not no is are was were be been it that this what which who i you he she they we me my your his her their of to in on at for with from as if when where how do does did have has had will would can could should just only very really thing things something anything nothing'.split(' ');

/** A speaker's fingerprint: function words, sentence-final marks, length buckets, and — for
 *  Japanese, where it carries most of the signal — sentence endings. */
export function voiceProfile(lines, language = 'en') {
  const bag = new Map();
  const add = (k) => bag.set(k, (bag.get(k) || 0) + 1);
  let sentenceCount = 0;
  let wordCount = 0;
  const vocab = new Set();

  const fn = new Set(EN_FUNCTION);
  for (const line of lines) {
    for (const s of sentences(line, language)) {
      sentenceCount += 1;
      const words = countWords(s, language);
      wordCount += words;
      add(`len:${words <= 5 ? 'short' : words <= 12 ? 'mid' : words <= 25 ? 'long' : 'very-long'}`);
      add(`mark:${/[?]$/.test(s) ? 'q' : /[!]$/.test(s) ? 'x' : /[…—]$/.test(s) ? 'trail' : '.'}`);
      if (language === 'ja') {
        add(`end:${s.replace(/[。！？]$/, '').slice(-2)}`);
        for (let i = 0; i + 2 <= s.length; i += 1) vocab.add(s.slice(i, i + 2));
      } else {
        for (const w of s.toLowerCase().split(/[^a-z']+/).filter(Boolean)) {
          vocab.add(w);
          if (fn.has(w)) add(`w:${w}`);
        }
        if (/'(s|t|re|ve|ll|d|m)\b/.test(s)) add('contraction');
      }
    }
  }
  return {
    lines: lines.length,
    sentences: sentenceCount,
    words: wordCount,
    meanSentenceWords: sentenceCount ? Number((wordCount / sentenceCount).toFixed(2)) : 0,
    typeTokenRatio: wordCount ? Number((vocab.size / wordCount).toFixed(4)) : 0,
    bag,
  };
}

const jsDivergence = (p, q) => {
  const keys = new Set([...p.keys(), ...q.keys()]);
  const pt = [...p.values()].reduce((a, b) => a + b, 0) || 1;
  const qt = [...q.values()].reduce((a, b) => a + b, 0) || 1;
  let d = 0;
  for (const k of keys) {
    const a = (p.get(k) || 0) / pt;
    const b = (q.get(k) || 0) / qt;
    const m = (a + b) / 2;
    if (a > 0) d += 0.5 * a * Math.log2(a / m);
    if (b > 0) d += 0.5 * b * Math.log2(b / m);
  }
  return d;
};

/**
 * How far apart do the speakers sound?
 *
 * @param {object} reading
 * @param {object} [options]
 * @param {number} [options.minLines]  speakers with fewer lines are reported as unmeasurable
 *   rather than compared; a two-line character has no distribution.
 * @param {number|null} [options.floor] a *declared* minimum divergence. Supplying one turns
 *   this into a gate and the value is echoed back as `declaredFloor`. Omit it and no verdict
 *   is produced, only numbers.
 */
export function voiceDivergence(reading, { minLines = 8, floor = null } = {}) {
  const lang = reading.language;
  const bySpeaker = new Map();
  for (const p of allPassages(reading)) {
    if (p.kind !== 'dialogue' || !p.speaker) continue;
    if (!bySpeaker.has(p.speaker)) bySpeaker.set(p.speaker, []);
    bySpeaker.get(p.speaker).push(String(p.text || ''));
  }

  const profiles = new Map();
  const tooFew = [];
  for (const [speaker, lines] of bySpeaker) {
    if (lines.length < minLines) { tooFew.push({ speaker, lines: lines.length }); continue; }
    profiles.set(speaker, voiceProfile(lines, lang));
  }

  const names = [...profiles.keys()].sort();
  const pairs = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      pairs.push({
        a: names[i], b: names[j],
        divergence: Number(jsDivergence(profiles.get(names[i]).bag, profiles.get(names[j]).bag).toFixed(4)),
      });
    }
  }
  pairs.sort((x, y) => x.divergence - y.divergence);

  const speakers = Object.fromEntries([...profiles].map(([k, v]) => [k, {
    lines: v.lines, sentences: v.sentences, words: v.words,
    meanSentenceWords: v.meanSentenceWords, typeTokenRatio: v.typeTokenRatio,
  }]));

  return {
    speakers,
    unmeasurable: tooFew,
    pairs,
    closest: pairs[0] || null,
    declaredFloor: floor,
    belowFloor: floor === null ? null : pairs.filter((p) => p.divergence < floor),
  };
}

/* ------------------------------------------------------------------ translationese */

export const TRANSLATIONESE = {
  en: [
    { id: 'was-able-to', re: /\b(?:was|were|is|are|had been)\s+able\s+to\b/gi },
    { id: 'one-of-the', re: /\bone\s+of\s+the\b/gi },
    { id: 'in-order-to', re: /\bin\s+order\s+to\b/gi },
    { id: 'the-fact-that', re: /\bthe\s+fact\s+that\b/gi },
    { id: 'it-is-that-cleft', re: /\bit\s+(?:is|was)\s+\w+\s+that\b/gi },
    { id: 'there-is-which', re: /\bthere\s+(?:is|are|was|were)\s+[^.?!]{0,40}\bwhich\b/gi },
    { id: 'perform-a-noun', re: /\b(?:perform|carry\s+out|conduct|make)\s+(?:a|an|the)\s+\w+(?:tion|ment|ance|ence|sion)\b/gi },
    { id: 'due-to-the-fact', re: /\bdue\s+to\s+the\s+fact\b/gi },
    { id: 'with-respect-to', re: /\bwith\s+(?:respect|regard)\s+to\b/gi },
  ],
  ja: [
    { id: 'suru-koto-ga-dekiru', re: /することができ/g },
    { id: 'no-uchi-no-hitotsu', re: /のうちの(?:一つ|ひとつ|1つ)/g },
    { id: 'ni-taishite', re: /に対して/g },
    { id: 'to-iu-koto', re: /ということ/g },
    { id: 'wo-okonau', re: /を行(?:う|い|っ)/g },
    { id: 'teki-na', re: /的な/g },
    { id: 'sareteiru', re: /されている/g },
    { id: 'nozomashii-koto', re: /が可能(?:で|です|である)/g },
  ],
};

/**
 * Count translationese constructions, with the line each one sits on.
 * A rate, never a verdict: some of these are ordinary English and a story may want them.
 */
export function translationese(reading) {
  const lang = reading.language;
  const patterns = TRANSLATIONESE[lang] || [];
  const hits = [];
  let words = 0;
  for (const p of allPassages(reading)) {
    const text = textOf(p);
    words += countWords(text, lang);
    for (const { id, re } of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        hits.push({ id, at: p.id, section: p.section, match: m[0], context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ').trim() });
        if (m[0].length === 0) re.lastIndex += 1;
      }
    }
  }
  const byPattern = {};
  for (const h of hits) byPattern[h.id] = (byPattern[h.id] || 0) + 1;
  return {
    words,
    total: hits.length,
    per1000Words: words ? Number(((hits.length / words) * 1000).toFixed(2)) : 0,
    byPattern,
    hits,
  };
}

/* ------------------------------------------------------------------ repetition */

/**
 * Phrases the work repeats to itself.
 *
 * @param {object} reading
 * @param {object} [options]
 * @param {number} [options.n] shingle size: words for Latin scripts, characters for Japanese.
 * @param {number} [options.minOccurrences]
 */
export function repetition(reading, { n = 6, minOccurrences = 2 } = {}) {
  const lang = reading.language;
  const shingles = new Map();
  let total = 0;

  for (const p of allPassages(reading)) {
    const text = textOf(p);
    const units = lang === 'ja'
      ? [...text.replace(/\s/g, '')]
      : text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
    for (let i = 0; i + n <= units.length; i += 1) {
      const key = units.slice(i, i + n).join(lang === 'ja' ? '' : ' ');
      total += 1;
      if (!shingles.has(key)) shingles.set(key, []);
      shingles.get(key).push({ at: p.id, section: p.section });
    }
  }

  const repeats = [...shingles.entries()]
    .filter(([, locs]) => locs.length >= minOccurrences)
    .map(([phrase, locs]) => ({ phrase, count: locs.length, at: locs.map((l) => l.at) }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));

  const repeatedTokens = repeats.reduce((s, r) => s + r.count, 0);
  return {
    shingleSize: n,
    totalShingles: total,
    distinctRepeated: repeats.length,
    repeatRate: total ? Number((repeatedTokens / total).toFixed(4)) : 0,
    repeats,
  };
}

/* ------------------------------------------------------------------ over-explanation */

const EMOTION = 'afraid|angry|sad|happy|frightened|scared|relieved|ashamed|guilty|nervous|furious|terrified|desperate|proud|embarrassed|anxious|miserable|delighted|devastated|hurt|lonely|grateful|bitter';
const OVER_EXPLAIN = {
  en: [
    { id: 'state-frame', re: new RegExp(`\\b(?:felt|feeling|was|were|seemed|looked|sounded)\\s+(?:very\\s+|quite\\s+|so\\s+)?(?:${EMOTION})\\b`, 'gi') },
    { id: 'because-emotion', re: new RegExp(`\\bbecause\\s+(?:he|she|they|it|\\w+)\\s+(?:was|were|felt)\\s+(?:${EMOTION})\\b`, 'gi') },
    { id: 'named-realisation', re: /\b(?:realis|realiz)(?:ed|ing)\s+(?:that\s+)?(?:he|she|they|it)\b/gi },
  ],
  ja: [
    { id: 'to-omotta', re: /と(?:思った|感じた)/g },
    { id: 'kanjou-katta', re: /(?:悲しかった|嬉しかった|怖かった|悔しかった|寂しかった)/g },
    { id: 'no-datta', re: /のだった。/g },
  ],
};

/**
 * Narration that names the feeling instead of leaving it in what happens — and, separately,
 * how often it does so in the passage immediately after a line of dialogue, which is the
 * shape that reads as the narrator explaining the actor's performance.
 */
export function overExplanation(reading) {
  const lang = reading.language;
  const patterns = OVER_EXPLAIN[lang] || [];
  const passages = allPassages(reading);
  const hits = [];
  let narrationWords = 0;

  passages.forEach((p, i) => {
    if (p.kind !== 'narration' && p.kind !== 'journal') return;
    const text = textOf(p);
    narrationWords += countWords(text, lang);
    const afterDialogue = i > 0 && passages[i - 1].kind === 'dialogue';
    for (const { id, re } of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        hits.push({ id, at: p.id, section: p.section, afterDialogue, match: m[0], context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ').trim() });
        if (m[0].length === 0) re.lastIndex += 1;
      }
    }
  });

  return {
    narrationWords,
    total: hits.length,
    afterDialogue: hits.filter((h) => h.afterDialogue).length,
    per1000NarrationWords: narrationWords ? Number(((hits.length / narrationWords) * 1000).toFixed(2)) : 0,
    hits,
  };
}

/* ------------------------------------------------------------------ report + self-test */

/** Everything above, in one object. Numbers only; a floor is applied only where declared. */
export function proseReport(reading, { voiceFloor = null, shingle = 6 } = {}) {
  return {
    work: reading.work,
    language: reading.language,
    sentenceLengths: sentenceLengths(reading),
    voice: voiceDivergence(reading, { floor: voiceFloor }),
    translationese: translationese(reading),
    repetition: repetition(reading, { n: shingle }),
    overExplanation: overExplanation(reading),
    unmeasured: unmeasured(),
  };
}

/** The part of "the voice is off" that survives decomposition unmeasured. */
export function unmeasured() {
  return [
    'whether any individual line is good. Every number here is a distribution over the work.',
    'whether a distinctive voice is the *right* voice for that character. Divergence says two',
    'speakers differ, never that either is correct.',
    'whether a repeated phrase is a motif or a tic. The tool reports the repetition and its',
    'locations; which one it is, is the author\'s call.',
    'whether the prose is derivative or merely competent. No arrangement of these numbers',
    'detects that, and a work can score well on all of them and still be flat.',
    'the author\'s approval. That is the thing the record was actually missing, and it is not',
    'a measurement — it is a person reading it and saying yes.',
  ];
}

/**
 * Self-test cases. Each detector is shown firing on a text built to contain the thing, and
 * staying quiet on one built not to.
 */
export function proseSelfTestCases() {
  const build = (passages, language = 'en') => ({
    work: 'Fixture', language,
    sections: [{ id: 's1', title: 'ONE', passages }],
  });
  const narr = (id, text) => ({ id, kind: 'narration', text });
  const say = (id, speaker, text) => ({ id, kind: 'dialogue', speaker, text });

  const sameVoice = build([
    ...Array.from({ length: 10 }, (_, i) => say(`a${i}`, 'A', 'I do not think that it is a thing which can be done in the time we have.')),
    ...Array.from({ length: 10 }, (_, i) => say(`b${i}`, 'B', 'I do not think that it is a thing which can be done in the time we have.')),
  ]);
  const differentVoice = build([
    ...Array.from({ length: 10 }, (_, i) => say(`a${i}`, 'A', 'Six out. Two carried. Count them again at the gate and tell me the number.')),
    ...Array.from({ length: 10 }, (_, i) => say(`b${i}`, 'B', 'It would be a considerable simplification, if I may say so, were the matter to be regarded in the light of the clause under which we are all of us presently operating.')),
  ]);

  const fired = (xs) => xs.map((x) => (typeof x === 'string' ? x
    : x.id ? `${x.id}: ${x.match}`
      : x.phrase ? `"${x.phrase}" ×${x.count}`
        : `${x.a}/${x.b} ${x.divergence}`));

  return [
    {
      name: 'voiceDivergence: two characters written identically fall under a declared floor',
      evaluate: () => fired(voiceDivergence(sameVoice, { floor: 0.05 }).belowFloor),
    },
    {
      name: 'CONTROL voiceDivergence: two characters written differently clear the same floor',
      shouldFire: false,
      evaluate: () => fired(voiceDivergence(differentVoice, { floor: 0.05 }).belowFloor),
    },
    {
      name: 'translationese: the constructions are counted where they occur',
      evaluate: () => fired(translationese(build([narr('n1', 'She was able to reach one of the vents in order to check it, due to the fact that nobody else would.')])).hits),
    },
    {
      name: 'CONTROL translationese: plain prose registers nothing',
      shouldFire: false,
      evaluate: () => fired(translationese(build([narr('n1', 'She reached the vent and checked it because nobody else would.')])).hits),
    },
    {
      name: 'translationese: the Japanese list fires on Japanese text',
      evaluate: () => fired(translationese(build([narr('n1', 'これは確認することができる作業のうちの一つである。')], 'ja')).hits),
    },
    {
      name: 'repetition: a phrase used twice is reported with both locations',
      evaluate: () => fired(repetition(build([
        narr('n1', 'the ground under cellar row went in the dark'),
        narr('n2', 'again the ground under cellar row went in the dark'),
      ]), { n: 6 }).repeats),
    },
    {
      name: 'CONTROL repetition: prose that does not repeat itself reports nothing',
      shouldFire: false,
      evaluate: () => fired(repetition(build([
        narr('n1', 'the ground under cellar row went in the dark'),
        narr('n2', 'by morning the wind had turned and nobody said anything at all'),
      ]), { n: 6 }).repeats),
    },
    {
      name: 'overExplanation: narration naming the feeling after a line of dialogue is caught',
      evaluate: () => fired(overExplanation(build([
        say('d1', 'A', 'Get out of the yard.'),
        narr('n1', 'She was afraid, and she did not want him to see it.'),
      ])).hits),
    },
    {
      name: 'CONTROL overExplanation: narration that shows instead of naming reports nothing',
      shouldFire: false,
      evaluate: () => fired(overExplanation(build([
        say('d1', 'A', 'Get out of the yard.'),
        narr('n1', 'She went up the stairs two at a time and did not look back at him.'),
      ])).hits),
    },
    {
      name: 'sentenceLengths: a text of identical sentences has no spread',
      evaluate: () => {
        const cv = sentenceLengths(build([narr('n1', 'He went out. She went out. They went out. We went out.')])).cv;
        return cv < 0.05 ? [`cv ${cv}`] : [];
      },
    },
    {
      name: 'CONTROL sentenceLengths: varied sentences have spread',
      shouldFire: false,
      evaluate: () => {
        const cv = sentenceLengths(build([narr('n1', 'He went. She stood in the doorway for a long time with the door open and the cold coming in and said nothing at all to anybody. They left.')])).cv;
        return cv < 0.05 ? [`cv ${cv}`] : [];
      },
    },
  ];
}
