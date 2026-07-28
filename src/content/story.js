/**
 * CINDERLINE — the story.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PREMISE
 *
 * Hollis sits on a burning seam of coal and eighty years of tipped refuse. The
 * Hollis Reclamation Authority holds the contract to manage it, and every
 * quarter it publishes the Cinder Line: the surveyed boundary of the burn.
 *
 * Twenty-two months ago Renata Vasko was a survey assistant. She read the Q3
 * borehole data and saw that the line about to be published sat two hundred
 * metres east of where the numbers put it. She said nothing. She needed the
 * job. Four months later — eighteen months ago, and everyone in Hollis counts
 * from that night — the ground under Cellar Row, which the published line
 * called safe, vented in the dark, and nine people died in their basements
 * without ever waking up.
 *
 * She left Hollis. She is back because a letter reached her: Ilya Bek's, one
 * of the nine, never posted, written to the Authority eleven days before he
 * died, saying exactly what Ren had already worked out and kept to herself.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THE STORY IS ABOUT
 *
 * Not whether the Authority lied — the player learns that in chapter one.
 * It is about what the truth is *for*. Ren wants it to absolve her. Nessa Bek
 * needs it to grieve properly. Krajcik argues, from a real budget and a real
 * relocation schedule, that publishing it will kill more people than it saves.
 * Sol reaches the same answers from a rota and a clipboard, and would tell you
 * so to your face.
 *
 * They are the same argument in two registers, and the script keeps them apart
 * on purpose: Sol counts people out loud and never uses an abstract noun;
 * Krajcik reaches for the passive voice and the clause number exactly when he
 * is most exposed.
 *
 * Nobody in this story is lying for money. Everybody is choosing whose
 * survival counts. So is the player.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Reason sentinel for a trust change that must NOT surface as a toast.
 *
 * Trust is not a morality meter and the interface must not turn it into one.
 * The four beats where Ren says the hard true thing move the number and say
 * nothing, because a red popup reading "She knows what you are now" over a
 * confession is the game marking her homework.
 */
export const QUIET = '\u0000quiet';

// ============================================================== CHARACTERS ==

export const CAST = {
  ren: {
    name: 'Ren', full: 'Renata Vasko', colour: '#ff7a2f',
    bio: `Forty-one. Mine-rescue trained at nineteen, ten years on a rescue team,
then eight as a survey tech for the people who were supposed to be putting the
fire out. Reads air the way other people read weather. Deflects everything into
the next practical task, which is why she is very good in a crisis and very bad
afterwards.`,
  },
  teo: {
    name: 'Teo', full: 'Teodor Marsh', colour: '#d8b46a',
    bio: `Sixty-three. Pit deputy for twenty-two years, which means he was the man
who walked in first and decided whether anyone else could. Runs the filter
exchange out of the Marrow Arcade. Knew Ren's father. Taught Ren to read a
flame. Sent her the letter and will not pretend he didn't.`,
  },
  sol: {
    name: 'Sol', full: 'Marisol Ferrant', colour: '#a8c04a',
    bio: `Thirty-five. Paramedic until the ambulances stopped coming. Holds the
Stacks together with a generator, a rota and an absolute refusal to be
sentimental about arithmetic. Has been cracking borehole heads on the west side
to pull the gas off her block. She knows where it goes.`,
  },
  nessa: {
    name: 'Nessa', full: 'Nessa Bek', colour: '#8fb4c4',
    bio: `Nineteen. Ilya Bek's daughter. Runs filters for Sol's crew, which means
she goes into the low ground for other people four times a week. Talks fast,
jokes badly, and has never asked anybody to feel sorry for her.`,
  },
  iris: {
    name: 'Iris', full: 'Iris Nadeau', colour: '#7fa2b4',
    bio: `Thirty-three. Survey Engineer II. Was Ren's junior. Signs the lines now.
Has been noticing, and not saying, for a year longer than Ren managed, and is
the only person in the building who has kept a record of it.
Wants very badly for someone to tell her it was survivable.`,
  },
  krajcik: {
    name: 'Krajcik', full: 'Aurel Krajcik', colour: '#c9c2b4',
    bio: `Fifty-five. Site Director. Inherited a contract written so that admitting
the burn's true extent voids it, and made a decision: keep the money moving and
relocate people quietly with the margin. Three hundred and forty households, so
far. He has never raised his voice at anyone in his life.`,
  },
};

// =================================================================== QUESTS ==

const Q = {};

// ---------------------------------------------------------------- CHAPTER 1

Q.arrival = {
  id: 'arrival', title: 'Bad Air', chapter: 1,
  summary: 'You are back in Hollis. Find Marisol Ferrant in the Stacks.',
  onStart: [{ chapter: 1 }, { card: ['CHAPTER ONE', 'BAD AIR', 'The Stacks · Hollis'] }],
  steps: [
    {
      objective: 'Cross the courtyard to the fire in the middle of the Stacks.',
      trigger: { kind: 'reach', pos: [-112, -86], radius: 6 },
      onDone: [{ journal: ['back', 'Back in Hollis', `Eighteen months. The courtyard still smells of the
same three things: wet ash, paraffin, and whatever they are burning in the
barrels that week. Nobody looked up when I came through the gate. That is either
very good or very bad and I will find out which.`] }],
    },
    {
      objective: 'Read your meter. Learn what the air is doing here.',
      hint: 'The meter is in your left hand — USE it, or watch the readout top-left.',
      trigger: { kind: 'custom', id: 'meterRead' },
      onDone: [{ bump: ['metersRead', 1] }],
    },
    {
      objective: 'Speak to Marisol Ferrant.',
      marker: 'sol',
      trigger: { kind: 'talk', who: 'sol' },
    },
    {
      objective: 'Scavengers are in the courtyard. Put them out.',
      onEnter: [{ fn: 'spawnCourtyardRaid' }],
      trigger: { kind: 'custom', id: 'raidCleared' },
      onDone: [{ trust: ['sol', 12, 'You fought for the block.'] }],
    },
    {
      objective: 'Speak to Sol again.',
      marker: 'sol',
      trigger: { kind: 'talk', who: 'sol', convo: 'sol_after_raid' },
    },
    {
      objective: 'Go down Marrow Street to the Arcade. Find Teodor Marsh.',
      marker: 'arcade',
      trigger: { kind: 'talk', who: 'teo' },
      onDone: [{ quest: 'log' }],
    },
  ],
  onComplete: [{ chapter: 2 }],
};

Q.log = {
  id: 'log', title: 'The Numbers Behind the Line', chapter: 2,
  summary: 'Teo wants the raw borehole log from Vent Field 9 — the data the published Cinder Line was drawn against.',
  steps: [
    {
      objective: 'Marrow Street is cut at the Slip. Find a way east.',
      hint: 'The hole is nine metres deep and the air in it will kill you. Go up.',
      marker: 'slipEscape',
      trigger: { kind: 'reach', pos: [-44, -14], radius: 7, y: 10, yTolerance: 4 },
      onDone: [
        { card: ['CHAPTER TWO', 'THE SLIP', 'Marrow Street'] },
        { journal: ['slip', 'The Slip', `Bower Street is a hole now. Eighteen metres across, nine
deep, and the meter reads four thousand at the bottom. The Authority put barriers
round it and called that a response. You get past it the way you get past
anything in this city: you climb, and you stay above the smoke.`] },
      ],
    },
    {
      objective: 'Cross South Marrow and reach Cinder Road.',
      marker: 'cinderroad',
      trigger: { kind: 'reach', pos: [25, -6], radius: 9 },
      onDone: [{ quest: 'southmarrow' }],
    },
    {
      objective: 'Get into Vent Field 9 and recover the borehole log.',
      marker: 'ventfield',
      trigger: { kind: 'collect', item: 'logbook' },
      onDone: [{ journal: ['log', 'Borehole log', `Raw readings. Nine boreholes, temperature and CO,
weekly, going back three years. I do not need the published line to know what
this says. Vent 9-3 was over four hundred degrees in the July before Cellar Row.
The line they printed that quarter put Cellar Row two hundred metres outside the
burn.`] }],
    },
    {
      objective: 'Take the log back to Teo at the Arcade.',
      marker: 'arcade',
      trigger: { kind: 'talk', who: 'teo', convo: 'teo_log' },
    },
  ],
  onComplete: [{ flag: 'has_log' }, { chapter: 3 }, { quest: 'office' }],
};

// ---------------------------------------------------------------- CHAPTER 2

Q.southmarrow = {
  id: 'southmarrow', title: 'What the Draw Takes', chapter: 2,
  summary: 'The air in South Marrow has got much worse, and it is not the burn advancing.',
  steps: [
    {
      objective: 'Read the air on Fenn Street. Something has changed here.',
      marker: 'southmarrow',
      trigger: { kind: 'reach', pos: [-60, 56], radius: 10 },
      onDone: [
        { journal: ['southair', 'South Marrow', `Twelve hundred at head height on Fenn Street. That is not
a seam creeping; a seam creeps at metres a month. That is a draw. Somebody has
opened something upwind and the whole field is being pulled through here.`] },
      ],
    },
    {
      objective: 'Find what is pulling the gas into South Marrow.',
      marker: 'ventWest',
      trigger: { kind: 'interact', id: 'vent_west_1' },
      onDone: [
        { flag: 'found_venting' },
        { journal: ['venting', 'Cracked heads', `Three borehole heads on the west side, cracked open with
a bar and wedged. Deliberate, competent, and recent. Whoever did it knew exactly
what it would do to the Stacks — and exactly what it would do here.`] },
      ],
    },
    {
      objective: 'There are still people living in South Marrow. Find them.',
      marker: 'bek',
      trigger: { kind: 'talk', who: 'garage' },
      onDone: [{ flag: 'met_garage' }],
    },
    {
      objective: 'Decide what to do about the vents.',
      hint: 'Shutting them saves Fenn Street and starts filling the Stacks courtyard. Leaving them does the reverse.',
      marker: 'ventWest',
      trigger: { kind: 'custom', id: 'ventDecision' },
    },
  ],
  onComplete: [{ flag: 'southmarrow_done' }],
};

// ---------------------------------------------------------------- CHAPTER 3

Q.office = {
  id: 'office', title: 'Field Office Two', chapter: 3,
  summary: 'The published line, the raw log, and the order that was never issued.',
  onStart: [{ card: ['CHAPTER THREE', 'FIELD OFFICE TWO', 'The Cut'] }],
  steps: [
    {
      objective: 'Get across the Cut to the H.R.A. field office.',
      marker: 'survey',
      trigger: { kind: 'reach', pos: [62, -33], radius: 8 },
    },
    {
      objective: 'Speak to Iris Nadeau.',
      marker: 'survey',
      trigger: { kind: 'talk', who: 'iris' },
    },
    {
      // Two doors: Iris's pass, or the rusted hasp she points at instead. They
      // used to be the same door, so her refusal cost nothing. They are two
      // doors now, and which one you took is carried by `entered_unlogged`
      // into the scene with Krajcik rather than by forking the quest — the
      // difference is what he says, not what you have to do next.
      objective: 'Get inside the field office.',
      marker: 'survey',
      trigger: { kind: 'interact', ids: ['survey_door', 'survey_backdoor'] },
    },
    {
      objective: 'Find the trench cut order.',
      hint: 'Second drawer of the desk under the published board.',
      trigger: { kind: 'collect', item: 'trenchOrder' },
      onDone: [
        { flag: 'has_order' },
        { journal: ['order', 'The order that was never issued', `A full firebreak trench. Costed at
nine point four million. Authorised internally, signed by Krajcik himself,
dated fourteen months ago — and never issued. Because issuing it is an admission
that the line was wrong, and the contract is written so that an admission voids
it.`] },
      ],
    },
    {
      objective: 'Aurel Krajcik is through the partition.',
      trigger: { kind: 'talk', who: 'krajcik' },
    },
  ],
  onComplete: [{ chapter: 4 }, { quest: 'whitedamp' }],
};

// ---------------------------------------------------------------- CHAPTER 4

Q.whitedamp = {
  id: 'whitedamp', title: 'Whitedamp', chapter: 4,
  summary: 'The burn has moved. Somewhere is filling tonight.',
  onStart: [
    { card: ['CHAPTER FOUR', 'WHITEDAMP', 'Hollis'] },
    { fn: 'beginCrisis' },
  ],
  steps: [
    {
      objective: 'Get to the flooded block.',
      marker: 'crisis',
      trigger: { kind: 'custom', id: 'crisisArrive' },
    },
    {
      objective: 'Get everyone out. Use the roofs — the ground level is lethal.',
      hint: 'Four people. You will not have time for all of them if you are careless.',
      trigger: { kind: 'custom', id: 'crisisResolved' },
    },
    {
      objective: 'Find Nessa.',
      marker: 'nessa',
      trigger: { kind: 'talk', who: 'nessa', convo: 'nessa_truth' },
    },
  ],
  onComplete: [{ flag: 'ch4_done' }, { chapter: 5 }, { quest: 'cinderline' }],
};

