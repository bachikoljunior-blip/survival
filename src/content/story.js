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
 * Eighteen months ago Renata Vasko was a survey assistant. She read the Q3
 * borehole data and saw that the line about to be published sat two hundred
 * metres east of where the numbers put it. She said nothing. She needed the
 * job. Four months later the ground under Cellar Row — which the published
 * line called safe — vented in the night, and nine people died in their
 * basements without ever waking up.
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
 * needs it to grieve properly. Krajcik argues, with real arithmetic, that
 * publishing it will kill more people than it saves. Sol has been quietly
 * doing Krajcik's calculus at street scale and would tell you so to your face.
 *
 * Nobody in this story is lying for money. Everybody is choosing whose
 * survival counts. So is the player.
 * ────────────────────────────────────────────────────────────────────────────
 */

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
jokes badly, and has not once asked anyone to feel sorry for her.`,
  },
  iris: {
    name: 'Iris', full: 'Iris Nadeau', colour: '#7fa2b4',
    bio: `Thirty-three. Survey Engineer II. Was Ren's junior. Signs the lines now.
Has been noticing, and not saying, for eighteen months longer than Ren managed.
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
  onComplete: [{ flag: 'ch1_done' }, { chapter: 2 }],
};

Q.log = {
  id: 'log', title: 'The Numbers Behind the Line', chapter: 1,
  summary: 'Teo wants the raw borehole log from Vent Field 9 — the data the published Cinder Line was drawn against.',
  steps: [
    {
      objective: 'Marrow Street is cut at the Slip. Find a way east.',
      hint: 'The hole is nine metres deep and the air in it will kill you. Go up.',
      marker: 'slipEscape',
      trigger: { kind: 'reach', pos: [-44, -14], radius: 7, y: 10, yTolerance: 4 },
      onDone: [
        { card: ['CHAPTER TWO', 'THE SLIP', 'Marrow Street'] },
        { chapter: 2 },
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
      objective: 'Get inside the field office.',
      marker: 'survey',
      trigger: { kind: 'interact', id: 'survey_door' },
      nextIf: [{ if: { flag: 'iris_gave_pass' }, goto: 3 }, { if: {}, goto: 3 }],
    },
    {
      objective: 'Find the trench cut order.',
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
      objective: 'Aurel Krajcik is waiting for you.',
      trigger: { kind: 'talk', who: 'krajcik' },
    },
  ],
  onComplete: [{ flag: 'ch3_done' }, { chapter: 4 }, { quest: 'whitedamp' }],
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
  onStart: [{ card: ['CHAPTER FIVE', 'THE CINDER LINE', 'The Cut'] }],
  steps: [
    {
      objective: 'Get to the trench.',
      marker: 'trench',
      trigger: { kind: 'reach', pos: [74, 20], radius: 10 },
    },
    {
      objective: 'Get through the Warden line at the cut.',
      onEnter: [{ fn: 'spawnTrenchLine' }],
      trigger: { kind: 'custom', id: 'trenchCleared' },
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
  id: 'filters', title: 'Ten Cartridges', chapter: 1, side: true,
  summary: 'Teo will trade. Salvage for filters, and he does not do favours.',
  steps: [
    { objective: 'Bring Teo twelve salvage.', trigger: { kind: 'custom', id: 'teoTrade' },
      onDone: [{ trust: ['teo', 6, 'Business is business.'] }] },
  ],
};

Q.nessaRun = {
  id: 'nessaRun', title: "Nessa's Run", chapter: 2, side: true,
  summary: 'Nessa runs filters into the low ground four times a week. She has not come back.',
  steps: [
    { objective: "Find Nessa's run route in South Marrow.",
      marker: 'nessaRun',
      trigger: { kind: 'reach', pos: [-92, 48], radius: 8 } },
    { objective: 'Find Nessa.', marker: 'nessaRun',
      trigger: { kind: 'talk', who: 'nessa', convo: 'nessa_rescue' },
      onDone: [{ trust: ['nessa', 18, 'You came down for her.'] }, { trust: ['sol', 8, 'You brought her back.'] }] },
  ],
  onComplete: [{ flag: 'nessa_rescued' }, { give: ['filter', 2] }],
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
          if: {}, effects: [{ flag: 'sol_told_cellar' }, { trust: ['sol', 6, 'You said the true thing first.'] }] },
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
    again: {
      ...line('sol', "Still here."),
      branch: [
        { if: { flag: 'found_venting' }, goto: 'vent_confront' },
        { if: {}, goto: 'again2' },
      ],
    },
    again2: {
      ...line('sol', "Yard's holding. Ask me again after dark."),
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
      next: 'r2',
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
      next: 't_why3',
    },
    t_why3: {
      ...line('teo', "So. Now there are two of us who didn't do the small thing at the time.", 'quiet'),
      choices: [
        { text: "That's not the same.", goto: 't_notsame' },
        { text: "No. There are two of us.", goto: 't_same',
          effects: [{ trust: ['teo', 10, 'She took her share of it.'] }, { flag: 'teo_shared' }] },
        { text: "What do you want me to do about it?", goto: 't_task' },
      ],
    },
    t_notsame: {
      ...line('teo', `No. It isn't. You read the data. I mislaid an envelope. I've told myself the
difference a great many times and it has never once let me sleep.`),
      next: 't_task',
    },
    t_same: {
      ...line('teo', "...Aye.", 'quiet'),
      next: 't_task',
    },
    t_task: {
      ...line('teo', `Here's the useful part. A letter proves a man was worried. It proves nothing
about the ground.

What proves it is the raw log. Nine boreholes, temperature and gas, every week
for three years, in the Authority's own hand. Not the published line — the
numbers the line was drawn against.`),
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
    again: {
      ...line('teo', "Vasko."),
      branch: [
        { if: { item: 'logbook' }, goto: 'has_log' },
        { if: {}, goto: 'a_shop' },
      ],
    },
    a_shop: {
      ...line('teo', "Cartridges, dressings, cells. Salvage or nothing, and don't insult me."),
      choices: [
        { text: '[Trade]', goto: 'trade', effects: [{ fn: 'openTrade' }] },
        { text: "Can you do anything with this bar?", goto: 'a_bar', if: { noCap: 'breach' } },
        { text: "Tell me about the Cinder Line.", goto: 'a_line' },
        { text: "Tell me about Sol.", goto: 'a_sol' },
        { text: "Nothing today.", goto: 'end' },
      ],
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

The joke — and it is a joke, we do laugh — is that the line has never once moved
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
      ...line('teo', "You've got it. I can see it in how you're standing.", 'quiet'),
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
        { if: { chose: ['nessa_truth', 'told'] }, goto: 'at_told' },
        { if: {}, goto: 'at_other' },
      ],
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
      next: 'end',
    },
  },
};

C.nessa_truth = {
  id: 'nessa_truth', who: 'nessa',
  nodes: {
    start: {
      ...line('nessa', "Sol says you've got the borehole log."),
      next: 'nt2',
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
                    { trust: ['nessa', 14, 'She heard it from Ren, not from paper.'] }] },
        { text: "It's not ready. Not yet.", goto: 'nt_withhold',
          effects: [{ choice: ['nessa_truth', 'withheld'] }, { trust: ['nessa', -12, 'She was managed.'] },
                    { flag: 'nessa_withheld' }] },
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
        { text: "I'm not telling you so you'll say anything. I'm telling you because it's yours.",
          goto: 'nt_yours', effects: [{ trust: ['nessa', 12, 'She was not asked for absolution.'] }] },
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
          effects: [{ flag: 'iris_shared' }, { trust: ['iris', 16, 'Someone else did the same and said so.'] }] },
      ],
    },
    i_long: {
      ...line('iris', "Two years and one month. Since before you left."),
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
      ...line('krajcik', "Look at this before you decide anything."),
      next: 'k_ledger2',
    },
    k_ledger2: {
      ...line('krajcik', `Three hundred and forty households. Relocated. Rehoused, deposits paid,
removal costs, twelve months of rent in a town that still has a functioning
school.

Not one of them is in a government scheme, because there is no government scheme.
Every penny of that came out of the margin on a contract to manage a fire that
cannot be managed.`),
      next: 'k_ledger3',
    },
    k_ledger3: {
      ...line('krajcik', `I am not asking you to think I am a good man. I'm asking you to do the
arithmetic that I do every morning.

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

I have never once claimed the right. I have only ever claimed that somebody was
going to make it, and that the alternative to me making it badly was nobody
making it at all.

If you have a better mechanism than one flawed man with a budget, I would like
to hear it. I have been waiting years.`),
      next: 'k_offer',
    },
    k_after: {
      ...line('krajcik', `Two hundred and ninety-one.

Yes. I want you to hear the shape of that. Forty-nine before Cellar Row. Two
hundred and ninety-one after.

I have never been able to decide whether that is the most useful thing I have
ever done or the most obscene.`),
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
                    { trust: ['krajcik', 20, 'She understood the arithmetic.'] }] },
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
      effects: [{ flag: 'krajcik_met' }, { flag: 'ch3_talked' }],
      next: 'end',
    },
  },
};

