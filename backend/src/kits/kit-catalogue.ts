/**
 * Static facts for the Kits line: the look-alike fonts, the drawn shirt templates, the colour patterns and the starter
 * clubs. The design center reads all of it from GET /kits/config, so this file is the single source of truth the web
 * app draws from and the server validates against.
 *
 * Nothing here is an official asset. Club crests, sponsors, manufacturer marks and the clubs' own typefaces are
 * licensed and are not included; the shirts are drawn from colours and a pattern, and the fonts are open-licence
 * (SIL OFL) typefaces chosen for a similar look. They are labelled by style and never as a club's own font.
 */

export type KitPattern = 'solid' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'pinstripe';
export type KitSleeves = 'primary' | 'secondary';

export type KitColors = {
  primary: string;
  secondary: string;
  trim: string;
  pattern: KitPattern;
  sleeves: KitSleeves;
};

export const KIT_PATTERNS: KitPattern[] = ['solid', 'stripes', 'hoops', 'halves', 'sash', 'pinstripe'];

export type KitFontDef = {
  key: string;
  /** What the shopper sees: a style, never "official". */
  label: string;
  /** CSS family name the web app loads (the @fontsource package of the same name). */
  family: string;
  /** npm package under @fontsource that carries the self-hosted files. */
  fontsource: string;
  weight: number;
};

/** All SIL Open Font Licence: free to self-host and use on printed goods. */
export const KIT_FONTS: KitFontDef[] = [
  { key: 'condensed', label: 'Classic condensed', family: 'Oswald', fontsource: 'oswald', weight: 700 },
  { key: 'tall', label: 'Tall sport', family: 'Bebas Neue', fontsource: 'bebas-neue', weight: 400 },
  { key: 'heavy', label: 'Heavy block', family: 'Anton', fontsource: 'anton', weight: 400 },
  { key: 'modern', label: 'Modern', family: 'Teko', fontsource: 'teko', weight: 600 },
  { key: 'rounded', label: 'Soft sport', family: 'Saira Condensed', fontsource: 'saira-condensed', weight: 700 },
  { key: 'clean', label: 'Clean condensed', family: 'Barlow Condensed', fontsource: 'barlow-condensed', weight: 700 },
  { key: 'wide', label: 'Wide block', family: 'Archivo Black', fontsource: 'archivo-black', weight: 400 },
  { key: 'slab', label: 'Retro slab', family: 'Alfa Slab One', fontsource: 'alfa-slab-one', weight: 400 },
  { key: 'sharp', label: 'Sharp block', family: 'Russo One', fontsource: 'russo-one', weight: 400 },
  { key: 'tech', label: 'Tech', family: 'Chakra Petch', fontsource: 'chakra-petch', weight: 700 },
];

export const KIT_FONT_KEYS = KIT_FONTS.map((font) => font.key);

/** A rectangle in the shirt drawing's own units (the SVG viewBox is KIT_VIEWBOX). */
export type PrintArea = { x: number; y: number; w: number; h: number };

export const KIT_VIEWBOX = { w: 400, h: 440 };

export type KitTemplateDef = {
  key: string;
  label: string;
  kind: 'JERSEY' | 'TSHIRT';
  /** Where artwork, text, a name or a number may sit. Front and back are drawn as two views. */
  areas: Record<string, PrintArea>;
};

const JERSEY_AREAS = {
  frontChest: { x: 140, y: 108, w: 120, h: 96 },
  frontCentre: { x: 120, y: 120, w: 160, h: 190 },
  backName: { x: 110, y: 92, w: 180, h: 46 },
  backNumber: { x: 120, y: 146, w: 160, h: 190 },
};

const TEE_AREAS = {
  frontChest: { x: 150, y: 100, w: 100, h: 90 },
  frontCentre: { x: 110, y: 100, w: 180, h: 230 },
  backName: { x: 120, y: 84, w: 160, h: 40 },
  backNumber: { x: 110, y: 130, w: 180, h: 200 },
};

