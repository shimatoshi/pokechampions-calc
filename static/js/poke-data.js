// Pokemon game constants - move categories, ability mappings, item effects
// All game-specific data in one place for easy maintenance

// ===== MOVE CATEGORIES (ability interactions) =====
export const PUNCH_MOVES = new Set(['Bullet Punch','Drain Punch','Dynamic Punch','Fire Punch','Focus Punch','Ice Punch','Mach Punch','Mega Punch','Meteor Mash','Power-Up Punch','Shadow Punch','Sky Uppercut','Thunder Punch','Jet Punch']);
export const BITE_MOVES = new Set(['Bite','Crunch','Fire Fang','Fishious Rend','Hyper Fang','Ice Fang','Jaw Lock','Poison Fang','Psychic Fangs','Thunder Fang']);
export const SLICE_MOVES = new Set(['Aerial Ace','Air Cutter','Air Slash','Aqua Cutter','Behemoth Blade','Bitter Blade','Ceaseless Edge','Cross Poison','Cut','Fury Cutter','Kowtow Cleave','Leaf Blade','Night Slash','Psycho Cut','Razor Leaf','Razor Shell','Sacred Sword','Secret Sword','Slash','Solar Blade','Stone Axe','X-Scissor']);
export const PULSE_MOVES = new Set(['Aura Sphere','Dark Pulse','Dragon Pulse','Heal Pulse','Origin Pulse','Terrain Pulse','Water Pulse']);
export const BULLET_MOVES = new Set(['Acid Spray','Aura Sphere','Barrage','Bullet Seed','Egg Bomb','Electro Ball','Energy Ball','Focus Blast','Gyro Ball','Ice Ball','Mist Ball','Mud Bomb','Octazooka','Pollen Puff','Pyro Ball','Rock Blast','Rock Wrecker','Searing Shot','Seed Bomb','Shadow Ball','Sludge Bomb','Weather Ball','Zap Cannon']);
export const SOUND_MOVES = new Set(['Alluring Voice','Boomburst','Bug Buzz','Chatter','Clanging Scales','Clangorous Soulblaze','Disarming Voice','Echoed Voice','Eerie Spell','Grass Whistle','Growl','Heal Bell','Howl','Hyper Voice','Metal Sound','Noble Roar','Overdrive','Perish Song','Relic Song','Roar','Round','Screech','Sing','Snarl','Snore','Sparkling Aria','Supersonic','Torch Song','Uproar']);

// ===== TWO-TURN MOVES =====
export const TWO_TURN_MOVES = new Set(['Phantom Force','Shadow Force','Fly','Dig','Dive','Bounce','Sky Attack','Solar Beam','Solar Blade','Meteor Beam','Geomancy','Skull Bash']);

// ===== ABILITY MAPPINGS =====
export const SKIN_ABILITIES = {
  'Pixilate':'Fairy', 'Aerilate':'Flying', 'Refrigerate':'Ice',
  'Galvanize':'Electric', 'Dragonize':'Dragon',
};

// ===== ITEM MAPPINGS =====
export const RESIST_BERRY = {
  'Occa Berry':'Fire','Passho Berry':'Water','Wacan Berry':'Electric',
  'Rindo Berry':'Grass','Yache Berry':'Ice','Chople Berry':'Fighting',
  'Kebia Berry':'Poison','Shuca Berry':'Ground','Coba Berry':'Flying',
  'Payapa Berry':'Psychic','Tanga Berry':'Bug','Charti Berry':'Rock',
  'Kasib Berry':'Ghost','Haban Berry':'Dragon','Colbur Berry':'Dark',
  'Babiri Berry':'Steel','Roseli Berry':'Fairy','Chilan Berry':'Normal',
};

export const TYPE_BOOST_ITEM = {
  'Black Belt':'Fighting','Black Glasses':'Dark','Charcoal':'Fire',
  'Dragon Fang':'Dragon','Fairy Feather':'Fairy','Hard Stone':'Rock',
  'Magnet':'Electric','Metal Coat':'Steel','Miracle Seed':'Grass',
  'Mystic Water':'Water','Never-Melt Ice':'Ice','Poison Barb':'Poison',
  'Sharp Beak':'Flying','Silk Scarf':'Normal','Silver Powder':'Bug',
  'Soft Sand':'Ground','Spell Tag':'Ghost','Twisted Spoon':'Psychic',
};

// ===== RECOIL / DRAIN (fallback if not in move data) =====
export const RECOIL_MOVES = {
  'Brave Bird':1/3,'Double-Edge':1/3,'Flare Blitz':1/3,'Head Smash':1/2,
  'Light of Ruin':1/2,'Submission':1/4,'Take Down':1/4,'Volt Tackle':1/3,
  'Wild Charge':1/4,'Wood Hammer':1/3,'Wave Crash':1/3,'Head Charge':1/4,
};