// ---------------------------------------------------------------- CHAPTER 5

Q.cinderline = {
  id: 'cinderline', title: 'The Cinder Line', chapter: 5,
  summary: 'They are cutting the trench. On the published line, which will do nothing.',
  onStart: [{ card: ['CHAPTER FIVE', 'THE CINDER LINE', 'The Cut'] }, { fn: 'raisePlant' }],
  steps: [
    {
      objective: 'Get to the trench.',
      marker: 'trench',
      trigger: { kind: 'reach', pos: [74, 20], radius: 10 },
    },
    {
      // The premise says nobody in this story is lying for money and everybody
      // is choosing whose survival counts. Making the only route in a fight
      // with three of the people being counted contradicts that, so there is
      // a second way through, and it is the one Ren is actually good at.
      objective: 'Get past the Warden line at the cut.',
      hint: 'They are on a shift, not a crusade. Fight them, go over them, or give them a reason.',
      onEnter: [{ fn: 'spawnTrenchLine' }],
      trigger: { kind: 'custom', id: 'trenchPassed' },
    },
    {
      objective: 'Decide what the truth is for.',
      marker: 'trench',
      trigger: { kind: 'custom', id: 'endingChosen' },
    },
  ],
};

// ------------------------------------------------------------- SIDE QUESTS

Q.filters = {
  id: 'filters', title: 'The Exchange', chapter: 1, side: true,
  summary: 'Teo will trade. Salvage for filters, and he does not do favours.',
  steps: [
    // Two steps, because "trade with Teo" and "actually stock up" are different
    // things and the second is the one that keeps you alive in chapter four.
    { objective: "Open Teo's exchange in the Marrow Arcade.",
      marker: 'arcade',
      trigger: { kind: 'custom', id: 'teoTrade' } },
    { objective: 'Hold four cartridges at once. Field 9 is not a place to be short.',
      trigger: { kind: 'collect', item: 'filter', n: 4 },
      onDone: [
        { trust: ['teo', 6, 'She came back stocked.'] },
        { journal: ['stocked', 'Four cartridges', `Four on me. Marsh counted them out and then counted
them again in front of me, which is the closest he comes to saying be careful.`] },
      ] },
  ],
};

Q.nessaRun = {
  id: 'nessaRun', title: "Nessa's Run", chapter: 2, side: true,
  summary: 'Nessa runs filters into the low ground four times a week. She has not come back.',
  steps: [
    { objective: "Follow Nessa's run route further into South Marrow.",
      marker: 'nessaRun',
      hint: 'She was carrying west. The bag was dropped where she turned back.',
      trigger: { kind: 'reach', pos: [-118, 58], radius: 9 } },
    { objective: 'Find Nessa.', marker: 'nessaRun',
      trigger: { kind: 'talk', who: 'nessa', convo: 'nessa_rescue' },
      onDone: [{ trust: ['nessa', 18, 'You came down for her.'] }] },
    { objective: 'Get her above the smoke. She can walk. She cannot climb.',
      marker: 'nessaRun',
      hint: 'Three metres up and out of the draw. Find her a way, not a door.',
      trigger: { kind: 'custom', id: 'nessaOut' },
      onDone: [{ trust: ['sol', 8, 'You brought her back.'] }] },
  ],
  onComplete: [{ give: ['filter', 2] }],
};

Q.cellarRow = {
  id: 'cellarRow', title: 'Cellar Row', chapter: 2, side: true,
  summary: 'Nine people. The board on Fenn Street lists them.',
  steps: [
    { objective: 'Read the memorial board on Fenn Street.',
      trigger: { kind: 'interact', id: 'cellar_row_memorial' },
      onDone: [{ journal: ['cellarrow', 'Cellar Row', `Nine names, painted by hand, and under them
somebody has written THEY WERE TOLD IT WAS SAFE. Bek, I. is fourth. I stood in
front of it for a while. There was nothing useful to do, so I did nothing, which
is a thing I am apparently very practised at.`] }] },
  ],
};

export const QUESTS = Q;

// ============================================================== CONVERSATIONS

const C = {};

/** Helper for player lines. */
const ren = (text) => ({ speaker: 'ren', text });
const line = (who, text, mood) => ({ speaker: who, text, mood });

// ------------------------------------------------------------------- SOL ---

C.sol_first = {
  id: 'sol_first', who: 'sol',
  entry: [
    { if: { flag: 'sol_met' }, goto: 'again' },
    { if: {}, goto: 'start' },
  ],
  nodes: {
    start: {
      ...line('sol', "You walked in through the west gate. Nobody walks in through the west gate.", 'flat'),
      next: 's2',
    },
    s2: { ...line('sol', "So either you don't know this place, or you know it well enough not to care. Which?"),
      choices: [
        { text: "I know it. I used to survey it.", goto: 's_survey',
          effects: [{ flag: 'sol_knows_survey' }] },
        { text: "I know the air. That's all I need to know.", goto: 's_air' },
        { text: "I'm passing through.", goto: 's_lie', effects: [{ trust: ['sol', -4, 'She did not believe you.'] }] },
      ],
    },
    s_survey: {
      ...line('sol', "Surveyed it. For them.", 'hard'),
      next: 's_survey2',
    },
    s_survey2: {
      ...line('sol', `Then you know exactly how much good a survey does. I've got a hundred and
six people in these three blocks and not one of them has ever been helped by a
line on a map.`),
      next: 's_ask',
    },
    s_air: {
      ...line('sol', "Everyone says that. Then they sleep on the ground floor and we carry them out at four in the morning."),
      next: 's_ask',
    },
    s_lie: {
      ...line('sol', "Nobody passes through Hollis. There's nowhere on the other side.", 'flat'),
      next: 's_ask',
    },
    s_ask: {
      ...line('sol', "What do you want?"),
      choices: [
        { text: "Teodor Marsh. He sent for me.", goto: 's_teo' },
        { text: "A place to stand for a night. I'll work for it.", goto: 's_work' },
        { text: "I'm looking into what happened at Cellar Row.", goto: 's_cellar',
          if: {}, effects: [{ flag: 'sol_told_cellar' }, { bump: ['honest', 1] },
                              { trust: ['sol', 6, QUIET] }] },
      ],
    },
    s_teo: {
      ...line('sol', "Marsh. Of course. That old man's fingers are in everything and none of it is ever his fault."),
      next: 's_deal',
    },
    s_work: {
      ...line('sol', "Everybody works. That's not generosity, it's arithmetic."),
      next: 's_deal',
    },
    s_cellar: {
      ...line('sol', "Cellar Row.", 'quiet'),
      next: 's_cellar2',
    },
    s_cellar2: {
      ...line('sol', `Nine people. I was on the third floor of Pell when it went. We heard nothing.
That's the thing nobody understands about the black — there's nothing to hear.`),
      next: 's_cellar3',
    },
    s_cellar3: {
      ...line('sol', "If you're here to write a report about it eighteen months late, you can turn round."),
      choices: [
        { text: "I'm here to publish what was in the data.", goto: 's_deal',
          effects: [{ trust: ['sol', 5, 'At least she is direct.'] }] },
        { text: "I'm here because I should have said something at the time.", goto: 's_confess',
          effects: [{ flag: 'sol_confession' }, { trust: ['sol', -8, 'She knows what you are now.'] },
                    { journal: ['told_sol', 'I told Sol', `I told her. Not everything — I did not say
Bek's name — but enough. She did not shout. She just looked at me for a while
and then went back to counting cartridges, which was worse.`] }] },
      ],
    },
    s_confess: {
      ...line('sol', "...Say that again.", 'quiet'),
      next: 's_confess2',
    },
    s_confess2: {
      ...line('sol', `No. Don't. I heard you.

Here's what I'll do with that: nothing. Not today. Today you're a pair of hands
and I am short of hands. We'll have the other conversation when there's time,
and there is never time.`),
      next: 's_deal',
    },
    s_deal: {
      ...line('sol', `Right. You want to stand in my courtyard, you're on the rota. Nobody sleeps
below the second floor. Nobody goes into the yard after dark without a light.
And if the meter goes over eight hundred you go up, you don't go home.`),
      effects: [{ flag: 'sol_met' }],
      next: 's_end',
    },
    s_end: {
      ...line('sol', "Marsh is at the Arcade, down Marrow. Mind the Slip."),
      next: 'end',
    },
    // Sol's re-entry used to check only `found_venting`, so once the player had
    // already had the confrontation — and once they had already shut her
    // borehole heads and flooded her yard — walking up to her replayed the
    // whole scene verbatim. She is the person the player's decisions land on
    // hardest; she gets a state for every one of them.
    again: {
      ...line('sol', "Still here."),
      branch: [
        { if: { flag: 'ch4_done' }, goto: 'after_crisis' },
        { if: { flag: 'vents_shut' }, goto: 'after_shut' },
        { if: { flag: 'vents_half' }, goto: 'after_half' },
        { if: { flag: 'vents_left' }, goto: 'after_left' },
        { if: { flag: 'found_venting' }, goto: 'vent_confront' },
        { if: {}, goto: 'again2' },
      ],
    },
    again2: {
      ...line('sol', "Yard's holding. Ask me again after dark."),
      next: 'end',
    },

    // ---- after the vent decision -------------------------------------------
    after_shut: {
      ...line('sol', `Nine hundred in my courtyard at four this morning. I moved eleven people up a
stairwell in the dark with two lamps between us.`, 'flat'),
      next: 'as2',
    },
    as2: {
      ...line('sol', `I'm not going to shout at you. You did a thing you thought was right and you
did it where I could see you do it, which is more than most.

I want you to know the number, that's all. Nine hundred. Four in the morning.`),
      branch: [
        { if: { flag: 'sol_confession' }, goto: 'as_conf' },
        { if: {}, goto: 'as_end' },
      ],
    },
    as_conf: {
      ...line('sol', `And before you say it — no, this isn't the same as the other thing. The other
thing you did by keeping your mouth shut. This one you did with a spanner, in
daylight, and then you came and stood in front of me.

I would rather be on this side of it. That is not the same as thanking you.`, 'quiet'),
      effects: [{ trust: ['sol', 5, 'She counted the difference.'] }],
      next: 'as_end',
    },
    as_end: {
      ...line('sol', "Go on. There's a rota and you're not on it today."),
      branch: [
        { if: { all: [{ flag: 'sol_knows_survey' }, { notFlag: 'sol_told_cellar' }] }, goto: 'as_survey' },
        { if: {}, goto: 'end' },
      ],
    },
    as_survey: {
      ...line('sol', `And Vasko. You told me at the gate you used to survey it. You did not tell me
which quarter.

I have not asked. I want you to notice that I have not asked.`, 'quiet'),
      next: 'end',
    },

    after_half: {
      ...line('sol', `One head. You shut one head.

Fenn's at seven hundred and my yard's at five, which means neither place is
survivable and both places are survivable, depending which hour you ask. I have
had to write two rotas instead of one.`, 'flat'),
      next: 'ah2',
    },
    ah2: {
      ...line('sol', `I know why you did it. You did it so that nobody's death would be entirely
yours. I have watched people do that with morphine and I have never once seen it
work.

Come back when you've picked one.`),
      next: 'end',
    },

    after_left: {
      ...line('sol', "You left them open."),
      next: 'al2',
    },
    al2: {
      ...line('sol', `I did not think you would. I had a whole speech.

Now I have to look at you knowing you agreed with me, which is worse, because I
have spent two years telling myself only a monster would agree with me.`, 'quiet'),
      next: 'end',
    },

    // ---- after the crisis ---------------------------------------------------
    after_crisis: {
      ...line('sol', "Sit down. You're grey."),
      branch: [
        { if: { flag: 'crisis_saved_all' }, goto: 'ac_all' },
        { if: { flag: 'crisis_saved_some' }, goto: 'ac_some' },
        { if: {}, goto: 'ac_none' },
      ],
    },
    ac_all: {
      ...line('sol', `Four out of four. I have done this for eleven years and I have had four out of
four twice.

I'm going to say the thing I don't say. If you'd been here eighteen months ago
with that in you, Cellar Row would have been nine people at a window instead of
nine people in a bed.`, 'quiet'),
      effects: [{ trust: ['sol', 10, 'Four out of four.'] }],
      next: 'ac_end',
    },
    ac_some: {
      ...line('sol', `You got some of them. That's the job. The job is not everybody, it has never
been everybody, and anyone who tells you it is has not done it.

You'll want to give me the names of the ones you didn't. Don't. I already have
them. I write them down before I need to.`),
      effects: [{ trust: ['sol', 5, 'She has done that shift.'] }],
      next: 'ac_end',
    },
    ac_none: {
      ...line('sol', `None. All right.

Look at me. Two hundred seconds and a filling street and one cartridge is not a
rescue, it is a coin toss you were made to call. I have called it wrong. I will
call it wrong again.`, 'quiet'),
      next: 'ac_end',
    },
    ac_end: {
      ...line('sol', "Now. The Authority has plant on the road at Kell. That is tomorrow's problem and it is coming tonight."),
      branch: [
        { if: { flag: 'crisis_stacks' }, goto: 'ac_stacks' },
        { if: { flag: 'crisis_south' }, goto: 'ac_south' },
        { if: {}, goto: 'ac_close' },
      ],
    },
    ac_stacks: {
      ...line('sol', `It was my yard, Vasko. My yard, at four in the morning, because of three
borehole heads that a month ago were doing their job.

I am telling you that as a fact, not as a knife. I have to be able to say the
true shape of a thing out loud or I stop being able to do this.`, 'flat'),
      next: 'ac_close',
    },
    ac_south: {
      ...line('sol', `Fenn Street. Which is not my block, which is why nobody but you and I are going
to say anything about it at all.

Eleven people lived down there this morning. I could tell you the number every
week for two years and nobody came. You came.`, 'quiet'),
      next: 'ac_close',
    },
    ac_close: {
      ...line('sol', "Get some water in you."),
      effects: [{ flag: 'sol_debrief' }],
      next: 'end',
    },
    vent_confront: {
      ...line('sol', "You've been west.", 'flat'),
      next: 'vc2',
    },
    vc2: {
      ...line('sol', "Say it, then. You've been holding it in your mouth since you came through the gate."),
      choices: [
        { text: "You cracked three borehole heads. You're pulling the field through Fenn Street.",
          goto: 'vc_admit' },
        { text: "There are still people living down there. I met them.", goto: 'vc_people' },
        { text: "I'm not here to judge it. I want to understand it.", goto: 'vc_admit',
          effects: [{ trust: ['sol', 4, 'She did not come in swinging.'] }] },
      ],
    },
    vc_people: {
      ...line('sol', "Eleven. The Ostrowskis in the garage, the two on Vane Street, and whoever is squatting the chapel. I have the number. I keep the number.", 'quiet'),
      next: 'vc_admit',
    },
    vc_admit: {
      ...line('sol', `Yes. I cracked them. I wedged them open with a bar and a rag and I did it
myself so that if it ever comes back on anyone it comes back on me.

Do you want the arithmetic or do you want to be angry first? I can wait.`),
      choices: [
        { text: "Give me the arithmetic.", goto: 'vc_math' },
        { text: "You're doing exactly what Krajcik does. Just smaller.", goto: 'vc_krajcik',
          effects: [{ trust: ['sol', -6, 'She has heard that before.'] }] },
        { text: "Nothing. I just needed to hear you say it.", goto: 'vc_quiet' },
      ],
    },
    vc_math: {
      ...line('sol', `A hundred and six here. Eleven there. The heads pull about nine hundred parts
off my courtyard overnight and put about eleven hundred onto Fenn Street. Fenn
Street is upstairs-capable; every building down there has a first floor and every
one of those eleven people knows to use it. My courtyard is where the water is,
the generator is, and the only clear ground for two blocks.

If I shut the heads, I lose the yard. If I lose the yard I lose the block inside
a fortnight.`),
      next: 'vc_end',
    },
    vc_krajcik: {
      ...line('sol', `Yes.

That's it. That's the whole answer. I'm doing what he does and I'm doing it with
my own hands instead of a spreadsheet, and the only difference between us is that
I have to look at them afterwards.

Does knowing that help you? It has never once helped me.`),
      next: 'vc_end',
    },
    vc_quiet: {
      ...line('sol', "Well. Now you've heard it.", 'quiet'),
      next: 'vc_end',
    },
    vc_end: {
      ...line('sol', `You'll do what you'll do. You've got a bar and you know which way the wedges
came out. I'm not going to stand in front of them.

Just don't tell me it was easy afterwards.`),
      effects: [
        { flag: 'sol_vent_talked' }, { cap: 'rigVent' },
        { journal: ['rigvent', 'Rigging a head', `Sol showed me how she does it. Two turns on the
collar and a rag in the gap. It is not clever. That is what makes it frightening
— anyone with a bar can move where the gas goes, and nobody is counting.`] },
      ],
      next: 'end',
    },
  },
};