// --------------------------------------------------------------- INCIDENTAL

C.garage = {
  id: 'garage', who: 'garage',
  nodes: {
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
            { trust: ['sol', -18, 'You took the yard off her.'] },
            { journal: ['vents_shut', 'I shut the heads', `Two turns each. The draw reversed inside a
minute — I could hear it change. Fenn Street will be breathable by morning.

The Stacks courtyard will not.`] },
          ] },
        { text: "[Leave them] A hundred and six against eleven.",
          goto: 'v_leave',
          effects: [
            { choice: ['vents', 'left'] }, { flag: 'vents_left' },
            { trust: ['sol', 10, 'You did the arithmetic her way.'] },
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
  id: 'final', who: 'system',
  nodes: {
    start: {
      ...ren(`The excavators are idling on the published line. Krajcik is standing on the
spoil heap with a clipboard he is not reading. Forty people are watching from the
far side, because it is the largest thing that has happened in Hollis in a year.

I am carrying the log, the order, and the July sheet with my initials in the
check box.`),
      choices: [
        { text: 'Put it on the record. All of it, including me.', tag: 'record',
          goto: 'e_publish', effects: [{ choice: ['final', 'publish'] }] },
        { text: 'Make him cut it on the true line, openly.', tag: 'the cut',
          if: { trust: ['iris', 12] }, showLocked: true,
          why: 'It needs a surveyor inside willing to sign it. Iris will not.',
          goto: 'e_cut', effects: [{ choice: ['final', 'cut'] }] },
        { text: 'Take the desk. Draw the line honestly and tell nobody.', tag: 'the deal',
          goto: 'e_deal', effects: [{ choice: ['final', 'deal'] }] },
        { text: "Burn it. Use their own lorries and empty Hollis.", tag: 'everybody out',
          if: { trust: ['sol', 20] }, showLocked: true,
          why: 'Sol would have to run it with you, and she does not trust you with it.',
          goto: 'e_evac', effects: [{ choice: ['final', 'evacuate'] }] },
        { text: 'Walk away. Take it with me.', tag: 'leave',
          goto: 'e_leave', effects: [{ choice: ['final', 'leave'] }] },
      ],
    },
    e_publish: { ...ren('I walk to the far side, where the forty people are, and I start with my own name.'), next: 'end' },
    e_cut: { ...ren('I put the order in his hand where they can all see me do it.'), next: 'end' },
    e_deal: { ...ren('I put the log back in my coat and tell him I will start Monday.'), next: 'end' },
    e_evac: { ...ren('I find Sol at the barrier and tell her what I want to do. She does not ask me twice.'), next: 'end' },
    e_leave: { ...ren('I turn round. Nobody stops me. Nobody ever does.'), next: 'end' },
  },
};

export const CONVERSATIONS = C;

// ================================================================== ENDINGS ==

/**
 * Endings are chosen by an ordered evaluation: the first whose condition holds
 * wins, so the more specific and more earned outcomes sit at the top.
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
your evidence took two of them, and you did not once say that you had been
young, or tired, or under contract.

Nessa came. She sat at the back with her arms folded and she did not look at you
and she came every single day.`,
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
    condition: { all: [{ chose: ['final', 'cut'] }, { trust: ['iris', 12] }] },
    text: `Krajcik issued it standing on the spoil heap with the excavators idling and
forty people watching, and his voice did not change once.

The trench went in on your line. Nine point four million, eleven months, and a
firebreak sixty metres wide between the burn and everything west of Kell.

It held. Not all of it — the Cut and the vent field are gone, and South Marrow
went in the second winter — but the Stacks are still standing and there are
still a hundred and something people in them.

The line is honest now. It is honest because you draw it, every quarter, in the
same building, under the same man, and the two of you have never once discussed
what that costs either of you.

Iris does the reduction. She still keeps her folder. There is nothing in it any
more, and she keeps it anyway.`,
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
    condition: { any: [{ chose: ['final', 'deal'] }, { chose: ['krajcik_offer', 'accepted'] }] },
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

Nobody ever knew, which was the point, and you have never once been able to
decide whether that was mercy or the largest thing you have ever stolen from
anybody.`,
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
because you had stood over it in a barrel until it was ash and Sol had not once
asked you if you were sure.

The burn crossed Cinder Road that autumn and took the Cut, and then Marrow, and
then the Stacks, and there was nobody in any of it.

It is the largest number of people you have ever kept alive and it is the only
thing you have ever done that you cannot tell anybody about.`,
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
    epilogue: {
      told: `Nessa knew before you left. That is something. It is not very much, and it is
something.`,
      untold: `Nessa never knew. She is nineteen in your head and she always will be, because
you never once stayed long enough to see her be twenty.`,
    },
  },
];

/** Extra epilogue paragraphs, appended when their condition holds. */
export const EPILOGUE_BEATS = [
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
it, because in her arithmetic you had done nothing but decline to make it worse.`,
  },
  {
    id: 'stacks_lost',
    condition: { flag: 'vents_shut' },
    text: `The Stacks lost the courtyard in a fortnight, exactly as Sol said they would.
They moved the generator to the second floor of Pell and the rota got harder and
they did not lose anybody, which Sol has never once described as luck.`,
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
