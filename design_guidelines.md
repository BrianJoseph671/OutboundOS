# Outbound OS - Design Guidelines

## Design Approach

**Selected Approach:** Design System - Modern SaaS Productivity Tool

**Primary References:** Linear (clean data density), Notion (organized hierarchy), Attio (modern CRM aesthetics)

**Justification:** This is a utility-focused, information-dense productivity application where efficiency and clarity are paramount. The design should prioritize scannable data tables, clear form hierarchies, and minimal visual distraction.

**Core Principles:**
- Data clarity over decoration
- Scannable hierarchies with strong typographic contrast
- Generous whitespace to prevent cognitive overload
- Purposeful use of borders and dividers for data organization
- Subtle, functional animations only where they aid comprehension

---

## Typography

**Font Families:**
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono for data fields, IDs, tags

**Hierarchy:**
- Page Headers: text-2xl font-semibold (32px)
- Section Headers: text-lg font-medium (18px)
- Card/Panel Titles: text-base font-medium (16px)
- Body Text: text-sm (14px)
- Labels/Metadata: text-xs text-muted-foreground (12px)
- Data Tables: text-sm with tabular-nums

**Weight Distribution:** Use font-medium for headers, font-normal for body, font-semibold sparingly for critical CTAs

---

## Layout System

**Spacing Units:** Tailwind units of **2, 4, 6, 8, 12, 16** (e.g., p-4, gap-6, mt-8)
- Component padding: p-4 to p-6
- Section spacing: space-y-8 to space-y-12
- Card gaps: gap-4
- Form fields: space-y-4

**Grid Structure:**
- Left navigation: Fixed 240px width (w-60)
- Main content: flex-1 with max-w-7xl container, px-8 py-6
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6
- Data tables: Full width within container

**Vertical Rhythm:** Consistent py-6 for page sections, py-4 for card interiors

---

## Component Library

### Navigation
**Left Sidebar:**
- Fixed vertical navigation with icon + label pairs
- Active state: Subtle background with medium font weight
- Hover: Gentle background shift
- Organized in single column with py-2 spacing between items

### Dashboard Components
**Metric Cards:**
- Bordered cards with p-6 padding
- Large numerical value (text-3xl font-bold)
- Label below (text-sm text-muted-foreground)
- Optional trend indicator (small icon + percentage)

**Funnel Chart:**
- Horizontal bar visualization showing conversion stages
- Width proportional to percentage
- Clear labels at each stage
- Clean, single-colored bars with subtle gradients

**Filter Bar:**
- Horizontal row of filter controls (date picker, dropdowns, search)
- Compact design with gap-2 spacing
- Clear/reset option on the right

### Tables
**Outreach Log / Contact List:**
- Clean bordered table with hover states on rows
- Sticky header row
- Alternating row backgrounds optional for dense data
- Right-aligned action buttons (subtle ghost buttons)
- Inline editable cells with focus states
- Compact row height (py-2) for data density

**Column Design:**
- Fixed widths for dates, tags, status
- Flexible widths for names, messages
- Right-align numerical data

### Forms & Wizards
**Composer Wizard:**
- Step indicator at top (numbered circles with connecting lines)
- Single column form with generous spacing (space-y-6)
- Input groups with labels above fields
- Required field indicators
- Character count for limited fields
- Navigation buttons at bottom (Back, Next/Generate)

**Form Fields:**
- Label: text-sm font-medium mb-2
- Input: Standard height (h-10), border with focus ring
- Help text: text-xs text-muted-foreground mt-1
- Error states: Red border + error message below

### Modals & Overlays
**Add Contact Modal:**
- Centered overlay with max-w-2xl
- Header with title and close button
- Two-tab design (Manual Entry / Upload PDF)
- PDF preview section with extracted field confirmations
- Action buttons at footer (Cancel, Save)

**Message Variants Display:**
- Three-column grid showing A/B/C variants side-by-side
- Each variant in a bordered card
- Editable text area with Copy button at top-right
- "Regenerate" option above variant grid

### Data Visualization
**Recharts Integration:**
- Bar charts for performance comparison
- Line charts for trends over time
- Minimalist axis styling
- Muted grid lines
- Tooltips with detailed breakdowns

### Buttons & Actions
**Primary Actions:** Solid background, medium font weight, px-4 py-2
**Secondary Actions:** Ghost style with border
**Destructive Actions:** Red variant for delete/remove
**Icon Buttons:** Square or circular, ghost style, for table actions

### Status & Tags
**Outcome Badges:**
- Small pill-shaped badges (px-2 py-1 rounded-full)
- Semantic colors (green for positive, gray for pending, blue for responded)
- text-xs font-medium

**Tag Pills:**
- Similar to badges but with remove button (×) for editable contexts
- Displayed in flex-wrap rows with gap-2

### Empty States
**No Data Illustrations:**
- Centered content with icon (from Heroicons)
- Helpful message (text-sm text-muted-foreground)
- Primary action button below
- Maximum width max-w-sm for centered empty states

---

## Icons

**Library:** Heroicons (outline style via CDN)
**Usage:**
- Navigation icons: 20px (w-5 h-5)
- Button icons: 16px (w-4 h-4)
- Table action icons: 16px
- Empty state icons: 48px (w-12 h-12)

---

## Images

**No hero images or marketing imagery required.** This is a data-focused productivity application.

**Avatar placeholders:** Use initials in circular containers for contact list items (bg-muted with dark text)

**Empty state graphics:** Simple iconography, no complex illustrations

---

## Animations

**Minimal and Purposeful:**
- Smooth transitions on hover states (transition-colors duration-200)
- Fade-in for modals and dropdowns
- No scroll-triggered animations
- No loading spinners longer than necessary

---

## Quality Standards

This design creates a **professional, efficient workspace** optimized for rapid data entry, clear analytics review, and streamlined outreach workflows. Every element serves a functional purpose with consistent patterns that users can quickly learn and navigate confidently.