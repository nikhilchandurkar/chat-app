/**
 * Centralized Application Design Tokens & Branding
 * Consistent across Web and Mobile
 * PURPLE AND VIOLET ARE STRICTLY PROHIBITED
 */

export const APP_NAME = "ChitChat";

export const COLORS = {
  primary: {
    DEFAULT: "#236B4A",      // Deep Forest Green
    hover: "#1B573C",
    light: "#4B9B70",
    dark: "#1B573C",
    subtle: "#E8F3ED",
  },
  secondary: {
    DEFAULT: "#202421",      // Charcoal
    light: "#737A75",        // Muted grey
    dark: "#171A18",
  },
  surface: {
    DEFAULT: "#FFFFFF",
    secondary: "#F1F2EF",
    background: "#F7F7F5",
    dark: "#202522",
    darkSecondary: "#282E2A",
    darkBackground: "#171A18",
  },
  border: {
    DEFAULT: "#E3E6E1",
    dark: "#343B36",
    focused: "#236B4A",
  },
  text: {
    primary: "#202421",
    secondary: "#737A75",
    darkPrimary: "#F1F3F0",
    darkSecondary: "#A6AEA8",
    inverse: "#FFFFFF",
  },
  bubbles: {
    sentLight: "#E8F3ED",
    sentLightText: "#202421",
    receivedLight: "#FFFFFF",
    receivedLightText: "#202421",
    sentDark: "#24382D",
    sentDarkText: "#F1F3F0",
    receivedDark: "#202522",
    receivedDarkText: "#F1F3F0",
  },
  status: {
    online: "#27834A",
    offline: "#737A75",
    busy: "#C0392B",
    away: "#B7791F",
  },
  semantic: {
    success: "#27834A",
    warning: "#B7791F",
    warningDark: "#D6A34D",
    error: "#C0392B",
    errorDark: "#E06A63",
    links: "#236B4A",
  },
};

export const BREAKPOINTS = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
};

export const SPACING = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
};

export const RADIUS = {
  sm: "6px",
  md: "8px",
  lg: "12px",
  full: "9999px",
};