C.sol_after_raid = {
  id: 'sol_after_raid', who: 'sol',
  nodes: {
    start: {
      ...line('sol', "That's the third time this month. They're not after the food."),
      next: 'r_shift',
    },
    r2: {
      ...line('sol', "They're after cartridges. Which tells you what's happening out there better than any survey."),
      choices: [
        { text: "Where are they coming from?", goto: 'r_where' },
        { text: "How many filters do you have left?", goto: 'r_filters' },
      ],
    },
    r_where: {
      ...line('sol', `Ash crews. They strip the empty blocks — copper, cable, anything. When the
buildings run out they come for people. There's no mystery in it. Hungry is
hungry.`),
      next: 'r_end',
    },
    r_filters: {
      ...line('sol', `Enough for four days if nobody does anything stupid. Marsh has more and Marsh
does not give things away. Take that up with him.`),
      next: 'r_end',
    },
    r_shift: {
      ...line('sol', `And that was your shift, by the way. I put you on the rota an hour ago and you
did a barrel watch with a prybar, which is not what the rota says, and I have
marked it down as done.

Nobody gets to stand in this yard and not be on it. Not even you.`),
      next: 'r2',
    },
    r_end: {
      ...line('sol', "Go and see him. And Vasko —"),
      next: 'r_end2',
    },
    r_end2: {
      ...line('sol', "Yes, I know your name. Everybody in this yard knows your name. Some of them are being polite about it."),
      next: 'r_rope',
    },
    r_rope: {
      ...line('sol', `Take this. Thirty metres of line and a descender. It was in the ambulance and
the ambulance is not coming back.

If you go up — and you will go up, everyone does eventually — you want a way down
that is not falling.`),
      effects: [
        { flag: 'sol_knows_name' }, { cap: 'shortRope' },
        { trust: ['sol', 6, 'She gave you her line.'] },
      ],
      next: 'end',
    },
  },
};

// ------------------------------------------------------------------- TEO ---

C.teo_first = {
  id: 'teo_first', who: 'teo',
  entry: [
    { if: { flag: 'teo_met' }, goto: 'again' },
    { if: {}, goto: 'start' },
  ],
  nodes: {
    start: {
      ...line('teo', "Vasko.", 'dry'),
      next: 't2',
    },
    t2: {
      ...line('teo', "You took your time. I posted that in March."),
      choices: [
        { text: "It went to an address I hadn't lived at for a year.", goto: 't_addr' },
        { text: "I read it in March. It took me until now to get on a train.", goto: 't_honest',
          effects: [{ trust: ['teo', 8, 'She did not dress it up.'] }] },
        { text: "You could have written your name on it.", goto: 't_name' },
      ],
    },
    t_addr: { ...line('teo', "Mm. Well. It found you."), next: 't_why' },
    t_honest: { ...line('teo', "That's about right. That's about what I'd have done."), next: 't_why' },
    t_name: {
      ...line('teo', `And have you decide whether to come based on who was asking? No. Better you
decided based on what was in it.`),
      next: 't_why',
    },
    t_why: {
      ...line('teo', "You'll want to know why I sent it."),
      next: 't_why2',
    },
    t_why2: {
      ...line('teo', `Bek gave that letter to me to post. Eleven days before. I put it in my coat
and I forgot it, because I was sixty-one years old and I was tired and it was a
Thursday.

I found it again in a coat I hadn't worn since the funeral.`),
      choices: [
        { text: "What was he like?", goto: 't_bek', effects: [{ flag: 'ren_asked_bek' }] },
        { text: "You could have burned it.", goto: 't_burn' },
        { text: "[Say nothing]", goto: 't_why3' },
      ],
    },
    t_bek: {
      ...line('teo', `Ilya? Careful. Kept a rain gauge on his own roof for sixteen years because he
did not think the published one was sited properly.

He was right about that too. It changed nothing. He knew it would change
nothing and he kept the gauge.`, 'quiet'),
      next: 't_why3',
    },
    t_burn: {
      ...line('teo', `I thought about it for four days. I had it on the counter and I looked at it.

Then I thought: that would be me deciding, on my own, in a shop, what somebody
else was allowed to know. Which is the whole of what was done to this town.`),
      effects: [{ trust: ['teo', 6, 'He had already worked it out.'] }],
      next: 't_why3',
    },
    t_why3: {
      ...line('teo', "So. Now there are two of us who didn't do the small thing at the time.", 'quiet'),
      choices: [
        { text: "That's not the same.", goto: 't_notsame', effects: [{ bump: ['deflected', 1] }] },
        { text: "No. There are two of us.", goto: 't_same',
          effects: [{ trust: ['teo', 10, QUIET] }, { flag: 'teo_shared' },
                    { bump: ['honest', 1] }] },
        { text: "What do you want me to do about it?", goto: 't_task', effects: [{ bump: ['deflected', 1] }] },
      ],
    },
    t_notsame: {
      ...line('teo', `No. It isn't. You read the data. I mislaid an envelope. I've told myself the
difference a great many times and I have yet to sleep on the strength of it.`),
      next: 't_task',
    },
    t_same: {
      ...line('teo', "...Aye.", 'quiet'),
      next: 't_task',
    },
    t_task: {
      ...line('teo', "A letter proves a man was worried."),
      next: 't_task1b',
    },
    t_task1b: {
      ...line('teo', `You need the raw log. Not the published line — the numbers the line was drawn
against.

Nine heads. Weekly. Three years. In their own hand.`),
      next: 't_task2',
    },
    t_task2: {
      ...line('teo', "It's in the instrument hut at Vent Field 9. Past the Cut. Past a lot of things."),
      choices: [
        { text: "Why haven't you got it yourself?", goto: 't_self' },
        { text: "I know the field. I calibrated half those heads.", goto: 't_calib',
          effects: [{ flag: 'ren_knows_field' }] },
        { text: "What's it worth to you?", goto: 't_worth',
          effects: [{ trust: ['teo', -5, 'He expected better of her.'] }] },
      ],
    },
    t_self: {
      ...line('teo', `Because Field 9 sits at nine hundred parts on a still day and I have one and a
half working lungs. I'd get eighty metres in and you'd be fetching me out.`),
      next: 't_gift',
    },
    t_calib: {
      ...line('teo', "I know you did. That's rather the point of you."),
      next: 't_gift',
    },
    t_worth: {
      ...line('teo', `Nothing. It's worth nothing to me, Vasko. I'm sixty-three and I sell
cartridges out of a dead arcade. It's worth something to a girl who is nineteen
and thinks her father drowned in his own kitchen for no reason at all.`),
      next: 't_gift',
    },
    t_gift: {
      ...line('teo', `Take this. It's the field manual — yours, actually, you left it in the hut.
There's an annexe in the back on reading a draw off a single head. You wrote it.
You'd forgotten you wrote it.`),
      effects: [
        { give: ['manual', 1] }, { cap: 'readAir' }, { flag: 'teo_met' },
        { quest: 'filters' },
        { journal: ['manual', 'Survey field manual', `My handwriting in the margins. Annexe C: estimating
draw direction from a single borehole. I was twenty-eight and I thought writing
procedure down was the same as making people follow it.`] },
      ],
      next: 't_end',
    },
    t_end: {
      ...line('teo', "Mind the Slip. And Vasko — go over it, not round it. Round it takes you through the low ground on Kell and Kell will have you."),
      next: 'end',
    },
    // Teo's re-entry used to branch on carrying the logbook, and nothing ever
    // removes the logbook, so from chapter two onwards he said one line for
    // the rest of the game and his shop became unreachable. It branches on
    // what he KNOWS now, and he has a state for every chapter after this one.
    again: {
      ...line('teo', "Vasko."),
      branch: [
        { if: { flag: 'ch4_done' }, goto: 'a_crisis' },
        { if: { all: [{ item: 'logbook' }, { notFlag: 'teo_log_done' }] }, goto: 'has_log' },
        { if: { flag: 'southmarrow_done' }, goto: 'a_south' },
        { if: {}, goto: 'a_shop' },
      ],
    },
    a_crisis: {
      ...line('teo', "I heard it on the yard radio. Two hours of it. I sat here and listened to it."),
      branch: [
        { if: { counter: ['crisis_lost', 1] }, goto: 'a_crisis_lost' },
        { if: {}, goto: 'a_crisis_all' },
      ],
    },
    a_crisis_all: {
      ...line('teo', `All four. On a night when the ground was doing nine hundred and you had one
cartridge.

I did that job for twenty-two years and I can count on one hand the shifts where
we came up with everybody. Don't let anyone tell you it was the obvious outcome.`),
      effects: [{ trust: ['teo', 8, 'He knows what that shift cost.'] }],
      next: 'a_shop',
    },
    a_crisis_lost: {
      ...line('teo', `You'll be going back over the two hundred seconds. Finding the twenty you
could have spent better.

I have gone back over the eleventh of July every night for eighteen months and I
will tell you exactly what it has been worth, which is nothing, and I will also
tell you that you are going to do it anyway. Come and buy cartridges.`, 'quiet'),
      next: 'a_shop',
    },
    a_south: {
      ...line('teo', `South Marrow. You went. Nobody goes.

There's a woman on Fenn who told me the terrace came down in ninety seconds and
that the noise was the part that stayed. I have never been able to decide
whether to believe the ninety seconds.`),
      next: 'a_shop',
    },
    a_shop: {
      ...line('teo', "Cartridges, dressings, cells. Salvage or nothing, and don't insult me."),
      choices: [
        { text: '[Trade]', goto: 'trade', effects: [{ fn: 'openTrade' }] },
        { text: "Can you do anything with this bar?", goto: 'a_bar', if: { noCap: 'breach' } },
        { text: "You said a name. Iris Nadel.", goto: 'a_iris', if: { flag: 'teo_named_iris' } },
        { text: "Bek. What was he like?", goto: 'a_bek', if: { flag: 'ren_asked_bek' } },
        { text: "Field 9. Half those heads are mine.", goto: 'a_field', if: { flag: 'ren_knows_field' } },
        { text: "Tell me about the Cinder Line.", goto: 'a_line' },
        { text: "Tell me about Sol.", goto: 'a_sol' },
        { text: "Nothing today.", goto: 'end' },
      ],
    },
    a_iris: {
      ...line('teo', `Nadel. Yes. She does the reduction — takes the raw numbers and turns them into
the line they print.

She came in here once, about a year ago, and bought four cartridges she plainly
did not need, and stood by the door for eleven minutes not asking me anything.
I have thought about those eleven minutes more than I would like.`),
      next: 'a_shop',
    },
    a_field: {
      ...line('teo', `You calibrated them and then you left, and the Authority stopped calibrating
them, and now nine boreholes in that field disagree with each other by up to
four hundred parts.

That is not an accusation. It is the reason your name is the only one that could
have read that log and known immediately which sheets were lying.`),
      effects: [{ trust: ['teo', 4, 'He said what she was for.'] }],
      next: 'a_shop',
    },
    a_bek: {
      ...line('teo', `Ilya? Careful. Wrote things down. Kept a rain gauge on his own roof for
sixteen years because he did not think the published one was sited properly,
and he was right, and it changed nothing.

He was not a brave man and he was not a clever man. He was a man who noticed and
then did the next thing, which is rarer than either.`),
      effects: [{ trust: ['teo', 4, 'He liked being asked.'] }],
      next: 'a_shop',
    },
    trade: { ...line('teo', "Mm."), next: 'end' },
    a_bar: {
      ...line('teo', `Give me the bar a minute.

...There. Ground back to a proper point and the heel dressed. Now it will go
behind a hoarding instead of skidding off it.

Half this city is boarded up with nothing behind the boards. The other half is
boarded up with everything somebody left behind.`),
      effects: [
        { cap: 'breach' }, { trust: ['teo', 5, 'He sharpened your bar.'] },
        { journal: ['breach', 'The bar', `Marsh reground the point. It goes behind a hoarding
now. Boarded shopfronts are worth opening — nobody came back for what is inside
them, which is exactly why it is still there.`] },
      ],
      next: 'a_shop',
    },
    a_line: {
      ...line('teo', `They repaint it every quarter. Same road, further west every time. There are
four lines on Cinder Road now and you can read them like rings on a stump.

The joke — and it is a joke, we do laugh — is that the line has never moved
because the fire moved. It moves because the survey moves.`),
      next: 'a_shop',
    },
    a_sol: {
      ...line('teo', `Ferrant keeps a hundred people alive on a generator and a rota. I have never
seen anybody work harder at anything.

I also know exactly what she's doing on the west side, and so will you, in about
a day, and then you'll have to decide what sort of person you are about it. I
have already decided. I sell her cartridges.`),
      next: 'a_shop',
    },
    has_log: {
      ...line('teo', "You've got it. I can see it in how you're standing. Bring it here.", 'quiet'),
      next: 'end',
    },
  },
};