export const DRAIN_MOVES = {
  'Drain Punch':1/2,'Giga Drain':1/2,'Horn Leech':1/2,'Leech Life':1/2,
  'Parabolic Charge':1/2,'Absorb':1/2,'Mega Drain':1/2,
  'Oblivion Wing':3/4,'Draining Kiss':3/4,
};

// ===== ACCURACY (moves with accuracy < 100; default 100, 0 = never-miss) =====
export const MOVE_ACCURACY = {
  // 一撃必殺は別枠だが代表値
  'Fissure':30,'Guillotine':30,'Horn Drill':30,'Sheer Cold':30,
  // 低命中・高威力
  'Focus Blast':70,'Hydro Pump':80,'Blizzard':70,'Thunder':70,'Fire Blast':85,
  'Dynamic Punch':50,'Inferno':50,'Zap Cannon':50,'Will-O-Wisp':85,
  'Stone Edge':80,'Rock Slide':90,'Megahorn':85,'Cross Chop':80,'Play Rough':90,
  'Iron Tail':75,'Power Whip':85,'Wood Hammer':100,'Gunk Shot':80,'Poison Jab':100,
  'Bounce':85,'Sky Attack':90,'Jump Kick':95,'High Jump Kick':90,'Drill Run':95,
  'Sing':55,'Grass Whistle':55,'Supersonic':55,'Hypnosis':60,'Sleep Powder':75,
  'Stun Spore':75,'Poison Powder':75,'Sweet Kiss':75,'Lovely Kiss':75,
  'Mud Bomb':85,'Mega Drain':100,'Muddy Water':85,'Razor Wind':100,
  'Sand Tomb':85,'Fire Spin':85,'Whirlpool':85,'Magma Storm':75,'Bind':85,'Wrap':90,
  'Aeroblast':95,'Sacred Fire':95,'Crabhammer':90,'Bone Rush':90,'Pin Missile':95,
  'Leaf Tornado':90,'Mirror Shot':85,'Night Daze':95,'Searing Shot':100,
  'Diamond Storm':95,'Origin Pulse':85,'Precipice Blades':85,'Hurricane':70,
  'Thousand Arrows':100,'Overheat':90,'Leaf Storm':90,'Draco Meteor':90,
  'Psychic Fangs':100,'Bonemerang':90,'Rock Blast':90,'Icicle Crash':90,
  'Bone Club':85,'Egg Bomb':75,'Octazooka':85,'Dragon Rush':75,'Zen Headbutt':90,
  'Meteor Mash':90,'Sky Uppercut':90,'Slam':75,'DoubleSlap':85,'Double Slap':85,
  'Take Down':85,'Thrash':100,'Petal Dance':100,'Outrage':100,'Smog':70,
  'Air Cutter':95,'Razor Leaf':95,'Mud Shot':95,'Snore':100,'Aurora Beam':100,
  'Charge Beam':90,'Signal Beam':100,'Metal Claw':95,'Crush Claw':95,
  'Dragon Tail':90,'Circle Throw':90,'Whirlwind':100,'Roar':100,
};

// ===== FORCE-SWITCH MOVES (相手を強制交代) =====
export const FORCE_SWITCH_MOVES = new Set(['Roar','Whirlwind','Dragon Tail','Circle Throw']);

// ===== WEATHER / TERRAIN 延長アイテム (5→8ターン) =====
export const WEATHER_ROCK = { 'Sun':'Heat Rock','Rain':'Damp Rock','Sand':'Smooth Rock','Snow':'Icy Rock' };
export const TERRAIN_EXTENDER = 'Terrain Extender';

export function getMoveAccuracy(moveName, moveData) {
  if (moveData?.acc != null) return moveData.acc;
  if (moveName in MOVE_ACCURACY) return MOVE_ACCURACY[moveName];
  return 100;
}

// ===== HELPERS =====
export function applyBoost(stat, boost) {
  if (boost >= 0) return Math.floor(stat * (2 + boost) / 2);
  return Math.floor(stat * 2 / (2 - boost));
}

export function getRecoilFrac(moveName, moveData) {
  return moveData?.recoil || RECOIL_MOVES[moveName] || 0;
}

export function getDrainFrac(moveName, moveData) {
  return moveData?.drain || DRAIN_MOVES[moveName] || 0;
}

export function getEffectiveMoveType(moveName, moveData, ability) {
  if (!moveData) return '';
  if (moveData.type === 'Normal' && SKIN_ABILITIES[ability]) return SKIN_ABILITIES[ability];
  return moveData.type;
}
