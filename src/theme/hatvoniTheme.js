/**
 * Hatvoni Custom MUI Theme
 * ────────────────────────────────────────────────────────
 * Maps the existing Tailwind design tokens (NE Indian
 * "Ethno-Modern Editorial" palette) to Material UI 5.
 *
 * Colour source  → tailwind.config.js
 * Font families   → index.css @import
 * Shape language → rounded / organic (NE ethnic motifs)
 */
import { createTheme, alpha } from '@mui/material/styles';

/* ── Raw colour tokens ────────────────────────────────── */
const tokens = {
  primary:                  '#004a2b',
  primaryContainer:         '#00643c',
  onPrimary:                '#ffffff',
  onPrimaryContainer:       '#8bdeab',
  onPrimaryFixed:           '#002110',
  onPrimaryFixedVariant:    '#005230',
  primaryFixed:             '#a1f4c0',
  primaryFixedDim:          '#85d8a6',
  inversePrimary:           '#85d8a6',

  secondary:                '#815500',
  secondaryContainer:       '#fcb748',
  onSecondary:              '#ffffff',
  onSecondaryContainer:     '#6f4900',
  onSecondaryFixed:         '#291800',
  onSecondaryFixedVariant:  '#624000',
  secondaryFixed:           '#ffddb2',
  secondaryFixedDim:        '#ffb94c',

  tertiary:                 '#6f272b',
  tertiaryContainer:        '#8d3e41',
  onTertiary:               '#ffffff',
  onTertiaryContainer:      '#ffbcbc',
  onTertiaryFixed:          '#3f030a',
  onTertiaryFixedVariant:   '#792e32',
  tertiaryFixed:            '#ffdad9',
  tertiaryFixedDim:         '#ffb3b3',

  error:                    '#ba1a1a',
  onError:                  '#ffffff',
  errorContainer:           '#ffdad6',
  onErrorContainer:         '#93000a',

  background:               '#fbfaf1',
  onBackground:             '#1b1c17',
  surface:                  '#fbfaf1',
  surfaceBright:            '#fbfaf1',
  surfaceDim:               '#dbdad2',
  surfaceContainerLowest:   '#ffffff',
  surfaceContainerLow:      '#f5f4eb',
  surfaceContainer:         '#efeee5',
  surfaceContainerHigh:     '#e9e8e0',
  surfaceContainerHighest:  '#e4e3da',
  onSurface:                '#1b1c17',
  onSurfaceVariant:         '#3f4942',
  inverseSurface:           '#30312b',
  inverseOnSurface:         '#f2f1e8',
  surfaceTint:              '#116c43',
  surfaceVariant:           '#e4e3da',
  outline:                  '#6f7a71',
  outlineVariant:           '#bec9bf',
};

/* ── Font stacks ──────────────────────────────────────── */
const fonts = {
  headline: '"Plus Jakarta Sans", sans-serif',
  body:     '"Inter", sans-serif',
  label:    '"Inter", sans-serif',
  brand:    '"Plus Jakarta Sans", sans-serif',
  display:  '"Rammetto One", cursive',
};