C.teo_log = {
  id: 'teo_log', who: 'teo',
  nodes: {
    start: {
      ...line('teo', "Let me see it."),
      next: 'l2',
    },
    l2: {
      ...line('teo', `...Four hundred and six degrees at 9-3, week of the eleventh of July. And the
line they printed that quarter has Cellar Row two hundred metres clear.

They didn't get it wrong. You can't get four hundred degrees wrong.`),
      next: 'l3',
    },
    l3: {
      ...line('teo', "Now. What's it for?", 'quiet'),
      choices: [
        { text: "Publish it. All of it, with names.", goto: 'l_pub',
          effects: [{ choice: ['log_intent', 'publish'] }] },
        { text: "Use it. Make them cut the trench in the right place.", goto: 'l_use',
          effects: [{ choice: ['log_intent', 'use'] }] },
        { text: "I don't know yet.", goto: 'l_dunno',
          effects: [{ choice: ['log_intent', 'unknown'] }, { trust: ['teo', 4, 'An honest answer.'] }] },
      ],
    },
    l_pub: {
      ...line('teo', `Then be certain. Publishing voids the contract. Voiding the contract stops the
money. Stopping the money stops whatever it is Krajcik is actually doing with it,
and I have never been able to work out what that is, only that four hundred
households have quietly stopped being here.`),
      next: 'l_end',
    },
    l_use: {
      ...line('teo', `That's the harder road and it needs a surveyor inside. You had one, once.
Nadeau. She was your junior. She signs the lines now.`),
      effects: [{ flag: 'teo_named_iris' }],
      next: 'l_end',
    },
    l_dunno: {
      ...line('teo', `Good. Anyone who knew that fast would be lying.

You'll have to go and look at them, then. All of them. Nadeau in the field
office, and Krajcik, who will be very pleasant to you and will be right about
several things.`),
      effects: [{ flag: 'teo_named_iris' }],
      next: 'l_end',
    },
    l_end: {
      ...line('teo', `Go east. Field Office Two. And Vasko — whatever you decide, decide it before
you're standing in front of him. He is very good at being reasonable at people.`),
      effects: [{ flag: 'teo_log_done' }],
      next: 'end',
    },
  },
};

// ----------------------------------------------------------------- NESSA ---

C.nessa_first = {
  id: 'nessa_first', who: 'nessa',
  entry: [
    { if: { flag: 'nessa_told_truth' }, goto: 'after_truth' },
    { if: { flag: 'nessa_met' }, goto: 'again' },
    { if: {}, goto: 'start' },
  ],
  nodes: {
    start: {
      ...line('nessa', "You're the one who came in the west gate. Everyone's being weird about it."),
      next: 'n2',
    },
    n2: {
      ...line('nessa', `I'm Nessa. I do the filter runs, which means I'm the one who goes down into the
bad bits so nobody else has to, which sounds heroic until you find out it's
because I'm the smallest and the fastest and nobody else volunteered.`),
      choices: [
        { text: "How low do you go?", goto: 'n_low' },
        { text: "That's a bad job.", goto: 'n_bad' },
        { text: "Bek. Are you Ilya Bek's daughter?", goto: 'n_bek',
          effects: [{ flag: 'ren_asked_bek' }] },
      ],
    },
    n_low: {
      ...line('nessa', `Basements. Sometimes the culvert. There's a whole cache under the chapel that
nobody else can get to because the crawl's about this wide.

Sol says two minutes. I do four. Don't tell her.`),
      next: 'n_end',
    },
    n_bad: {
      ...line('nessa', "It's a job. Everyone's got one. Yours is apparently standing in the yard looking like you've been hit."),
      next: 'n_end',
    },
    n_bek: {
      ...line('nessa', "...Yeah.", 'guarded'),
      next: 'n_bek2',
    },
    n_bek2: {
      ...line('nessa', `Everyone does that. They find out and then they get this face, and then they
say something about how sorry they are, and then I have to be gracious about it
which is honestly the tiring part.

So — pre-emptively — it's fine, thank you, you don't have to.`),
      choices: [
        { text: "I wasn't going to say I was sorry.", goto: 'n_notsorry' },
        { text: "I knew your father a little. Through the Authority.", goto: 'n_knew',
          effects: [{ flag: 'nessa_knows_connection' }] },
        { text: "Understood.", goto: 'n_end' },
      ],
    },
    n_notsorry: {
      ...line('nessa', "Oh. What were you going to say?"),
      choices: [
        { text: "That he was right. About the ground.", goto: 'n_right',
          effects: [{ trust: ['nessa', 10, 'Someone finally said the useful thing.'] }] },
        { text: "Nothing. That's the honest answer.", goto: 'n_nothing' },
      ],
    },
    n_right: {
      ...line('nessa', "...", 'quiet'),
      next: 'n_right2',
    },
    n_right2: {
      ...line('nessa', `Nobody has ever said that to me. Nobody. Eighteen months and everyone in this
city has told me they're sorry and not one person has told me he was right.

Okay. Okay. I'm — yeah. Okay.`),
      effects: [{ flag: 'nessa_told_right' }],
      next: 'n_end',
    },
    n_nothing: {
      ...line('nessa', "Well. That's refreshing, in a bleak sort of way."),
      next: 'n_end',
    },
    n_knew: {
      ...line('nessa', `Through the Authority. Right.

He talked about them a lot at the end. Not angrily. He kept saying they'd fix it
once somebody looked at the numbers properly. He had a lot of faith in numbers.`),
      next: 'n_end',
    },
    n_end: {
      ...line('nessa', "Anyway. If you go into the low ground, take two cartridges, not one. Everybody takes one. Everybody's an idiot."),
      effects: [{ flag: 'nessa_met' }, { give: ['filter', 1] }],
      next: 'end',
    },
    again: {
      ...line('nessa', "Still upright. Good sign."),
      choices: [
        { text: "How's the run?", goto: 'a_run' },
        { text: "Nothing.", goto: 'end' },
      ],
    },
    a_run: {
      ...line('nessa', `Fenn Street's gone bad. Like properly bad, like it doubled in a fortnight.
Sol says it's the seam moving. Sol says a lot of things in the voice she uses
when she's decided not to discuss it.`),
      next: 'end',
    },
    after_truth: {
      ...line('nessa', "...", 'quiet'),
      branch: [
        { if: { flag: 'nessa_told_right' }, goto: 'at_told' },
        { if: { flag: 'nessa_read_log' }, goto: 'at_read' },
        { if: { flag: 'nessa_withheld' }, goto: 'at_withheld' },
        { if: {}, goto: 'at_other' },
      ],
    },
    at_read: {
      ...line('nessa', `I found it myself. On the page. Checked by R. Vasko, in a box, in somebody
else's handwriting.

You stood there and let me get to the bottom of the sheet. I have gone over that
about four hundred times and the part I keep landing on is that you knew exactly
which line I was going to reach and you let me reach it on my own.`, 'quiet'),
      next: 'at_read2',
    },
    at_read2: {
      ...line('nessa', `I'd still rather have the log than not have it. Both those things are true and
they don't cancel.`),
      next: 'end',
    },
    at_withheld: {
      ...line('nessa', `You said it wasn't ready.

I'm nineteen, I'm not stupid. Nobody has ever said a thing wasn't ready to me
about something that was ready.`, 'flat'),
      next: 'at_withheld2',
    },
    at_withheld2: {
      ...line('nessa', "Come back when it is. Or don't, and I'll get it off Ferrant, which is what I'm going to do anyway."),
      next: 'end',
    },
    at_told: {
      ...line('nessa', `I keep starting sentences and then not finishing them.

I'm not going to forgive you. I want to be clear about that, because I think
you're waiting for it and I'd rather you stopped.

But I'd rather know. I would always rather know.`),
      next: 'end',
    },
    at_other: {
      ...line('nessa', "I read it in the log. Your initials are on the July sheet."),
      branch: [
        { if: { flag: 'nessa_knows_connection' }, goto: 'at_conn' },
        { if: {}, goto: 'end' },
      ],
    },
    at_conn: {
      ...line('nessa', `And you knew Marsh. And Marsh knew Dad. Everybody in this story knew everybody,
which is what people say about a small town like it's charming.

It isn't charming. It means every single one of you had somebody to tell.`),
      next: 'end',
    },
  },
};