export const KIT_TEMPLATES: KitTemplateDef[] = [
  { key: 'jersey-short', label: 'Short-sleeve jersey', kind: 'JERSEY', areas: JERSEY_AREAS },
  { key: 'jersey-long', label: 'Long-sleeve jersey', kind: 'JERSEY', areas: JERSEY_AREAS },
  { key: 'jersey-retro', label: 'Retro collar jersey', kind: 'JERSEY', areas: JERSEY_AREAS },
  { key: 'tee-crew', label: 'Crew-neck T-shirt', kind: 'TSHIRT', areas: TEE_AREAS },
  { key: 'tee-vneck', label: 'V-neck T-shirt', kind: 'TSHIRT', areas: TEE_AREAS },
  { key: 'tee-oversized', label: 'Oversized T-shirt', kind: 'TSHIRT', areas: TEE_AREAS },
];

export const KIT_TEMPLATE_KEYS = KIT_TEMPLATES.map((template) => template.key);

/** Plain T-shirt colours offered for blanks. */
export const TEE_PALETTE: Array<{ key: string; label: string; hex: string }> = [
  { key: 'white', label: 'White', hex: '#f5f5f2' },
  { key: 'black', label: 'Black', hex: '#161616' },
  { key: 'grey', label: 'Heather grey', hex: '#9a9da1' },
  { key: 'navy', label: 'Navy', hex: '#1b2a49' },
  { key: 'red', label: 'Red', hex: '#c8102e' },
  { key: 'green', label: 'Forest green', hex: '#1f5b3a' },
  { key: 'sand', label: 'Sand', hex: '#d9c9a8' },
  { key: 'sky', label: 'Sky blue', hex: '#7bb3e0' },
];

// ---------------------------------------------------------------------------
// Starter clubs
// ---------------------------------------------------------------------------

type ClubSeed = {
  slug: string;
  name: string;
  league: 'EPL' | 'LA_LIGA' | 'SERIE_A' | 'BUNDESLIGA' | 'LIGUE_1' | 'KENYA' | 'NATIONAL';
  aliases: string[];
  /** [primary, secondary, pattern, sleeves, trim?] */
  home: [string, string, KitPattern, KitSleeves?, string?];
};

const S = (
  slug: string,
  name: string,
  league: ClubSeed['league'],
  aliases: string[],
  home: ClubSeed['home'],
): ClubSeed => ({ slug, name, league, aliases, home });

/**
 * Which clubs are in the Premier League changes every August, so the EPL list below is the 2025/26 twenty plus the
 * recently relegated; staff switch clubs on or off in the portal (Kits > Clubs) rather than this file changing.
 */
