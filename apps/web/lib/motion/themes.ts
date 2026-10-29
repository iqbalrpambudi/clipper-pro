export interface MotionTheme {
  id: string;
  name: string;
  subtitle: string;
  isDark: boolean;
  bg: string;
  bgSecondary: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accent2: string;
  accent3: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
}

export const MOTION_THEMES: Record<string, MotionTheme> = {
  claude_editorial: {
    id: "claude_editorial",
    name: "Claude Warm Editorial",
    subtitle: "Parchment hangat, diorama isometrik & HUD bersih",
    isDark: false,
    bg: "#EAE4DC",
    bgSecondary: "#DDD5C7",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    border: "#D5CCBC",
    text: "#18181B",
    textMuted: "#6B665E",
    accent: "#D91B1B",
    accent2: "#16A34A",
    accent3: "#2563EB",
    fontDisplay: "'Montserrat', 'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
  diorama_world: {
    id: "diorama_world",
    name: "Isometric World & HUD (AIShift Style)",
    subtitle: "Langit diorama 2.5D, pulau mengambang, agen kapsul & HUD kontras",
    isDark: false,
    bg: "#EAE4DC",
    bgSecondary: "#DCD3C4",
    surface: "#FFFFFF",
    surfaceElevated: "#231F20",
    border: "#D4CBB9",
    text: "#18181B",
    textMuted: "#68635B",
    accent: "#D91B1B",
    accent2: "#16A34A",
    accent3: "#2563EB",
    fontDisplay: "'Montserrat', 'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
  obsidian_kinetic: {
    id: "obsidian_kinetic",
    name: "Obsidian Tech Keynote",
    subtitle: "Obsidian pekat dengan sirkuit zamrud & violet",
    isDark: true,
    bg: "#0B0D13",
    bgSecondary: "#10141F",
    surface: "#151A28",
    surfaceElevated: "#1C2336",
    border: "#283149",
    text: "#F3F6FC",
    textMuted: "#94A1BC",
    accent: "#34D399",
    accent2: "#818CF8",
    accent3: "#38BDF8",
    fontDisplay: "'Montserrat', 'Poppins', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
  kurz_cosmos: {
    id: "kurz_cosmos",
    name: "Cosmic Vector Explainer",
    subtitle: "Indigo kosmik dengan geometri koral, sian & emas",
    isDark: true,
    bg: "#0E1029",
    bgSecondary: "#15183B",
    surface: "#1B1F4A",
    surfaceElevated: "#242960",
    border: "#343B7E",
    text: "#F8FAFC",
    textMuted: "#A5B0DF",
    accent: "#FF6B6B",
    accent2: "#38BDF8",
    accent3: "#FBBF24",
    fontDisplay: "'Poppins', 'Montserrat', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
  swiss_grid: {
    id: "swiss_grid",
    name: "Swiss Brutalist Precision",
    subtitle: "Ivory bersih, grid arsitektural hitam & vermilion",
    isDark: false,
    bg: "#FAF9F5",
    bgSecondary: "#EFECE4",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    border: "#222220",
    text: "#111110",
    textMuted: "#57554F",
    accent: "#E63946",
    accent2: "#1D4ED8",
    accent3: "#D97706",
    fontDisplay: "'Oswald', 'Montserrat', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
  financial_bloom: {
    id: "financial_bloom",
    name: "Executive Data & Markets",
    subtitle: "Navy institusional dengan aksen champagne & zamrud",
    isDark: true,
    bg: "#09111D",
    bgSecondary: "#0E1A2B",
    surface: "#132238",
    surfaceElevated: "#1A2E4A",
    border: "#274166",
    text: "#F5EEDF",
    textMuted: "#95A9C4",
    accent: "#10B981",
    accent2: "#F59E0B",
    accent3: "#60A5FA",
    fontDisplay: "'Montserrat', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
  cyber_amber: {
    id: "cyber_amber",
    name: "Systems & Terminal Studio",
    subtitle: "Karbon terminal dengan fosfor amber & lime",
    isDark: true,
    bg: "#0C0D0B",
    bgSecondary: "#131511",
    surface: "#181A16",
    surfaceElevated: "#21241E",
    border: "#32372C",
    text: "#F3EFE0",
    textMuted: "#9A9889",
    accent: "#F59E0B",
    accent2: "#84CC16",
    accent3: "#38BDF8",
    fontDisplay: "'Montserrat', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },
};

export const MOTION_THEME_LIST: MotionTheme[] = Object.values(MOTION_THEMES);

export function getMotionTheme(themeId?: string | null): MotionTheme {
  if (themeId && MOTION_THEMES[themeId]) {
    return MOTION_THEMES[themeId];
  }
  return MOTION_THEMES.claude_editorial;
}