C.nessa_truth = {
  id: 'nessa_truth', who: 'nessa',
  nodes: {
    start: {
      ...line('nessa', "Sol says you've got the borehole log."),
      branch: [
        { if: { flag: 'has_log' }, goto: 'nt2' },
        { if: {}, goto: 'nt_notyet' },
      ],
    },
    nt_notyet: {
      ...line('nessa', "She was wrong, then. She's not usually wrong. Come and find me when she isn't."),
      next: 'end',
    },
    nt2: {
      ...line('nessa', `She says it proves they knew. Which — good. Fine. That's what everyone's
always said and now there's paper.

I want to read it.`),
      choices: [
        { text: "[Give her the log]", goto: 'nt_give',
          if: { item: 'logbook' },
          effects: [{ choice: ['nessa_truth', 'gave'] }, { flag: 'nessa_read_log' }] },
        { text: "Before you do — the July sheet has my initials on it.", goto: 'nt_tell',
          effects: [{ choice: ['nessa_truth', 'told'] }, { flag: 'nessa_told_truth' },
                    { bump: ['honest', 1] },
                    { trust: ['nessa', 14, QUIET] }] },
        { text: "It's not ready. Not yet.", goto: 'nt_withhold',
          effects: [{ choice: ['nessa_truth', 'withheld'] }, { trust: ['nessa', -12, QUIET] },
                    { flag: 'nessa_withheld' }, { bump: ['deflected', 1] }] },
      ],
    },
    nt_give: {
      ...line('nessa', "...", 'quiet'),
      next: 'nt_give2',
    },
    nt_give2: {
      ...line('nessa', `Week of the eleventh of July. Four hundred and six.

There's a signature block at the bottom of every sheet. Surveyed by. Checked by.

Checked by R. Vasko.`),
      effects: [{ flag: 'nessa_told_truth' }, { trust: ['nessa', -6, 'She found it herself.'] }],
      next: 'nt_after',
    },
    nt_tell: {
      ...line('nessa', "What?"),
      next: 'nt_tell2',
    },
    nt_tell2: {
      ...ren(`I checked the July sheet. I saw four hundred and six degrees at 9-3 and I saw
the line they were about to print, and I knew those two things could not both be
true.

I raised it with nobody. I had eleven months left on a contract and I told myself
somebody senior would catch it.

Four months later your father died in his kitchen.`),
      next: 'nt_tell3',
    },
    nt_tell3: {
      ...line('nessa', "...", 'quiet'),
      next: 'nt_after',
    },
    nt_withhold: {
      ...line('nessa', `Right. Sure.

You know what's funny? Everyone in this city has decided what I'm ready for.
Sol decides. Marsh decides. Now you.

I'm nineteen. I go into basements at four hundred parts so a hundred people can
breathe. I think I can read a temperature table.`),
      next: 'nt_end',
    },
    nt_after: {
      ...line('nessa', `Why are you telling me?

No — genuinely. Why now. Is it so I say something that makes it easier? Because
I'm not going to. I don't have that.`),
      choices: [
        { text: "Your father's shop on Fenn Street is still standing. There's a family in it.",
          goto: 'nt_shop', if: { flag: 'ostrowski_bek' } },
        { text: "I'm not telling you so you'll say anything. I'm telling you because it's yours.",
          goto: 'nt_yours', effects: [{ trust: ['nessa', 12, QUIET] }] },
        { text: "Because you'd have found it in the log tonight, and I wanted you to hear it from me.",
          goto: 'nt_hear' },
        { text: "I don't know. Maybe so I'd stop carrying it.", goto: 'nt_carry',
          effects: [{ trust: ['nessa', 4, 'At least it was true.'] }] },
      ],
    },
    nt_yours: {
      ...line('nessa', `...Yeah.

Yeah, all right.

Go and do something with it. That's the only thing that's any use to me now.
Don't stand there.`),
      next: 'nt_end',
    },
    nt_hear: {
      ...line('nessa', "That's a better reason than most people manage."),
      next: 'nt_end',
    },
    nt_carry: {
      ...line('nessa', `At least that's honest.

You don't get to put it down, though. That's not how it works. You just get to
carry it where people can see it.`),
      next: 'nt_end',
    },
    nt_shop: {
      ...line('nessa', `Fenn Street? Somebody's *in* it?

I have not been down Fenn since the funeral. I have gone the long way round to
avoid a road for eighteen months and told myself it was the air.`, 'quiet'),
      next: 'nt_shop2',
    },
    nt_shop2: {
      ...line('nessa', `Tell him — no. Don't tell him anything. I'll go.

That's the first thing anyone has given me that isn't paper.`),
      effects: [
        { trust: ['nessa', 10, 'You told her the shop was standing.'] },
        { flag: 'nessa_shop_told' },
      ],
      next: 'nt_end',
    },
    nt_end: {
      ...line('nessa', "They're cutting the trench tomorrow. Did you know that? Everyone's talking about it like it's weather."),
      effects: [{ flag: 'nessa_scene_done' }],
      next: 'end',
    },
  },
};

C.nessa_rescue = {
  id: 'nessa_rescue', who: 'nessa',
  nodes: {
    start: {
      ...line('nessa', "*coughing* — oh. Oh, thank God, an adult.", 'weak'),
      next: 'r2',
    },
    r2: {
      ...line('nessa', `Cartridge went. Not saturated — *went*. Seal split. I've been doing four
minutes on a two minute cartridge for six months and today it decided.`),
      choices: [
        { text: "[Give her a filter]", goto: 'r_filter', if: { item: 'filter' },
          effects: [{ take: ['filter', 1] }, { trust: ['nessa', 10, 'She gave up her own cartridge.'] }] },
        { text: "Can you walk?", goto: 'r_walk' },
      ],
    },
    r_filter: {
      ...line('nessa', "...That's your last one, isn't it. I can hear it in how you said nothing."),
      next: 'r_out',
    },
    r_walk: {
      ...line('nessa', "I can walk. I can't climb. Which is a problem, because down here the only way out is up."),
      next: 'r_out',
    },
    r_out: {
      ...line('nessa', "Get me to the second floor and I'll be fine. Everyone's always fine on the second floor."),
      effects: [{ flag: 'nessa_rescue_started' }],
      next: 'end',
    },
  },
};

// ------------------------------------------------------------------ IRIS ---

C.iris_first = {
  id: 'iris_first', who: 'iris',
  entry: [
    { if: { flag: 'iris_met' }, goto: 'again' },
    { if: {}, goto: 'start' },
  ],
  nodes: {
    start: {
      ...line('iris', "You can't be — you're not supposed to be past the barrier, this is a restricted —"),
      next: 'i2',
    },
    i2: {
      ...line('iris', "...Ren.", 'shaken'),
      next: 'i3',
    },
    i3: {
      ...line('iris', `Sorry. Sorry, that was — hello. Hello.

You look well. That's a stupid thing to say. Nobody looks well here, the
particulate does something to everyone's skin.`),
      choices: [
        { text: "Hello, Iris.", goto: 'i_hello' },
        { text: "You're signing the lines now.", goto: 'i_lines' },
        { text: "I need to get into the office.", goto: 'i_office' },
      ],
    },
    i_hello: {
      ...line('iris', "You're the first person to say my name in eleven weeks who wasn't reading it off a form."),
      next: 'i_lines',
    },
    i_office: {
      ...line('iris', "You can't. I mean — you can't. Not without a pass, and I can't just —"),
      next: 'i_lines',
    },
    i_lines: {
      ...line('iris', `Yes. Survey Engineer Two. I got your job, technically. Nobody says that but
it's technically true.`),
      next: 'i_lines2',
    },
    i_lines2: {
      ...line('iris', `I do the field work and the reduction and I put the line where the reduction
puts it, and then the reduction goes upstairs and the line that comes back down
is not always the line I sent up.

I have a folder. Of the differences. I don't know why I keep it. It isn't
evidence of anything except that I noticed.`),
      choices: [
        { text: "How long?", goto: 'i_long' },
        { text: "Then say something.", goto: 'i_say',
          effects: [{ trust: ['iris', -8, 'She has heard that from someone who did not.'] }] },
        { text: "I kept one too. For eleven months.", goto: 'i_same',
          effects: [{ flag: 'iris_shared' }, { bump: ['honest', 1] },
                    { trust: ['iris', 16, QUIET] }] },
      ],
    },
    i_long: {
      ...line('iris', "Two years and ten months. Since before you were hired."),
      next: 'i_pass_q',
    },
    i_say: {
      ...line('iris', `Say something.

You were here. You were *here*, Ren. You had the July sheet in your hands and
you checked it and you signed the check box and you went home.

I'm not — I'm not saying that to be cruel. I'm saying it because when you left,
I decided that if you couldn't do it then it probably couldn't be done.

That's what you left me with.`),
      effects: [{ flag: 'iris_accused' }],
      next: 'i_pass_q',
    },
    i_same: {
      ...line('iris', "...", 'quiet'),
      next: 'i_same2',
    },
    i_same2: {
      ...line('iris', `Eleven months and then you went. And I thought — she couldn't. So I can't.

I have spent eighteen months being reasonable at myself in your voice.`),
      next: 'i_pass_q',
    },
    i_pass_q: {
      ...line('iris', "Why are you here? Actually here."),
      choices: [
        { text: "I have the raw borehole log.", goto: 'i_log', if: { item: 'logbook' },
          effects: [{ flag: 'iris_knows_log' }] },
        { text: "There's an order for a full trench cut. Signed and never issued. I want it.",
          goto: 'i_order' },
        { text: "To finish what I should have done.", goto: 'i_finish' },
      ],
    },
    i_log: {
      ...line('iris', "You went into Field 9. On foot. With a cartridge."),
      next: 'i_log2',
    },
    i_log2: {
      ...line('iris', "God, that's the most Ren thing I've ever heard."),
      next: 'i_decide',
    },
    i_order: {
      ...line('iris', `You know about the cut order.

It's in the second drawer in his office and it has been for fourteen months and
every single person in this building knows it's there.`),
      next: 'i_decide',
    },
    i_finish: {
      ...line('iris', "That's not an answer, that's a feeling with a coat on."),
      next: 'i_decide',
    },
    i_decide: {
      ...line('iris', "I could give you my pass.", 'quiet'),
      branch: [
        { if: { trust: ['iris', 12] }, goto: 'i_gives' },
        { if: {}, goto: 'i_refuses' },
      ],
    },
    i_gives: {
      ...line('iris', `Take it. It's mine, I'm not stealing it, it's — take it.

If they ask I'll say I lost it and they'll believe me because I lose everything,
it's the one useful thing about being me.`),
      effects: [
        { give: ['keySurvey', 1] }, { flag: 'iris_gave_pass' },
        { trust: ['iris', 8, 'She committed to something.'] },
        { journal: ['iris', 'Iris Nadeau', `She kept a folder of the differences for two years and
one month. She thought that if I couldn't say it, it couldn't be said. I have
been an argument in someone else's head this whole time and I did not know it.`] },
      ],
      next: 'i_end',
    },
    i_refuses: {
      ...line('iris', `...I could. I'm not going to.

I have eleven months on this contract and a mother in a place that costs four
hundred a month and I am not — I can't be the one who —

There's a service door on the north elevation. The hasp is rusted through. I'm
not telling you that. I'm saying it out loud in a yard.`),
      effects: [{ flag: 'iris_hinted_door' }],
      next: 'i_end',
    },
    i_end: {
      ...line('iris', `He'll be in there. He's always in there. He'll be very nice to you.

...One more thing. The ash crews out at the field — the big ones with the
hammers. They plant the back foot before they swing. Every time, about half a
second early. I have watched them from that window for two years and I have
never seen one not do it.`),
      effects: [
        { flag: 'iris_met' }, { cap: 'coldRead' },
        { journal: ['coldread', 'The back foot', `Iris has been watching the crews from a window
for two years. The heavy ones plant the back foot half a second before they
swing. She said it like it was small talk.`] },
      ],
      next: 'end',
    },
    again: {
      ...line('iris', "You should go before someone logs you."),
      branch: [
        { if: { flag: 'iris_gave_pass' }, goto: 'a_gave' },
        { if: {}, goto: 'a_nogave' },
      ],
    },
    a_gave: { ...line('iris', "I keep expecting to feel worse about the pass. I keep not."), next: 'end' },
    a_nogave: { ...line('iris', "North elevation. Rusted hasp. I did not say that."), next: 'end' },
  },
};

// --------------------------------------------------------------- KRAJCIK ---

/**
 * Iris after the office. She gates an ending and she used to have exactly one
 * repeat line, which meant the character who signs the reduction vanished from
 * the game the moment she stopped being a door key.
 */
