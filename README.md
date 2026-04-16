# Ona-com-open-source

An open-source, high-fidelity clone of the [Ona](https://ona.com) marketing web app. This project is built using a modern, scalable tech stack centered around Next.js 15 and is designed to serve as a robust foundation for marketing sites and SaaS applications.

## 🚀 Overview

**Ona-com-open-source** is a "marketing app clone" that leverages the latest features of the Next.js App Router. It provides a branded experience with localized routing, a type-safe database layer, and a comprehensive suite of development tools.

### Key Features

- **Next.js 15 (App Router):** Utilizing the latest React 19 features and server components.
- **Tailwind CSS 4:** Modern, utility-first styling for a fast and responsive UI.
- **Internationalization (i18n):** Multi-language support (`en`, `fr`) powered by `next-intl`.
- **Database Integration:** Type-safe database operations using **Drizzle ORM** with **PGlite** for a seamless local development experience (no external database required for local dev).
- **Authentication Scaffolding:** Pre-configured routes for `/sign-in` and `/sign-up` (integratable with Clerk).
- **Quality Tooling:** 
  - **Testing:** Vitest for unit/integration tests and Playwright for E2E testing.
  - **Storybook:** Isolated component development and documentation.
  - **Linting & Formatting:** ESLint (Antfu configuration) and Prettier.
- **Security:** Integrated with Arcjet for rate limiting and bot protection.
- **Monitoring:** Sentry and PostHog integration for error tracking and analytics.

## 🛠️ Tech Stack

| Category | Technology |
| :--- | :--- |
| **Framework** | [Next.js 15](https://nextjs.org/) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **Database** | [PGlite](https://pglite.dev/) (Local), PostgreSQL (Remote) |
| **Auth** | [Clerk](https://clerk.com/) (Optional) |
| **Testing** | [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) |
| **UI Components** | [Storybook](https://storybook.js.org/) |

## 📥 Installation

Follow these steps to get the project running on your local machine.

### Prerequisites

- **Node.js 22+**
- **npm** (or your preferred package manager)

### Step 1: Clone the Repository

```bash
git clone https://github.com/Sjdjdiejdrirhdkjej/Ona-com-open-source.git
cd Ona-com-open-source
```

### Step 2: Install Dependencies

```bash
npm install
```

## ⚙️ Setup & Configuration

### Environment Variables

The project uses `@t3-oss/env-nextjs` for type-safe environment variables. 

1. Create a `.env.local` file in the root directory.
2. Add your sensitive configuration values.

Example `.env.local`:
```env
# Database (Defaults to PGlite if not provided)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key
CLERK_SECRET_KEY=your_secret_key

# Analytics (PostHog)
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Security (Arcjet)
ARCJET_KEY=your_arcjet_key
```

### Database Setup

By default, the project uses **PGlite**, which runs a PostgreSQL-compatible database in-memory or as a local file. No additional setup is required for local development.

To update the schema:
1. Modify `src/models/Schema.ts`.
2. Generate migrations: `npm run db:generate`.
3. Migrations are applied automatically during development.

## 💻 Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5000` (Note: default port is 5000 as per `package.json`).

### Useful Commands

- `npm run build` - Create an optimized production build.
- `npm run start` - Start the production server.
- `npm run lint` - Run ESLint checks.
- `npm run test` - Run unit tests with Vitest.
- `npm run test:e2e` - Run end-to-end tests with Playwright.
- `npm run storybook` - Launch Storybook for component exploration.

## 📂 Project Structure

```text
.
├── .github          # GitHub Actions & Workflows
├── .storybook       # Storybook Configuration
├── migrations       # Database Migrations
├── public           # Static Assets (Images, Icons)
├── src
│   ├── app          # Next.js App Router (Pages & APIs)
│   ├── components   # Reusable UI Components
│   ├── libs         # Third-party Library Configurations
│   ├── locales      # i18n Translation Files
│   ├── models       # Database Schema & Models
│   ├── styles       # Global CSS & Tailwind Styles
│   ├── templates    # Layout Templates
│   ├── types        # TypeScript Definitions
│   └── utils        # Helper Functions & App Config
└── tests            # E2E and Integration Tests
```

## 📜 Credits

This project was originally scaffolded from the [Next.js Boilerplate](https://github.com/ixartz/Next-js-Boilerplate) by [Ixartz](https://github.com/ixartz).

---

Built with ❤️ by the Ona-com-open-source contributors.