export const CLUB_SEEDS: ClubSeed[] = [
  // Premier League
  S('arsenal', 'Arsenal', 'EPL', ['gunners', 'afc'], ['#ef0107', '#ffffff', 'solid', 'secondary']),
  S('aston-villa', 'Aston Villa', 'EPL', ['villa', 'avfc'], ['#670e36', '#95bfe5', 'solid', 'secondary']),
  S('bournemouth', 'AFC Bournemouth', 'EPL', ['cherries'], ['#da291c', '#111111', 'stripes']),
  S('brentford', 'Brentford', 'EPL', ['bees'], ['#e30613', '#ffffff', 'stripes']),
  S('brighton', 'Brighton & Hove Albion', 'EPL', ['seagulls', 'bhafc'], ['#0057b8', '#ffffff', 'stripes']),
  S('burnley', 'Burnley', 'EPL', ['clarets'], ['#6c1d45', '#99d6ea', 'solid', 'secondary']),
  S('chelsea', 'Chelsea', 'EPL', ['blues', 'cfc'], ['#034694', '#ffffff', 'solid']),
  S('crystal-palace', 'Crystal Palace', 'EPL', ['palace', 'eagles'], ['#1b458f', '#c4122e', 'stripes']),
  S('everton', 'Everton', 'EPL', ['toffees', 'efc'], ['#003399', '#ffffff', 'solid']),
  S('fulham', 'Fulham', 'EPL', ['cottagers'], ['#ffffff', '#111111', 'solid', 'primary', '#111111']),
  S('leeds-united', 'Leeds United', 'EPL', ['leeds', 'lufc'], ['#ffffff', '#1d428a', 'solid', 'primary', '#ffcd00']),
  S('liverpool', 'Liverpool', 'EPL', ['reds', 'lfc'], ['#c8102e', '#ffffff', 'solid']),
  S('manchester-city', 'Manchester City', 'EPL', ['man city', 'city', 'mcfc'], ['#6cabdd', '#ffffff', 'solid']),
  S('manchester-united', 'Manchester United', 'EPL', ['man u', 'man utd', 'united', 'mufc'], ['#da291c', '#ffffff', 'solid']),
  S('newcastle-united', 'Newcastle United', 'EPL', ['newcastle', 'magpies', 'nufc'], ['#ffffff', '#111111', 'stripes']),
  S('nottingham-forest', 'Nottingham Forest', 'EPL', ['forest', 'nffc'], ['#dd0000', '#ffffff', 'solid']),
  S('sunderland', 'Sunderland', 'EPL', ['black cats', 'safc'], ['#eb172b', '#ffffff', 'stripes']),
  S('tottenham-hotspur', 'Tottenham Hotspur', 'EPL', ['spurs', 'tottenham', 'thfc'], ['#ffffff', '#132257', 'solid', 'primary', '#132257']),
  S('west-ham-united', 'West Ham United', 'EPL', ['west ham', 'hammers', 'whufc'], ['#7a263a', '#1bb1e7', 'solid', 'secondary']),
  S('wolverhampton-wanderers', 'Wolverhampton Wanderers', 'EPL', ['wolves', 'wwfc'], ['#fdb913', '#111111', 'solid']),
  S('leicester-city', 'Leicester City', 'EPL', ['leicester', 'foxes', 'lcfc'], ['#003090', '#ffffff', 'solid']),
  S('southampton', 'Southampton', 'EPL', ['saints', 'sfc'], ['#d71920', '#ffffff', 'stripes']),
  S('ipswich-town', 'Ipswich Town', 'EPL', ['ipswich', 'tractor boys'], ['#0044aa', '#ffffff', 'solid']),
  // Spain, Italy, Germany, France
  S('real-madrid', 'Real Madrid', 'LA_LIGA', ['madrid', 'los blancos'], ['#ffffff', '#febe10', 'solid', 'primary', '#febe10']),
  S('barcelona', 'FC Barcelona', 'LA_LIGA', ['barca', 'fcb'], ['#a50044', '#004d98', 'stripes']),
  S('atletico-madrid', 'Atletico Madrid', 'LA_LIGA', ['atleti', 'atletico'], ['#cb3524', '#ffffff', 'stripes']),
  S('juventus', 'Juventus', 'SERIE_A', ['juve', 'old lady'], ['#ffffff', '#111111', 'stripes']),
  S('ac-milan', 'AC Milan', 'SERIE_A', ['milan', 'rossoneri'], ['#fb090b', '#111111', 'stripes']),
  S('inter-milan', 'Inter Milan', 'SERIE_A', ['inter', 'internazionale', 'nerazzurri'], ['#0068a8', '#111111', 'stripes']),
  S('bayern-munich', 'Bayern Munich', 'BUNDESLIGA', ['bayern', 'fcb munich'], ['#dc052d', '#ffffff', 'solid']),
  S('borussia-dortmund', 'Borussia Dortmund', 'BUNDESLIGA', ['dortmund', 'bvb'], ['#fde100', '#111111', 'solid']),
  S('paris-saint-germain', 'Paris Saint-Germain', 'LIGUE_1', ['psg', 'paris'], ['#004170', '#da291c', 'solid', 'primary', '#da291c']),
  // Kenya
  S('harambee-stars', 'Kenya (Harambee Stars)', 'KENYA', ['kenya', 'harambee stars', 'national team'], ['#bb0000', '#006600', 'solid', 'primary', '#111111']),
  S('gor-mahia', 'Gor Mahia', 'KENYA', ['k\'ogalo', 'kogalo', 'gor'], ['#008000', '#ffffff', 'solid']),
  S('afc-leopards', 'AFC Leopards', 'KENYA', ['leopards', 'ingwe'], ['#0033a0', '#ffffff', 'solid']),
  // National teams
  S('england', 'England', 'NATIONAL', ['three lions'], ['#ffffff', '#1c2c5b', 'solid', 'primary', '#1c2c5b']),
  S('brazil', 'Brazil', 'NATIONAL', ['selecao', 'brasil'], ['#ffdc02', '#009c3b', 'solid', 'primary', '#009c3b']),
  S('argentina', 'Argentina', 'NATIONAL', ['albiceleste'], ['#74acdf', '#ffffff', 'stripes']),
  S('france', 'France', 'NATIONAL', ['les bleus'], ['#0055a4', '#ffffff', 'solid']),
  S('germany', 'Germany', 'NATIONAL', ['die mannschaft'], ['#ffffff', '#111111', 'solid', 'primary', '#111111']),
  S('spain', 'Spain', 'NATIONAL', ['la roja', 'espana'], ['#aa151b', '#f1bf00', 'solid']),
  S('portugal', 'Portugal', 'NATIONAL', ['selecao das quinas'], ['#8a1538', '#006600', 'solid']),
  S('netherlands', 'Netherlands', 'NATIONAL', ['holland', 'oranje', 'dutch'], ['#ff6600', '#111111', 'solid']),
  S('nigeria', 'Nigeria', 'NATIONAL', ['super eagles'], ['#008751', '#ffffff', 'solid']),
  S('ghana', 'Ghana', 'NATIONAL', ['black stars'], ['#ffffff', '#ce1126', 'solid', 'primary', '#006b3f']),
  S('morocco', 'Morocco', 'NATIONAL', ['atlas lions'], ['#c1272d', '#006233', 'solid']),
];

