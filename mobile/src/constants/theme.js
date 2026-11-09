/**
 * Centralized Mobile Design Tokens & Branding
 * Consistent with Web - Deep Forest Green & Charcoal Palette
 * PURPLE AND VIOLET ARE STRICTLY PROHIBITED
 */

export const APP_NAME = "ChitChat";

export const COLORS = {
  // Brand Actions
  primary: "#236B4A",         // Deep forest green
  primaryHover: "#1B573C",
  primaryLight: "#4B9B70",    // Dark mode green
  primarySubtle: "#E8F3ED",   // Light green tint

  // Surfaces & Backgrounds
  background: "#F7F7F5",      // Warm off-white
  backgroundDark: "#171A18",
  surface: "#FFFFFF",
  surfaceSecondary: "#F1F2EF",
  surfaceDark: "#202522",
  surfaceDarkSecondary: "#282E2A",

  // Borders
  border: "#E3E6E1",
  borderDark: "#343B36",

  // Text
  text: "#202421",            // Charcoal
  textSecondary: "#737A75",   // Muted grey
  textDark: "#F1F3F0",
  textDarkSecondary: "#A6AEA8",
  textInverse: "#FFFFFF",

  // Message Bubbles
  bubbleSender: "#E8F3ED",        // Subtle green-tinted
  bubbleSenderText: "#202421",
  bubbleReceiver: "#FFFFFF",      // Neutral white
  bubbleReceiverText: "#202421",
  bubbleSenderDark: "#24382D",
  bubbleSenderDarkText: "#F1F3F0",
  bubbleReceiverDark: "#202522",
  bubbleReceiverDarkText: "#F1F3F0",

  // Semantic Status
  online: "#27834A",
  offline: "#737A75",
  success: "#27834A",
  warning: "#B7791F",
  warningDark: "#D6A34D",
  error: "#C0392B",
  errorDark: "#E06A63",
};

export const TYPOGRAPHY = {
  h1: { fontSize: 24, fontWeight: "700" },
  h2: { fontSize: 20, fontWeight: "600" },
  h3: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400" },
  caption: { fontSize: 13, fontWeight: "400" },
  small: { fontSize: 11, fontWeight: "500" },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
