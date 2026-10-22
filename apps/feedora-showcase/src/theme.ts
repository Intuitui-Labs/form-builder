import { Platform } from 'react-native';

/**
 * Feedora Design Tokens — exact 1:1 match with Gihini's Django app:
 *   - templates/home.html (:root CSS variables)
 *   - static/css/auth.css (--brand-* variables)
 *   - static/css/survey_format.css (instrument serif & inter typography)
 */
export const colors = {
  // Canvas & Surfaces (warm editorial paper aesthetic)
  canvas: '#FAFAF7',
  paper: '#FFFFFF',
  hover: '#F4F4EE',
  line: '#E8E8E0',

  // Typography Inks
  ink: '#14140F',
  muted: '#6B6B62',
  // Keep secondary labels readable on paper and canvas surfaces (WCAG AA text contrast).
  faint: '#6B6B62',

  // Her signature Feedora Purple (home.html --purple)
  primary: '#7F77DD',
  primaryDeep: '#534AB7',
  primarySoft: '#EEEDFE',
  primaryMid: '#AFA9EC',

  // Her Green / Success / Good Adoption (home.html --green)
  green: '#0F6E56',
  greenLight: '#E1F5EE',
  teal: '#0F6E56',
  tealSoft: '#E1F5EE',

  // Her Amber / Bronze / Moderate Adoption (home.html --amber)
  amber: '#854F0B',
  amberLight: '#FAEEDA',
  gold: '#854F0B',
  goldSoft: '#FAEEDA',

  // Her Brand Olive (auth.css --brand-olive)
  olive: '#4A5C2F',
  oliveDark: '#3A4A24',
  oliveLight: '#EDF2E6',

  // System status
  rose: '#DC2626',
  roseSoft: '#FEE2E2',
  slate: '#4B5563',
  slateSoft: '#F3F4F6',
} as const;

export const radii = {
  small: 8,
  medium: 12,
  large: 18,
  pill: 100,
} as const;

/** Level progression palette — aligned with her level curve (levels 1-5). */
export const levelColors = [
  '#A3A39A', // L1 New Voice
  '#7F77DD', // L2 Contributor
  '#534AB7', // L3 Active Member
  '#0F6E56', // L4 Trusted Respondent
  '#854F0B', // L5 Community Champion
] as const;

/** Serif display font for brand headings — exact Gihini font pairing */
export const serifFont = Platform.select({
  web: "'DM Serif Display', Georgia, serif",
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia',
});

/** Clean body sans font */
export const sansFont = Platform.select({
  web: "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});