const isLight = (hex: string) => {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
};

/** Away and third kits are drawn from the home colours: a contrasting plain shirt and a dark one. They are generic. */
export function editionsFor(home: ClubSeed['home']): { home: KitColors; away: KitColors; third: KitColors } {
  const [primary, secondary, pattern, sleeves = 'primary', trim] = home;
  const homeColors: KitColors = { primary, secondary, trim: trim ?? secondary, pattern, sleeves };
  const awayBase = isLight(primary) ? '#16213e' : '#f5f5f2';
  return {
    home: homeColors,
    away: { primary: awayBase, secondary: primary, trim: primary, pattern: 'solid', sleeves: 'primary' },
    third: { primary: '#111111', secondary: isLight(primary) ? secondary : primary, trim: isLight(primary) ? secondary : primary, pattern: 'pinstripe', sleeves: 'primary' },
  };
}

/** Suggested fonts per club: a default plus alternatives, rotated so neighbouring clubs do not all look the same. */
export function fontKeysFor(index: number): string[] {
  const keys = KIT_FONT_KEYS;
  return [keys[index % keys.length], keys[(index + 1) % keys.length], keys[(index + 2) % keys.length], keys[(index + 3) % keys.length]];
}

// ---------------------------------------------------------------------------
// Print fees (defaults; the real numbers are edited in Site content > Kits)
// ---------------------------------------------------------------------------

export type PrintPricing = {
  nameFeeKes: number;
  numberFeeKes: number;
  /** Charged instead of name + number when both are on the shirt. */
  nameAndNumberFeeKes: number;
  artworkFeeKes: number;
  textFeeKes: number;
};

export const DEFAULT_PRINT_PRICING: PrintPricing = {
  nameFeeKes: 500,
  numberFeeKes: 300,
  nameAndNumberFeeKes: 700,
  artworkFeeKes: 800,
  textFeeKes: 400,
};
