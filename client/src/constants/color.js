// ==============================================================================
// RESTRICTED DESIGN SYSTEM COLOR PALETTE
// Mature, understated messaging palette (Deep Forest Green, Warm Off-White, Charcoal)
// PURPLE, VIOLET, INDIGO, AND GRADIENTS ARE STRICTLY PROHIBITED
// ==============================================================================

// Light Theme Tokens
export const lightBackground = "#F7F7F5";      // Warm off-white main background
export const lightSurface = "#FFFFFF";         // Primary surface
export const lightSurfaceSecondary = "#F1F2EF";// Secondary surface
export const lightText = "#202421";            // Charcoal primary text
export const lightTextSecondary = "#737A75";   // Muted grey secondary text
export const lightAction = "#236B4A";          // Deep forest green primary action
export const lightActionHover = "#1B573C";     // Primary action hover
export const lightBorder = "#E3E6E1";          // Soft grey border
export const lightBubbleSent = "#E8F3ED";      // Subtle green-tinted sent bubble
export const lightBubbleSentText = "#202421";  // High contrast charcoal text
export const lightBubbleReceived = "#FFFFFF";  // Neutral white received bubble
export const lightBubbleReceivedText = "#202421"; // Charcoal text

// Dark Theme Tokens
export const darkBackground = "#171A18";       // Main dark background
export const darkSurface = "#202522";          // Primary dark surface
export const darkSurfaceSecondary = "#282E2A"; // Secondary dark surface
export const darkText = "#F1F3F0";             // Primary light text
export const darkTextSecondary = "#A6AEA8";    // Secondary muted text
export const darkAction = "#4B9B70";           // Forest green primary action (dark)
export const darkActionHover = "#3C825D";      // Action hover (dark)
export const darkBorder = "#343B36";           // Dark border
export const darkBubbleSent = "#24382D";       // Low-contrast green-tinted sent bubble
export const darkBubbleSentText = "#F1F3F0";   // High contrast light text
export const darkBubbleReceived = "#202522";   // Neutral dark received bubble
export const darkBubbleReceivedText = "#F1F3F0"; // Light text

// Semantic Status Colors
export const successColor = "#27834A";
export const warningColor = "#B7791F";
export const errorColor = "#C0392B";
export const warningColorDark = "#D6A34D";
export const errorColorDark = "#E06A63";

// Legacy Compatibility Aliases (Mapped strictly to mature green tokens)
export const primary = lightAction;
export const primaryDark = darkAction;
export const grayColor = "#F1F2EF";
export const matBlack = "#202421";
export const bgGradient = "none";
export const purple = lightAction;             // Replaced with Forest Green
export const purpleLight = "rgba(35, 107, 74, 0.12)"; // Green tint
export const lightBlue = successColor;
export const orange = warningColor;
export const orangeLight = "rgba(183, 121, 31, 0.12)";