C.iris_after = {
  id: 'iris_after', who: 'iris',
  nodes: {
    start: {
      ...line('iris', "You came back."),
      branch: [
        { if: { flag: 'iris_accused' }, goto: 'i_accused' },
        { if: { flag: 'iris_shared' }, goto: 'i_shared' },
        { if: {}, goto: 'i_flat' },
      ],
    },
    i_accused: {
      ...line('iris', `You told me I was a coward. In this room. With the door open.

I have run that back rather a lot and the annoying part is that I cannot find
the bit where you were wrong.`, 'quiet'),
      next: 'i_hub',
    },
    i_shared: {
      ...line('iris', `You said you did the same thing. Eighteen months ago, one quarter, one check
box.

Nobody has ever handed me that. Everybody in this building is very careful never
to be in the wrong at the same time as anybody else.`),
      effects: [{ trust: ['iris', 6, 'She has not stopped thinking about it.'] }],
      next: 'i_hub',
    },
    i_flat: {
      ...line('iris', "Q4 is due on the fourteenth. I am doing the reduction. That is all I do."),
      next: 'i_hub',
    },
    i_hub: {
      ...line('iris', "Was there something?"),
      choices: [
        { text: "You know what's in the log now. What are you going to do?",
          goto: 'i_log', if: { flag: 'iris_knows_log' } },
        { text: "The north door. It was open.", goto: 'i_door', if: { flag: 'iris_hinted_door' } },
        { text: "Eleven quarters. All in metres, none in words.", goto: 'i_folder',
          if: { flag: 'read_folder' } },
        { text: "If it came to signing something true, would you?", goto: 'i_sign' },
        { text: "Nothing. Not yet.", goto: 'end' },
      ],
    },
    i_log: {
      ...line('iris', `Nothing. That is the honest answer and I would like credit for how quickly I
gave it.

I have a mother in Kell and a job and a folder of every quarter where the line
and the numbers disagree, and the folder is the only one of those three things
that is any use to anybody, and I have never shown it to a single person.`),
      effects: [{ trust: ['iris', 4, 'She said the true small thing.'] }],
      next: 'i_hub',
    },
    i_door: {
      ...line('iris', `The hasp on the north elevation. Yes.

I did not unlock it for you. I told you where a rusted thing was and then I went
and stood at a window. If anyone asks, that is the version, and it is also
exactly what happened, which is the part I find hardest.`),
      effects: [{ trust: ['iris', 3, 'She chose her words and kept them.'] }],
      next: 'i_hub',
    },
    i_folder: {
      ...line('iris', `You opened it.

Of course you opened it, it is on a desk in a room I let you into. I have had
eleven quarters to put it somewhere else and I have not, and I would like you to
understand that I know exactly what that means and I have still not moved it.`, 'quiet'),
      next: 'i_folder2',
    },
    i_folder2: {
      ...line('iris', `Metres, not words. If I write a sentence it is a position and I have to defend
it. If I write sixty, it is a measurement, and a measurement is only a fact.

I have been hiding behind the units for two years and ten months.`),
      effects: [{ trust: ['iris', 10, QUIET] }, { flag: 'iris_folder_named' }],
      next: 'i_hub',
    },
    i_sign: {
      ...line('iris', `Ask me somewhere it costs something. Not here, where the answer is free.

If you are ever standing in front of people with a true line and no name on it,
find me. Do not write to me. Find me.`),
      next: 'end',
    },
  },
};

C.krajcik = {
  id: 'krajcik', who: 'krajcik',
  nodes: {
    start: {
      ...line('krajcik', "Miss Vasko. Sit down if you like. There's a chair, it's the only one, it's not comfortable."),
      next: 'k2',
    },
    k2: {
      ...line('krajcik', `You have the July log. You have the cut order. I'd rather we skipped the part
where I pretend otherwise, because it's undignified and we're both tired.`),
      choices: [
        { text: "You knew Cellar Row was inside the burn.", goto: 'k_knew' },
        { text: "You signed a trench order and buried it.", goto: 'k_order' },
        { text: "I'm not here to arrest you. I want to understand it.", goto: 'k_understand',
          effects: [{ trust: ['krajcik', 8, 'She came to listen.'] }] },
      ],
    },
    k_knew: {
      ...line('krajcik', `Yes.

Would you like me to say it more slowly? Yes. Cellar Row was inside the burn.
The published line was wrong. Nine people died because of a document I am
responsible for.`),
      next: 'k_ledger',
    },
    k_order: {
      ...line('krajcik', `I signed it. I costed it. Nine point four million and eleven months of
excavation, and it would have worked — it would still work, incidentally, if it
were cut on your line rather than mine.

I did not issue it, because the moment I issue it I am admitting the line was
wrong, and clause fourteen of this contract voids on a material admission.`),
      next: 'k_ledger',
    },
    k_understand: {
      ...line('krajcik', "Thank you. That is genuinely rare."),
      next: 'k_ledger',
    },
    k_ledger: {
      // He does not brief her. He slides a box file across and lets her read
      // it, the way the published-line board works: the object proves it and
      // the man says four sentences.
      ...line('krajcik', "Second drawer. It is not locked. It has never needed to be."),
      next: 'k_ledger_read',
    },
    k_ledger_read: {
      ...ren(`A removals ledger. Handwritten, one line per household, ruled by somebody who
rules lines for a living.

Three hundred and forty entries. Deposit, removal, twelve months' rent, and a
column headed SCHEME that is empty the whole way down.`),
      choices: [
        { text: "There's no scheme.", goto: 'k_ledger2' },
        { text: "Where does the money come from?", goto: 'k_ledger2' },
      ],
    },
    k_ledger2: {
      ...line('krajcik', `The margin. On a contract to manage a fire that cannot be managed.

That is the whole trick and you have just found it in about nine seconds.`),
      next: 'k_ledger3',
    },
    k_ledger3: {
      ...line('krajcik', `I am not asking you to think I am a good man. I'm asking you to do the
determination I am required to make every quarter and make every morning
anyway.

If you publish, the contract voids inside a fortnight. The Authority withdraws.
The relocation stops. Four hundred and six people are still in Hollis and there
is no longer anybody in the world whose job it is to move them.`),
      choices: [
        { text: "Then issue the cut order and take the consequences.", goto: 'k_cut' },
        { text: "You don't get to make that choice for them.", goto: 'k_choice' },
        { text: "What do you want from me?", goto: 'k_offer' },
        { text: "How many did you move after you knew?", goto: 'k_after' },
      ],
    },
    k_cut: {
      ...line('krajcik', `And on the day the excavator breaks ground on a line that is not the published
line, every solicitor within two hundred miles will ask why.

I have thought about it every day for fourteen months. I have not found the
version where it works.`),
      next: 'k_offer',
    },
    k_choice: {
      ...line('krajcik', `No. I don't.

No such right has ever been claimed, by me or in my name. What has been
claimed — clause eleven, if you would like to read it — is that a determination
must be made quarterly by a named officer, and that in the absence of one being
made badly, none is made at all.

If you have a better mechanism than one flawed man with a budget, I would like
to hear it. I have been waiting years.`),
      next: 'k_offer',
    },
    k_after: {
      ...line('krajcik', `Two hundred and ninety-one.

Yes. I want you to hear the shape of that. Forty-nine before Cellar Row. Two
hundred and ninety-one after.

It is recorded, in a file, as an operational efficiency. I have not been able
to arrive at a better description and I have stopped trying to.`),
      effects: [{ flag: 'krajcik_291' }],
      next: 'k_offer',
    },
    k_offer: {
      ...line('krajcik', "Here is what I can offer you, and I want you to notice that it is not a bribe."),
      next: 'k_offer2',
    },
    k_offer2: {
      ...line('krajcik', `Come back. Survey Engineer One, my authority, your line. You redraw the
boundary honestly, quarter by quarter, and I move the households on the inside
of it first. Nobody is told. The contract survives. The money keeps moving.

You would be lying, continuously, for years, and you would be saving roughly
thirty households a quarter while you did it.`),
      choices: [
        { text: "No. It goes on the record.", goto: 'k_refuse',
          effects: [{ choice: ['krajcik_offer', 'refused'] }, { trust: ['krajcik', -10, 'She would not take it.'] }] },
        { text: "I'll take it.", goto: 'k_accept',
          effects: [{ choice: ['krajcik_offer', 'accepted'] }, { flag: 'took_offer' },
                    { trust: ['krajcik', 20, 'She read the clause and did not flinch.'] }] },
        { text: "I'll take it. [Lie]", goto: 'k_lie',
          effects: [{ choice: ['krajcik_offer', 'lied'] }, { flag: 'lied_to_krajcik' },
                    { trust: ['krajcik', 14, 'He believes her.'] }] },
        { text: "Issue the cut order and I'll put it on the right line for you.",
          goto: 'k_deal_cut', if: { flag: 'has_order' },
          effects: [{ choice: ['krajcik_offer', 'cut'] }, { flag: 'proposed_cut' }] },
      ],
    },
    k_refuse: {
      ...line('krajcik', `I thought so. I would have been disappointed if you hadn't, which is an
absurd thing for me to feel and I feel it anyway.

The trench crews start on the published line at first light. I can't stop that
now; it's three contracts deep. I'd stay out of the Cut.`),
      next: 'k_end',
    },
    k_accept: {
      ...line('krajcik', `...Right.

I'd like to say I'm pleased. I find I'm not, particularly. I think I wanted one
person to look at it and say no.

Report Monday. There's a desk.`),
      next: 'k_end',
    },
    k_lie: {
      ...line('krajcik', "Good. Good. Report Monday, there's a desk. I'll have the Q4 sheets sent over."),
      next: 'k_end',
    },
    k_deal_cut: {
      ...line('krajcik', `On the true line. Openly.

Do you know what that costs? Not the nine million. The admission. It ends me
professionally inside a month and it probably ends the relocations with me.

...Ask me again when the excavators are running. Ask me in front of them, where
I can't be quiet about it.`),
      effects: [{ flag: 'krajcik_open' }],
      next: 'k_end',
    },
    k_end: {
      ...line('krajcik', `One more thing, and then I'll let you go.

The nine at Cellar Row. I have their names on a card in my wallet. I don't show
people; it's not for that. I just wanted you to know it's there, because I think
you're about to decide that I don't carry it.

I carry it. I simply carry it and keep working. So do you.`),
      effects: [{ flag: 'krajcik_met' }],
      next: 'end',
    },
  },
};

// --------------------------------------------------------------- INCIDENTAL

C.garage = {
  id: 'garage', who: 'garage',
  entry: [
    { if: { flag: 'met_garage' }, goto: 'again' },
    { if: {}, goto: 'start' },
  ],
  nodes: {
    again: {
      ...line('ostrowski', "It's you. Nobody's been down since you."),
      branch: [
        { if: { flag: 'garage_suspects' }, goto: 'g_again_knows' },
        { if: {}, goto: 'g_again_sign' },
      ],
    },
    g_again_knows: {
      ...line('ostrowski', `I asked around about the Stacks. I wish I hadn't.

Ferrant's got a hundred and six up there and I've got four down here, and I have
done that sum every night for a fortnight and I get her answer every single time,
and I still can't breathe.`, 'quiet'),
      next: 'g_again_sign',
    },
    g_again_sign: {
      ...line('ostrowski', "You keep looking at the sign."),
      branch: [
        { if: { flag: 'nessa_met' }, goto: 'g_sign_nessa' },
        { if: {}, goto: 'g_sign_plain' },
      ],
    },
    g_sign_plain: {
      ...line('ostrowski', `Bek & Daughter. Weren't mine. Man had it before the evacuation and I never met
him. The sign was good ironwork and it seemed rude to take it down.`),
      next: 'g_end',
    },
    g_sign_nessa: {
      ...line('ostrowski', `Bek & Daughter. Ilya Bek. He was on the memorial board.

The daughter's still about, they say. I've been meaning to send word that the
place is standing and there's somebody in it keeping the damp out, and every time
I sit down to it I can't think of a way of saying that isn't 'I live in your
house now'.`, 'quiet'),
      effects: [
        { flag: 'ostrowski_bek' },
        { journal: ['bekshop', 'Bek & Daughter', `The garage on Fenn Street is Ilya Bek's shop. His
name is on the ironwork over the door and there is a man inside it who has been
trying for a year to work out how to write to Nessa about it.

I have walked past that sign four times.`] },
      ],
      next: 'g_end',
    },
    start: {
      ...line('ostrowski', "Don't come closer. I've got a bar and I will use it badly."),
      next: 'g2',
    },
    g2: {
      ...line('ostrowski', `...You're not a crew. Crews don't knock.

There's four of us. My wife's on the first floor, she doesn't come down any more.
The two kids sleep up there too.`),
      choices: [
        { text: "Your air down here is at eleven hundred. Why are you still on the ground floor?",
          goto: 'g_air' },
        { text: "Do you know why it's got worse?", goto: 'g_why' },
        { text: "[Give a filter]", goto: 'g_filter', if: { item: 'filter' },
          effects: [{ take: ['filter', 1] }, { flag: 'gave_garage_filter' },
                    { trust: ['nessa', 4, 'Word travels.'] }] },
      ],
    },
    g_air: {
      ...line('ostrowski', `Because the workshop's down here and the workshop is how we eat. I do two hours
and I go up. I know what I'm doing. I've lived on this street forty years.`),
      next: 'g_end',
    },
    g_why: {
      ...line('ostrowski', `It changed in the spring. Overnight, near enough. One week it was breathable
and the next it wasn't.

Somebody said the Stacks did something. I don't know. I don't want to know,
because if it's true then I have to have an opinion about people who are also
just trying to get through it.`),
      effects: [{ flag: 'garage_suspects' }],
      next: 'g_end',
    },
    g_filter: {
      ...line('ostrowski', "...I'm not going to make a thing of it. Thank you."),
      next: 'g_end',
    },
    g_end: {
      ...line('ostrowski', "If you're going west, tell whoever's up there that there's four of us. That's all. Just the number."),
      effects: [{ flag: 'met_garage' }],
      next: 'end',
    },
  },
};

