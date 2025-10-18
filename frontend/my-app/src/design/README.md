# Design System

This directory contains the design system for the application.

## Design Tokens

The `tokens.css` file defines CSS custom properties (variables) that are used throughout the application for consistent styling.

### Colors
- `--color-bg`: Background color (#0b0e14)
- `--color-panel`: Panel/card background (#121722)
- `--color-border`: Border color (#1e2533)
- `--color-text`: Primary text color (#e6eefc)
- `--color-muted`: Muted text color (#93a1b0)
- `--color-primary`: Primary brand color (#7c5cff)
- `--color-positive`: Success color (#10b981)
- `--color-warning`: Warning color (#f59e0b)

### Spacing
- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-6`: 24px
- `--space-8`: 32px

### Border Radius
- `--radius-md`: 12px
- `--radius-lg`: 16px

## Usage

Import the tokens in your CSS:
```css
@import './design/tokens.css';
```

Use the tokens in your components:
```css
.my-component {
  background-color: var(--color-panel);
  padding: var(--space-4);
  border-radius: var(--radius-md);
}
```

## UI Components

The UI components are located in `src/components/ui/` and use the design tokens for consistent styling.

## Demo

Visit `/ui-demo` to see all components in action and test token overrides.
