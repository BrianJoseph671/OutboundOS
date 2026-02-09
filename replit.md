# Outbound OS

## Overview

Outbound OS is a full-stack web application for managing structured networking outreach messages (SDR/BDR-style). It enables users to craft personalized outreach, run A/B experiments on messaging variants, and track outcomes by outreach type. The system provides a guided composer workflow for creating channel-specific messages (LinkedIn, email), contact management with LinkedIn PDF import, experiment tracking, and a dashboard with funnel metrics and success rates.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support)
- **Build Tool**: Vite with HMR for development

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API under `/api` prefix
- **File Uploads**: Multer for handling LinkedIn PDF uploads
- **PDF Parsing**: pdf-parse library for extracting contact information from LinkedIn exports

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Validation**: Zod schemas generated via drizzle-zod for runtime type validation
- **Current Storage**: In-memory storage implementation (MemStorage class) with interface ready for database migration

### Core Data Models
1. **Contacts**: Name, company, role, LinkedIn URL, email, headline, about, location, experience, education, skills, keywords, notes, tags, researchStatus, researchData (JSON string with prospectSnapshot, companySnapshot, signalsHooks[], messageDraft)
2. **Outreach Attempts**: Links to contacts/experiments, tracks outreach type, message content, and outcomes (responded, positive response, meeting booked, converted). Also includes: companyTier, responseDate, daysToResponse, followUpSent, respondedAfterFollowup for advanced analytics.
3. **Experiments**: A/B test configuration with variant labels, messages, target variable, and active status
4. **Settings**: User preferences for default tone, CTA options, email signatures, character limits

### Application Pages
- **Dashboard**: Metrics cards and performance analytics
- **Contacts**: Contact list with manual entry and LinkedIn PDF import
- **Composer**: Guided wizard for crafting structured outreach messages
- **Experiments**: A/B test management
- **Outreach Log**: History of all outreach attempts with outcome tracking
- **Research Queue**: Displays structured research results (prospect/company snapshots, signals, personalized message) from bulk research, loaded from contact.researchData
- **Settings**: Application configuration

### Design System
- Modern SaaS productivity tool aesthetic (Linear, Notion, Attio inspired)
- Inter font family with JetBrains Mono for data fields
- Consistent spacing using Tailwind units (2, 4, 6, 8, 12, 16)
- Left sidebar navigation (240px fixed width)
- Data-dense layouts with generous whitespace

## External Dependencies

### Database
- **PostgreSQL**: Primary database (configured via `DATABASE_URL` environment variable)
- **Drizzle Kit**: Database migrations in `./migrations` directory

### Third-Party Libraries
- **Radix UI**: Accessible component primitives for dialogs, dropdowns, tooltips, etc.
- **date-fns**: Date formatting and manipulation
- **class-variance-authority**: Component variant management
- **cmdk**: Command palette component
- **embla-carousel-react**: Carousel functionality
- **react-day-picker**: Calendar/date picker
- **vaul**: Drawer component
- **react-resizable-panels**: Resizable panel layouts
- **recharts**: Data visualization charts

### Development Tools
- **tsx**: TypeScript execution for development
- **esbuild**: Production bundling for server code
- **Replit plugins**: Runtime error overlay, cartographer, dev banner