C.vent_decision = {
  id: 'vent_decision', who: 'system',
  nodes: {
    start: {
      ...ren(`Three heads, cracked and wedged. Two turns each with the bar and the draw
reverses.

Fenn Street comes down to about three hundred. The Stacks courtyard goes up to
about nine.`),
      choices: [
        { text: "[Shut the vents] Fenn Street can't go upstairs forever.",
          goto: 'v_shut',
          effects: [
            { choice: ['vents', 'shut'] }, { flag: 'vents_shut' },
            { fn: 'shutVents' },
            { trust: ['sol', -18, QUIET] },
            { journal: ['vents_shut', 'I shut the heads', `Two turns each. The draw reversed inside a
minute — I could hear it change. Fenn Street will be breathable by morning.

The Stacks courtyard will not.`] },
          ] },
        { text: "[Leave them] A hundred and six against eleven.",
          goto: 'v_leave',
          effects: [
            { choice: ['vents', 'left'] }, { flag: 'vents_left' },
            { trust: ['sol', 10, QUIET] },
            { journal: ['vents_left', 'I left the heads', `A hundred and six against eleven. I did the
sum the way Sol does it and I got the same answer she did, and then I stood there
for a long time not walking away.`] },
          ] },
        { text: "[Half-measure] Shut one. Split the difference.",
          goto: 'v_half',
          effects: [
            { choice: ['vents', 'half'] }, { flag: 'vents_half' },
            { fn: 'halfVents' },
            { trust: ['sol', -4, 'A compromise nobody asked for.'] },
            { journal: ['vents_half', 'I shut one', `One head. Fenn Street comes down to about seven
hundred, which is survivable if you are careful and lethal if you are not. The
courtyard goes to about five hundred, which is the same sentence.

I have made both places slightly worse than one of them could have been. I know
exactly what that is. I did it anyway.`] },
          ] },
      ],
    },
    v_shut: { ...ren("Done. Two turns each."), next: 'end' },
    v_leave: { ...ren("I left them."), next: 'end' },
    v_half: { ...ren("One head. The middle one."), next: 'end' },
  },
};

// ------------------------------------------------------------------ FINAL ---

C.final = {
  id: 'final', who: 'krajcik',
  nodes: {
    start: {
      ...ren(`The excavators are idling on the published line. Krajcik is standing on the
spoil heap with a clipboard he is not reading. Forty people are watching from the
far side, because it is the largest thing that has happened in Hollis in a year.

I am carrying the log, the order, and the July sheet with my initials in the
check box.`),
      next: 'k_sees',
    },
    k_sees: {
      ...line('krajcik', "Miss Vasko. You are standing where the spoil goes."),
      branch: [
        { if: { notFlag: 'krajcik_met' }, goto: 'k_stranger' },
        { if: { flag: 'entered_unlogged' }, goto: 'k_unlogged' },
        { if: { flag: 'took_offer' }, goto: 'k_renege' },
        { if: { flag: 'lied_to_krajcik' }, goto: 'k_lied' },
        { if: { flag: 'krajcik_open' }, goto: 'k_asked' },
        { if: {}, goto: 'k_plain' },
      ],
    },
    k_unlogged: {
      ...line('krajcik', `There is no entry against your name for the fourteenth. I looked, because I am
the sort of man who looks.

You came in off the north elevation, which means somebody told you the hasp was
gone, which means somebody in my office decided you should be in it. I have not
asked who and I am not going to.`, 'quiet'),
      next: 'choose',
    },
    k_stranger: {
      // She never went to the office. He does not know her, and the scene is
      // colder and smaller for it — which is the cost of having skipped him.
      ...line('krajcik', `I don't know you. You are not on the schedule and you are not one of Ferrant's,
because Ferrant's people shout.

Whatever this is, be quick. The cut starts at the marker in nine minutes and I
am not able to stop it for a conversation.`, 'flat'),
      next: 'choose',
    },
    k_renege: {
      ...line('krajcik', `You told me you would start on the Monday. It is a Thursday and you are on my
spoil heap with a folder.

I am not going to pretend to be surprised. I have hired eleven people in this
job and four of them were standing where you are inside a year.`),
      next: 'choose',
    },
    k_lied: {
      ...line('krajcik', `You told me you would take it. You were lying, and you were quite bad at it,
and I let it go because a man in my position takes what agreement he can get.

Say the true thing now. You have an audience for it.`),
      next: 'choose',
    },
    k_asked: {
      // The payoff for k_deal_cut: he told her to ask him in front of them.
      ...line('krajcik', `You said you would put it on the right line for me. I said ask me again when
the excavators are running.

They are running. I am not going to help you say it.`, 'quiet'),
      branch: [
        { if: { flag: 'proposed_cut' }, goto: 'k_asked2' },
        { if: {}, goto: 'choose' },
      ],
    },
    k_asked2: {
      ...line('krajcik', `It was your idea, incidentally. I want that on whatever record you are about to
make. I have spent four years being the only person in a building who would say
the word and it took an outsider with a folder about nine seconds.`),
      next: 'choose',
    },
    k_plain: {
      ...line('krajcik', "Whatever it is, say it where they can hear you or don't say it at all. I have a schedule."),
      branch: [
        { if: { flag: 'krajcik_291' }, goto: 'k_291' },
        { if: {}, goto: 'choose' },
      ],
    },
    k_291: {
      ...line('krajcik', `Two hundred and ninety-one. That is the number I gave you in the office and I
have not been able to put it down since.

I would like you to understand that I am not asking you to spare me. I am asking
you to be at least as precise as I have been.`, 'quiet'),
      next: 'choose',
    },

    choose: {
      ...ren("Forty people. A man on a heap of spoil. Every true sentence I have and about nine seconds to pick one."),
      choices: [
        { text: 'Put it on the record. All of it, including me.', tag: 'record',
          goto: 'e_publish', effects: [{ choice: ['final', 'publish'] }] },

        { text: 'Make him cut it on the true line, openly.', tag: 'the cut',
          if: { flag: 'krajcik_open' }, showLocked: true,
          why: 'He told you to ask him in front of them. You never asked.',
          goto: 'e_cut', effects: [{ choice: ['final', 'cut'] }] },

        { text: 'Take the desk. Draw the line honestly and tell nobody.', tag: 'the deal',
          goto: 'e_deal', effects: [{ choice: ['final', 'deal'] }] },

        { text: "Burn it. Use their own lorries and empty Hollis.", tag: 'everybody out',
          if: { all: [{ flag: 'sol_debrief' }, { trust: ['sol', 16] }] }, showLocked: true,
          why: 'Sol would have to run it with you, and you have not stood in front of her since the water came up.',
          goto: 'e_evac', effects: [{ choice: ['final', 'evacuate'] }] },

        { text: 'Walk away. Take it with me.', tag: 'leave',
          goto: 'e_leave', effects: [{ choice: ['final', 'leave'] }] },
      ],
    },

    e_publish: {
      ...ren('I walk to the far side, where the forty people are, and I start with my own name.'),
      next: 'end',
    },

    // The cut needs a surveyor willing to sign the reduction. Iris is the one
    // who should; if she would not, Ren can only do it by taking the desk she
    // swore she would not take. Same ending, different cost, and the game
    // knows which one the player earned.
    e_cut: {
      ...ren("I say it out loud, to him, in front of forty people: cut it where the numbers are. Then somebody has to sign the reduction."),
      branch: [
        { if: { trust: ['iris', 10] }, goto: 'e_cut_iris' },
        { if: {}, goto: 'e_cut_self' },
      ],
    },
    e_cut_iris: {
      ...line('iris', `I'll sign it.

I have eleven months of unsigned ones in a drawer and I would quite like to stop
carrying them.`, 'quiet'),
      effects: [{ flag: 'iris_signed' }, { trust: ['iris', 8, 'She signed it.'] }],
      next: 'end',
    },
    e_cut_self: {
      ...ren(`Nadel will not put her name on it. She is standing at the back with her hands
in her sleeves and she will not look at me, and she is entirely within her
rights.

So it has to be me, which means taking the desk to have a hand that can sign,
which means the exact thing I told Sol I would never do — in public, out loud,
for the right reason. Krajcik hands me the pen without a word.`),
      effects: [{ flag: 'signed_it_myself' }],
      next: 'end',
    },

    e_deal: { ...ren('I put the log back in my coat and tell him I will start Monday.'), next: 'end' },
    e_evac: { ...ren('I find Sol at the barrier and tell her what I want to do. She does not ask me twice.'), next: 'end' },
    e_leave: { ...ren('I turn round. Nobody stops me. Nobody ever does.'), next: 'end' },
  },
};

export const CONVERSATIONS = C;

// ================================================================== ENDINGS ==

/**
 * Endings.
 *
 * The final scene records an *intention*. What that intention costs, what it
 * is worth, and who it lands on are decided here, out of everything the player
 * has already done — which is why every ending carries `beats`: conditional
 * paragraphs woven into the body itself, not appended as a footnote. Two
 * players who both publish do not read the same ending.
 *
 * The conditions below are deliberately mutually exclusive on `final`. An
 * earlier version resolved `westward` on the chapter-3 offer as well, which
 * meant a player who took Krajcik's desk and then renounced it at the trench
 * was told they had taken the desk. Reneging is a real dramatic beat and it is
 * written as one now (see `renege` in each ending) rather than being silently
 * resolved by array ordering.
 */