/* ── Theme Creation ───────────────────────────────────── */
const hatvoniTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main:         tokens.primary,
      light:        tokens.primaryFixedDim,
      dark:         tokens.primaryContainer,
      contrastText: tokens.onPrimary,
    },
    secondary: {
      main:         tokens.secondary,
      light:        tokens.secondaryFixedDim,
      dark:         tokens.onSecondaryContainer,
      contrastText: tokens.onSecondary,
    },
    error: {
      main:         tokens.error,
      light:        tokens.errorContainer,
      dark:         tokens.onErrorContainer,
      contrastText: tokens.onError,
    },
    warning: {
      main:         tokens.secondaryContainer,
      contrastText: tokens.onSecondaryContainer,
    },
    info: {
      main:         tokens.surfaceTint,
      contrastText: tokens.onPrimary,
    },
    success: {
      main:         tokens.primaryContainer,
      light:        tokens.primaryFixed,
      contrastText: tokens.onPrimary,
    },
    background: {
      default: tokens.background,
      paper:   tokens.surfaceContainerLowest,
    },
    text: {
      primary:   tokens.onSurface,
      secondary: tokens.onSurfaceVariant,
      disabled:  alpha(tokens.onSurface, 0.38),
    },
    divider: tokens.outlineVariant,
    action: {
      active:            tokens.onSurfaceVariant,
      hover:             alpha(tokens.primary, 0.05),
      selected:          alpha(tokens.primary, 0.08),
      disabled:          alpha(tokens.onSurface, 0.26),
      disabledBackground: alpha(tokens.onSurface, 0.12),
    },
    /* Custom tokens for direct access (theme.palette.hatvoni.*) */
    hatvoni: { ...tokens },
  },

  typography: {
    fontFamily: fonts.body,
    h1: {
      fontFamily: fonts.brand,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
    },
    h2: {
      fontFamily: fonts.brand,
      fontWeight: 700,
      letterSpacing: '-0.01em',
      lineHeight: 1.15,
    },
    h3: {
      fontFamily: fonts.brand,
      fontWeight: 700,
      lineHeight: 1.25,
    },
    h4: {
      fontFamily: fonts.headline,
      fontWeight: 700,
      lineHeight: 1.3,
    },
    h5: {
      fontFamily: fonts.headline,
      fontWeight: 600,
      lineHeight: 1.35,
    },
    h6: {
      fontFamily: fonts.headline,
      fontWeight: 600,
      lineHeight: 1.4,
    },
    subtitle1: {
      fontFamily: fonts.headline,
      fontWeight: 600,
      fontSize: '1.125rem',
      lineHeight: 1.5,
    },
    subtitle2: {
      fontFamily: fonts.headline,
      fontWeight: 600,
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    body1: {
      fontFamily: fonts.body,
      fontWeight: 400,
      fontSize: '1rem',
      lineHeight: 1.7,
    },
    body2: {
      fontFamily: fonts.body,
      fontWeight: 400,
      fontSize: '0.875rem',
      lineHeight: 1.65,
    },
    button: {
      fontFamily: fonts.headline,
      fontWeight: 700,
      textTransform: 'none',
      letterSpacing: '0.03em',
    },
    caption: {
      fontFamily: fonts.label,
      fontWeight: 500,
      fontSize: '0.75rem',
      lineHeight: 1.5,
    },
    overline: {
      fontFamily: fonts.label,
      fontWeight: 700,
      fontSize: '0.625rem',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      lineHeight: 1.5,
    },
  },

  shape: {
    borderRadius: 12, // Default NE-ethnic organic roundness
  },

  shadows: [
    'none',
    `0 1px 3px ${alpha(tokens.onSurface, 0.05)}`,
    `0 2px 6px ${alpha(tokens.onSurface, 0.06)}`,
    `0 4px 12px ${alpha(tokens.onSurface, 0.07)}`,
    `0 6px 16px ${alpha(tokens.onSurface, 0.08)}`,
    `0 8px 20px ${alpha(tokens.onSurface, 0.09)}`,
    `0 10px 24px ${alpha(tokens.onSurface, 0.1)}`,
    `0 12px 28px ${alpha(tokens.onSurface, 0.11)}`,
    `0 14px 32px ${alpha(tokens.onSurface, 0.12)}`,
    `0 16px 36px ${alpha(tokens.onSurface, 0.13)}`,
    `0 18px 40px ${alpha(tokens.onSurface, 0.14)}`,
    `0 20px 44px ${alpha(tokens.onSurface, 0.15)}`,
    `0 22px 48px ${alpha(tokens.onSurface, 0.16)}`,
    `0 24px 52px ${alpha(tokens.onSurface, 0.17)}`,
    `0 26px 56px ${alpha(tokens.onSurface, 0.18)}`,
    `0 28px 60px ${alpha(tokens.onSurface, 0.19)}`,
    `0 30px 64px ${alpha(tokens.onSurface, 0.2)}`,
    `0 32px 68px ${alpha(tokens.onSurface, 0.21)}`,
    `0 34px 72px ${alpha(tokens.onSurface, 0.22)}`,
    `0 36px 76px ${alpha(tokens.onSurface, 0.23)}`,
    `0 38px 80px ${alpha(tokens.onSurface, 0.24)}`,
    `0 40px 84px ${alpha(tokens.onSurface, 0.25)}`,
    `0 42px 88px ${alpha(tokens.onSurface, 0.26)}`,
    `0 44px 92px ${alpha(tokens.onSurface, 0.27)}`,
    `0 46px 96px ${alpha(tokens.onSurface, 0.28)}`,
  ],

  /* ── Component overrides ───────────────────────────── */
  components: {
    MuiIcon: {
      defaultProps: {
        baseClassName: 'material-symbols-outlined',
      },
    },

    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.background,
          color: tokens.onSurface,
        },
      },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 9999,
          padding: '10px 28px',
          fontSize: '0.875rem',
          transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          '&:active': {
            transform: 'scale(0.96)',
          },
        },
        containedPrimary: {
          backgroundColor: tokens.primary,
          color: tokens.onPrimary,
          '&:hover': {
            backgroundColor: alpha(tokens.primary, 0.9),
          },
        },
        containedSecondary: {
          backgroundColor: tokens.secondaryContainer,
          color: tokens.onSecondaryContainer,
          '&:hover': {
            backgroundColor: tokens.secondaryFixed,
          },
        },
        outlinedPrimary: {
          borderColor: tokens.primary,
          borderWidth: '1.5px',
          color: tokens.primary,
          '&:hover': {
            backgroundColor: tokens.primary,
            color: tokens.onPrimary,
            borderWidth: '1.5px',
          },
        },
        textPrimary: {
          color: tokens.primary,
          '&:hover': {
            backgroundColor: alpha(tokens.primary, 0.05),
          },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.3s ease',
          '&:hover': {
            backgroundColor: alpha(tokens.primary, 0.05),
          },
          '&:active': {
            transform: 'scale(0.95)',
          },
        },
      },
    },

    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${alpha(tokens.outlineVariant, 0.3)}`,
        },
        rounded: {
          borderRadius: 24,
        },
      },
    },

    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: 24,
          border: `1px solid ${alpha(tokens.outlineVariant, 0.25)}`,
          transition: 'all 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
          '&:hover': {
            boxShadow: `0 20px 40px ${alpha(tokens.primary, 0.08)}`,
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: fonts.headline,
          fontWeight: 700,
          fontSize: '0.625rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          borderRadius: 9999,
        },
        colorPrimary: {
          backgroundColor: tokens.primary,
          color: tokens.onPrimary,
        },
        colorSecondary: {
          backgroundColor: tokens.secondaryContainer,
          color: tokens.onSecondaryContainer,
        },
      },
    },

    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        fullWidth: true,
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            fontFamily: fonts.body,
            transition: 'all 0.2s ease',
            '& fieldset': {
              borderColor: alpha(tokens.outline, 0.3),
            },
            '&:hover fieldset': {
              borderColor: tokens.outline,
            },
            '&.Mui-focused fieldset': {
              borderColor: tokens.primary,
              borderWidth: '2px',
            },
          },
          '& .MuiInputLabel-root': {
            fontFamily: fonts.label,
          },
        },
      },
    },

    MuiAppBar: {
      defaultProps: {
        elevation: 0,
        color: 'transparent',
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
          border: 'none',
          backgroundColor: tokens.surface,
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 28,
          border: `1px solid ${alpha(tokens.outlineVariant, 0.2)}`,
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          fontFamily: fonts.headline,
          fontWeight: 800,
          fontSize: '0.625rem',
          minWidth: 18,
          height: 18,
        },
        colorPrimary: {
          backgroundColor: tokens.secondaryContainer,
          color: tokens.onSecondaryContainer,
        },
      },
    },

    MuiAvatar: {
      styleOverrides: {
        root: {
          fontFamily: fonts.brand,
          fontWeight: 600,
          backgroundColor: tokens.surfaceVariant,
          color: alpha(tokens.primary, 0.7),
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: fonts.headline,
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: '0.01em',
          minHeight: 48,
          transition: 'all 0.3s ease',
          '&.Mui-selected': {
            color: tokens.primary,
          },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: '3px 3px 0 0',
          backgroundColor: tokens.secondary,
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            fontFamily: fonts.headline,
            fontWeight: 700,
            fontSize: '0.6875rem',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: tokens.onSurfaceVariant,
            backgroundColor: tokens.surfaceContainerLow,
            borderBottom: `2px solid ${alpha(tokens.outlineVariant, 0.4)}`,
          },
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          fontFamily: fonts.body,
          fontSize: '0.875rem',
          borderBottom: `1px solid ${alpha(tokens.outlineVariant, 0.2)}`,
        },
      },
    },

    MuiAccordion: {
      defaultProps: {
        elevation: 0,
        disableGutters: true,
      },
      styleOverrides: {
        root: {
          borderRadius: '16px !important',
          border: `1px solid ${alpha(tokens.outlineVariant, 0.25)}`,
          marginBottom: 8,
          '&:before': { display: 'none' },
          overflow: 'hidden',
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          fontFamily: fonts.headline,
          fontWeight: 600,
          padding: '8px 24px',
          minHeight: 56,
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          fontFamily: fonts.body,
        },
        standardError: {
          backgroundColor: alpha(tokens.error, 0.06),
          color: tokens.onErrorContainer,
          border: `1px solid ${alpha(tokens.error, 0.2)}`,
        },
        standardSuccess: {
          backgroundColor: alpha(tokens.primaryContainer, 0.1),
          color: tokens.primary,
          border: `1px solid ${alpha(tokens.primaryContainer, 0.3)}`,
        },
      },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.surfaceContainerHigh,
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: alpha(tokens.outlineVariant, 0.3),
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontFamily: fonts.label,
          fontSize: '0.75rem',
          backgroundColor: tokens.inverseSurface,
          color: tokens.inverseOnSurface,
          borderRadius: 8,
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          transition: 'all 0.3s ease',
          '&.Mui-selected': {
            backgroundColor: alpha(tokens.primary, 0.05),
            color: tokens.primary,
            fontWeight: 600,
          },
        },
      },
    },
  },
});

export default hatvoniTheme;
export { tokens, fonts };
