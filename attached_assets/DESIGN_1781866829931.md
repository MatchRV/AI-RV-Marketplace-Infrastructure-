---
name: Rugged Horizon
colors:
  surface: '#f4fbfa'
  surface-dim: '#d4dbdb'
  surface-bright: '#f4fbfa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef5f4'
  surface-container: '#e8efef'
  surface-container-high: '#e2eae9'
  surface-container-highest: '#dde4e3'
  on-surface: '#161d1d'
  on-surface-variant: '#3b4949'
  inverse-surface: '#2b3232'
  inverse-on-surface: '#ebf2f2'
  outline: '#6b7a7a'
  outline-variant: '#bac9c9'
  surface-tint: '#00696b'
  primary: '#00696b'
  on-primary: '#ffffff'
  primary-container: '#00ced1'
  on-primary-container: '#005354'
  inverse-primary: '#2ddbde'
  secondary: '#595f66'
  on-secondary: '#ffffff'
  secondary-container: '#dde3ec'
  on-secondary-container: '#5f656c'
  tertiary: '#8d4f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffa54a'
  on-tertiary-container: '#6f3d00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#5af8fb'
  primary-fixed-dim: '#2ddbde'
  on-primary-fixed: '#002020'
  on-primary-fixed-variant: '#004f51'
  secondary-fixed: '#dde3ec'
  secondary-fixed-dim: '#c1c7cf'
  on-secondary-fixed: '#161c22'
  on-secondary-fixed-variant: '#41474e'
  tertiary-fixed: '#ffdcc0'
  tertiary-fixed-dim: '#ffb876'
  on-tertiary-fixed: '#2d1600'
  on-tertiary-fixed-variant: '#6b3b00'
  background: '#f4fbfa'
  on-background: '#161d1d'
  surface-variant: '#dde4e3'
  deep-teal: '#004329'
  horizon-cyan: '#00CED1'
  midnight-slate: '#0B1117'
  silver-road: '#E2E8F0'
  caution-gold: '#FFE08B'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
  container-max: 1280px
---

## Brand & Style

The design system is engineered for a premium automotive marketplace, balancing the ruggedness of outdoor adventure with the precision of a high-end brokerage. It aims to evoke confidence, reliability, and the thrill of the open road. 

The aesthetic is **Corporate / Modern** with a lean toward **Minimalism**, characterized by high-contrast typography, expansive white space, and a structural layout that prioritizes high-resolution imagery. Unlike generic consumer apps, this system utilizes heavy weights and a precise, slate-heavy palette to maintain a "heavyweight" marketplace feel suitable for high-value transactions.

## Colors

The palette is anchored by **Midnight Slate**, providing a deep, sophisticated base that replaces standard blacks for a more automotive feel. **Horizon Cyan** serves as the primary action color, derived from the logo to provide a high-energy, modern spark against the neutral background.

- **Primary:** Horizon Cyan for key actions and focus states.
- **Secondary:** Midnight Slate for primary navigation, headings, and high-contrast surfaces.
- **Neutrals:** A range of cool grays (Silver Road) to maintain a clean, airy environment that allows RV photography to stand out.
- **Accents:** Caution Gold is reserved exclusively for "New Listing" badges or critical alerts, ensuring high visibility without cluttering the premium aesthetic.

## Typography

This design system uses a dual-sans-serif approach to establish authority and readability. 

**Outfit** is utilized for headings. Its geometric construction and wide stance convey a modern, technical precision associated with high-end vehicle manufacturing. **DM Sans** is used for body copy and UI labels, chosen for its exceptional legibility at smaller scales and its understated, professional character. 

Use negative letter spacing on larger headlines to increase visual impact and "tightness."

## Layout & Spacing

The layout follows a **Fixed Grid** model on desktop to maintain a premium, editorial feel, while transitioning to a fluid model on mobile devices.

- **Grid:** 12-column grid for desktop (1280px max-width) with 24px gutters.
- **Rhythm:** A 4px baseline grid ensures vertical consistency across all components.
- **Breakpoints:**
  - **Mobile:** < 600px (4 columns, 20px margins)
  - **Tablet:** 600px - 1024px (8 columns, 32px margins)
  - **Desktop:** > 1024px (12 columns, 64px margins)

Large sections should be separated by significant vertical padding (80px - 120px) to allow the content to "breathe" and maintain a high-end feel.

## Elevation & Depth

To maintain a "rugged yet clean" look, this design system avoids heavy drop shadows. Instead, it utilizes **Tonal Layers** and **Low-contrast Outlines**.

- **Level 0 (Base):** White or Light Gray (#F8FAFC) background.
- **Level 1 (Cards/Containers):** White background with a 1px border in `Silver Road` (#E2E8F0).
- **Level 2 (Hover/Active):** A very soft, diffused shadow (0px 4px 20px rgba(11, 17, 23, 0.05)) to indicate interactivity without breaking the flat, modern aesthetic.

Depth is primarily achieved through the use of high-contrast color blocks (e.g., a Midnight Slate footer or header) rather than artificial shadows.

## Shapes

The shape language is **Soft (0.25rem)**. This subtle rounding removes the harshness of pure 90-degree angles while maintaining a disciplined, architectural feel. 

Avoid "pill" shapes for buttons or inputs to distance the brand from playful consumer apps. The square-ish corners reflect the structural integrity of the RVs themselves.

## Components

### Buttons
- **Primary:** Horizon Cyan background, Midnight Slate text, Bold weight. High contrast is mandatory.
- **Secondary:** Transparent background, Midnight Slate 2px border, Bold weight.
- **Tertiary/Ghost:** No background or border, underline on hover for navigation links.

### Listing Cards
Cards are the core of the marketplace. They feature a fixed aspect ratio (16:9) image container, followed by a tight vertical stack of: Brand/Model (Outfit Bold), Price (Horizon Cyan), and key specs (DM Sans labels with icons). Use a subtle 1px border instead of shadows.

### Input Fields
Inputs should be large and accessible (min-height 48px). Use a light gray background with a 1px border that shifts to Horizon Cyan on focus. Labels should be placed above the field in `label-bold` style.

### Filter UI
Use a "Drawer" or "Sidebar" model with clear, categorized sections. Use checkboxes for multi-select and custom range sliders for price/year filters, styled in Horizon Cyan.

### Chips/Badges
Used for vehicle features (e.g., "Solar Powered," "Low Mileage"). These should be low-contrast (Light Gray background, Slate text) to avoid competing with the Primary CTA.