export const ENDINGS = [
  {
    id: 'record',
    title: 'ON THE RECORD',
    condition: { all: [{ chose: ['final', 'publish'] }] },
    text: `You put it on the record. All of it — the log, the order, the July sheet with
your own initials in the check box.

The contract voided in eleven days. The Authority withdrew its plant on a
Tuesday, and the trench, which was never going to work where they were cutting
it, stopped at a hundred and forty metres and is still there.

Hollis burned faster after that. Everybody knew why. It turns out that matters
more than people say it does, and less than you hoped.

You were charged as a party to it. Nine counts. The hearing took four days and
your evidence took two of them, and at no point in it did you say that you had
been young, or tired, or under contract.

Nessa came. She sat at the back with her arms folded and she did not look at you
and she came every single day.`,
    beats: [
      { condition: { chose: ['krajcik_offer', 'accepted'] },
        text: `You had told him you would take the desk. He did not remind you of that, then
or ever, and the not-reminding was the worst thing he could have done.` },
      { condition: { chose: ['krajcik_offer', 'lied'] },
        text: `You had told him you would take the desk, and you had been lying when you said
it, and you have never worked out whether that makes it better. He knew. He said
so afterwards, in the corridor, without any particular feeling: *you were quite
bad at it.*` },
      { condition: { chose: ['log_intent', 'unknown'] },
        text: `Marsh had asked you in the Arcade what the log was for and you had told him you
did not know. You have thought about that a great deal since. It was the only
honest thing you said that week and it took you four more months to catch up
with it.` },
      { condition: { all: [{ counter: ['crisis_lost', 1] }] },
        text: `Two of the names you read out were people you had carried as far as a stairwell
in a filling street four days earlier, and not far enough.` },
      { condition: { flag: 'vents_shut' },
        text: `The Stacks courtyard is in the record too. You put it there yourself: the date,
the three heads, the bar, the wedge, and the name of the person who turned
them. Sol did not attend. She sent a note through Marsh that said only *right*,
and it is the shortest and least kind letter anyone has ever sent you.` },
      { condition: { flag: 'trench_slipped' },
        text: `You did not touch any of them getting in. Two of the three gave evidence and
neither could say how you had got past the line, and the transcript records both
of them saying, separately, that they had not been looking.` },
      { condition: { flag: 'trench_fought' },
        text: `You put two Authority men and a scavenger on the ground getting in. That was
in the record too. Your counsel wanted it framed as necessity and you would not
let her, because it was not necessity, it was nine minutes and a temper.` },
      { condition: { counter: ['honest', 3] },
        text: `You had already said it out loud, by then, to nearly everyone it belonged to.
The hearing was not the hard part. The hearing was the last part.` },
      { condition: { counter: ['deflected', 3] },
        text: `You had not said it out loud to a single person in Hollis. You said it first to
a stenographer, under oath, into a microphone, and every one of them found out
the same way a stranger would have.` },
    ],
    epilogue: {
      told: `She wrote to you afterwards. One line: *You didn't make me find out on my own.
That's the whole letter.*`,
      untold: `She has not written. You did not expect her to. She found out from a signature
block, in a room, on her own, and there is no version of the record that fixes
that.`,
    },
  },
  {
    id: 'cut',
    title: 'THE CUT',
    condition: { all: [{ chose: ['final', 'cut'] }] },
    text: `Krajcik issued it standing on the spoil heap with the excavators idling and
forty people watching, and his voice did not change once.

The trench went in on your line. Nine point four million, eleven months, and a
firebreak sixty metres wide between the burn and everything west of Kell.

It held. Not all of it — the Cut and the vent field are gone, and South Marrow
went in the second winter — but the Stacks are still standing and there are
still a hundred and something people in them.

The line is honest now. It is honest because you draw it, every quarter, in the
same building, under the same man, and neither of you has ever raised what that
costs the other.

Iris does the reduction. She still keeps her folder. There is nothing in it any
more, and she keeps it anyway.`,
    beats: [
      { condition: { flag: 'krajcik_open' },
        text: `He had told you to ask him in front of them, where he could not be quiet about
it. You did. He looked at you for about two seconds longer than a man reads a
document, and then he read it out.` },
      { condition: { flag: 'iris_folder_named' },
        text: `You had told her, in her own office, that eleven quarters of measurements with
no sentences in them was a place to hide. She did not argue. She asked you to
leave, politely, and then wrote a sentence in the margin of Q1 that says HE
KNEW AND SO DID I, and left the folder exactly where it had always been.` },
      { condition: { flag: 'iris_signed' },
        text: `Iris signed the reduction. She had eleven months of unsigned ones in a folder in
her desk and she put this one on top of them.` },
      { condition: { flag: 'signed_it_myself' },
        text: `Iris would not sign it. You signed it, which meant taking the desk to have a
hand that could, which meant the thing you swore in the courtyard you would
never do, done in public, for the right reason. She has not spoken to you since
and she was not wrong to stop.` },
      { condition: { counter: ['crisis_lost', 1] },
        text: `The firebreak went in forty metres north of the street where you did not get
everyone out. That is not a coincidence. You chose the alignment.` },
      { condition: { flag: 'trench_fought' },
        text: `Krajcik gave the two Wardens a month's pay and an instruction never to
discuss it, and put nothing in either file. He did that before you asked. He
did it before you had finished speaking.` },
      { condition: { chose: ['vents', 'half'] },
        text: `You never did go back and shut the third head. It is still open. It is inside the
firebreak now, which means it vents into ground nobody lives on, which means the
worst decision you made in Hollis was retroactively made harmless by a machine,
and you do not get to feel anything about that.` },
    ],
    epilogue: {
      told: `Nessa took the Q1 sheets off you herself, checked them against the raw log line
by line, and handed them back without a word. She does that every quarter. You
think it is the most generous thing anyone has ever done for you.`,
      untold: `Nessa left in the spring. She did not say goodbye and she was not obliged to.`,
    },
  },
  {
    id: 'westward',
    title: 'THE LINE MOVES WEST',
    condition: { all: [{ chose: ['final', 'deal'] }] },
    text: `You took the desk.

Q4 went out with the line eighty metres west of where the reduction put it, and
you signed the check box, and the households on the inside of it were moved in
January with the deposits paid.

Thirty-one that quarter. Twenty-eight the next. Then forty, because the winter
was bad and the Authority released contingency.

You are good at it. That is the part nobody warns you about. You are extremely
good at deciding, every three months, who is told and who is moved and who is
simply left where they are for one more quarter because the budget does not
reach.

Eleven years. Three hundred and eighty more households.

Nobody ever knew, which was the point, and you have never settled whether that
was mercy or the largest thing you have taken from anybody.`,
    beats: [
      { condition: { chose: ['krajcik_offer', 'refused'] },
        text: `You had refused it once, in his office, with some heat. He never mentioned that
either. He simply moved the chair out for you as though the first conversation
had been a scheduling problem.` },
      { condition: { flag: 'sol_confession' },
        text: `Sol had heard the whole thing from you, in her own courtyard, before any of it.
She is the only person alive who can put the two Rens in the same sentence, and
she has never been asked to.` },
      { condition: { counter: ['honest', 3] },
        text: `The strange part is that you told everybody the truth on the way here. Marsh,
Sol, Iris, the girl. Every one of them. And then you took the desk anyway, which
means the truth was never the thing standing in the way, and you have had eleven
years to sit with that.` },
      { condition: { flag: 'nessa_told_truth' },
        text: `Nessa had the whole of it from your own mouth before you signed anything. That
was the last conversation. She said thank you. She meant it. She said it in the
past tense.` },
    ],
    epilogue: {
      told: `Nessa knew. She was the only one. She never told anyone either, and she never
spoke to you again, and both of those were decisions she made deliberately.`,
      untold: `You saw Nessa twice more, at a distance, in a town with a functioning school.
She looked well. You did not cross the road.`,
    },
  },
  {
    id: 'everybody',
    title: 'EVERYBODY OUT',
    condition: { all: [{ chose: ['final', 'evacuate'] }] },
    text: `You burned the log in a barrel in the Stacks courtyard with Sol watching, and
then the two of you used the Authority's own evacuation machinery — its lorries,
its schedules, its forms — to empty Hollis in nineteen days.

Four hundred and six people. Every single one.

Nobody was told anything. There was no inquiry, because there was no evidence,
because you had stood over it in a barrel until it was ash and Sol never asked
you, at any point, whether you were sure.

The burn crossed Cinder Road that autumn and took the Cut, and then Marrow, and
then the Stacks, and there was nobody in any of it.

It is the largest number of people you have ever kept alive and it is the only
thing you have ever done that you cannot tell anybody about.`,
    beats: [
      { condition: { counter: ['crisis_lost', 1] },
        text: `Not every single one. You count them the way Sol counts, which is out loud and
by name, and the four hundred and six does not include the two you left in a
ground-floor room in a street that was already gone.` },
      { condition: { flag: 'trench_slipped' },
        text: `Nobody ever established how you got past the line at the cut that morning,
because you went over the spoil heap in daylight in front of forty people and
not one of them mentioned it to anybody, ever, which is the single clearest
thing anyone in Hollis has told you about whose side they were on.` },
      { condition: { flag: 'crisis_saved_all' },
        text: `Sol had watched you bring four people up a stairwell in a filling street once
already. That is the only reason she said yes to this in under a minute. She
told you so while you were loading, in the flat voice she uses for facts.` },
      { condition: { flag: 'vents_shut' },
        text: `You had taken her yard off her a month before, to give Fenn Street a night's
breathing, and she had not forgiven you and she got in the lorry anyway. That is
what she is like. It is not the same as forgiveness and she would not want it
called that.` },
      { condition: { chose: ['log_intent', 'publish'] },
        text: `You had told Marsh it was for publishing. He never asked again and he never
raised it and when the barrel was lit he was standing about four metres away
with his hands in his coat, and he nodded once, at the fire, not at you.` },
    ],
    epilogue: {
      told: `Nessa knows what was in it. She was there when it burned. She said: *he'd have
wanted the people out.* Then, after a while: *he'd also have wanted it printed.*
Then she helped you load the lorries.`,
      untold: `Nessa found out what you had burned about a year later, from Sol, who did not
think it was a secret. She has not forgiven you and she has never pretended the
people are not alive.`,
    },
  },
  {
    id: 'nothing',
    title: 'NOTHING OWED',
    condition: { any: [{ chose: ['final', 'leave'] }, {}] },
    text: `You left with the log in your coat.

There was a train from the halt at Kell that ran twice a week and you were on the
Thursday one, and nobody in Hollis knew you had gone until Marsh noticed you had
not come for cartridges.

You did not publish it. You did not use it. For a while you told yourself you
were waiting for the right moment, and then you stopped telling yourself
anything, and it went into a box with the field manual and your father's lamp.

Hollis burned on schedule. The Authority managed it, in the sense that they
continued to be paid for it. The Stacks went in the third winter.

You are not a bad person. You have never done anything cruel in your life. You
simply have, twice now, been in a position to say one true sentence out loud and
found on both occasions that you could not make your mouth do it.

The box is under the stairs. You know exactly where it is.`,
    beats: [
      { condition: { counter: ['honest', 3] },
        text: `You told them. That is the part that does not fit. Marsh, Sol, Iris, the girl —
you looked at each of them and said the true sentence and then you got on the
Thursday train, which means the silence was never the problem either. You are
simply a person who says the thing and then leaves.` },
      { condition: { chose: ['krajcik_offer', 'accepted'] },
        text: `Krajcik held the post open for four months. There is a letter in the box as
well, on Authority paper, that says only that the position remains available
and that he hopes you are well. He wrote it himself. You can tell.` },
      { condition: { counter: ['crisis_lost', 1] },
        text: `You had gone into a filling street for strangers, four days before, and got most
of them out, and the two you did not get out are why you thought of yourself as
somebody who acts. It turns out you are somebody who acts for two hundred
seconds at a time.` },
      { condition: { flag: 'nessa_told_truth' },
        text: `She had it from you. In the courtyard, badly, with your hands doing something
else. It is the only true sentence you have ever managed to say to somebody's
face and you left eleven days later.` },
    ],
    epilogue: {
      told: `Nessa knew before you left. That is something. It is not very much, and it is
something.`,
      untold: `Nessa never knew. She is nineteen in your head and she always will be, because
you never stayed long enough to see her be twenty.`,
    },
  },
];

/** Extra epilogue paragraphs, appended when their condition holds. */
export const EPILOGUE_BEATS = [
  {
    id: 'nessa_shop',
    condition: { flag: 'nessa_shop_told' },
    text: `Nessa went down Fenn Street. Ostrowski's wife made her sit down in her own
father's workshop and would not let her leave until she had eaten something, and
she has been back every week since, and the ironwork over the door has been
cleaned.`,
  },
  {
    id: 'garage_lived',
    condition: { all: [{ flag: 'met_garage' }, { any: [{ flag: 'vents_shut' }, { flag: 'gave_garage_filter' }] }] },
    text: `The Ostrowskis got out. All four. He wrote down your name on the back of a
docket at the relocation office and spelled it wrong and would not be corrected.`,
  },
  {
    id: 'garage_died',
    condition: { all: [{ flag: 'met_garage' }, { flag: 'vents_left' }] },
    text: `The Ostrowskis did not all get out. He did, and the children did. She had not
come down from the first floor in some time, and on the night the draw turned
there was nobody downstairs to hear anything, and there was nothing to hear.`,
  },
  {
    id: 'stacks_held',
    condition: { any: [{ flag: 'vents_left' }, { flag: 'vents_half' }] },
    text: `The Stacks held their courtyard through the winter. Sol never thanked you for
it, because by her count you had done nothing but decline to make it worse.`,
  },
  {
    id: 'stacks_lost',
    condition: { flag: 'vents_shut' },
    text: `The Stacks lost the courtyard in a fortnight, exactly as Sol said they would.
They moved the generator to the second floor of Pell and the rota got harder and
they did not lose anybody, which Sol has never once called luck.`,
  },
  {
    id: 'teo',
    condition: { flag: 'teo_shared' },
    text: `Teodor Marsh closed the exchange and went to his sister's. He posted you one
letter, on time, and it said only: *That was the small thing. Done now.*`,
  },
  {
    id: 'nessa_rescued',
    condition: { flag: 'nessa_rescued' },
    text: `Nessa stopped doing the runs. Somebody younger does them now and she checks
their cartridge before they go down, every time, out loud, in front of people,
until they are embarrassed enough to check it themselves.`,
  },
  {
    id: 'iris',
    condition: { flag: 'iris_gave_pass' },
    text: `Iris Nadeau resigned in March and took a job doing hydrographic survey on a
coast where nothing is on fire. She is, by every account, extremely happy.`,
  },
];
