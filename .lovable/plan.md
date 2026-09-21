# Finish named theme controls

## Changes
- Add a Theme style selector beneath Light/Dark/System using visual preview chips for Default, Midnight, Sunset, Forest, Ocean, and Mono.
- Add an Auto accent option so each named theme can use its native primary colour while preserving all existing accent choices.
- Update the live preview label and appearance to reflect the active mode, theme style, and accent combination.
- Keep profile, notification, preference, account, routing, and data behavior unchanged.

## Technical details
- Reuse `ThemeStyle`, `THEME_STYLES`, `themeStyle`, and `setThemeStyle` already present in the theme provider.
- Use existing semantic design tokens and the named-theme CSS blocks already defined in the global stylesheet.
- Verify the settings page builds and renders correctly.
