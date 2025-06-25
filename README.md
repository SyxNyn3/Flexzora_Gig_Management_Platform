# Flexora - Professional Gig Management Platform

![Flexora Logo](https://images.pexels.com/photos/1190297/pexels-photo-1190297.jpeg?auto=compress&cs=tinysrgb&w=1200&h=400&dpr=1)

## Overview

Flexora is a comprehensive gig management platform designed specifically for freelance professionals in the production and event industry. It connects workers with companies, streamlines scheduling, and manages finances in one unified platform.

### Key Features

- **Smart Scheduling** - Unified calendar with conflict detection and automatic sync
- **Financial Tracking** - Track earnings, expenses, and generate professional invoices
- **Company Integrations** - Connect with major production companies like Rhino Staging, Giglife, and more
- **Portfolio Showcase** - Display your best work with a customizable portfolio
- **Advanced Search** - Find the perfect gigs with powerful filtering options
- **Secure Payments** - Process payments securely through Stripe integration

## Technology Stack

### Frontend
- **React** with TypeScript
- **React Router** for navigation
- **TanStack Query** for data fetching
- **Tailwind CSS** with shadcn/ui components
- **Recharts** for data visualization
- **React Big Calendar** for calendar views

### Backend
- **Supabase** for authentication, database, and storage
- **PostgreSQL** database with RLS policies
- **Supabase Edge Functions** for serverless functionality
- **Real-time subscriptions** for notifications

### Integrations
- **AuthKit** for third-party service connections
- **Gmail API** for email integration
- **Google Calendar API** for calendar sync
- **Stripe** for payment processing

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/flexora.git
cd flexora
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
```

4. Update the `.env` file with your Supabase credentials and Stripe API keys

5. Start the development server
```bash
npm run dev
```

## Database Schema

Flexora uses a comprehensive PostgreSQL database schema with the following core entities:

- **Profiles**: User profiles with role-based access (worker, company, admin)
- **Companies**: Company information and details
- **Skills**: Catalog of available skills
- **Worker Skills**: Junction table connecting workers to skills with proficiency levels
- **Certifications**: Professional certifications and licenses
- **Gigs**: Job postings and opportunities
- **Gig Applications**: Applications from workers to gigs
- **Availability**: Worker availability schedules
- **Payments**: Payment tracking and management
- **Expenses**: Expense tracking with categories
- **Notifications**: User notification system
- **Company Integrations**: External service connections
- **Calendar Events**: Scheduling and calendar management
- **Follows**: Social connections between users

## Features

### Worker Features
- Profile creation and management
- Skill management with proficiency levels
- Certification management
- Availability settings
- Gig discovery and application
- Application tracking
- Calendar integration
- Expense tracking
- Payment history
- Company connections
- Rating and reviews
- Portfolio showcase
- Invoice generation

### Company Features
- Company profile management
- Gig creation and management
- Worker discovery
- Application review
- Payment processing
- Team management
- Scheduling interface
- Worker ratings
- Analytics dashboard

### Gig Management
- Gig creation with detailed information
- Gig discovery and search
- Application process
- Scheduling and calendar integration
- Communication system
- Conflict detection
- Automated matching

### Financial Management
- Payment tracking
- Expense tracking
- Financial dashboard
- Invoice generation
- Tax reporting
- Payment processing integration

## Project Structure

```
flexora/
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   │   ├── auth/        # Authentication components
│   │   ├── dashboard/   # Dashboard components
│   │   ├── finances/    # Financial components
│   │   ├── gigs/        # Gig management components
│   │   ├── layout/      # Layout components
│   │   ├── profile/     # Profile components
│   │   ├── ui/          # UI components (shadcn/ui)
│   ├── contexts/        # React contexts
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utility functions and types
│   ├── App.tsx          # Main App component
│   ├── main.tsx         # Entry point
├── supabase/
│   ├── functions/       # Edge functions
│   ├── migrations/      # Database migrations
├── .env.example         # Example environment variables
├── package.json         # Dependencies
├── tailwind.config.js   # Tailwind configuration
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite configuration
```

## Deployment

Flexora can be deployed to various platforms:

- **Frontend**: Netlify, Vercel, or any static hosting
- **Backend**: Supabase (managed service)

## Roadmap

See the [ROADMAP.md](ROADMAP.md) file for the detailed development plan.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [StackBlitz, Inc.](https://stackblitz.com/) - Sponsor and development platform
- [Supabase](https://supabase.com/) - Backend infrastructure
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Pexels](https://www.pexels.com/) - Stock photos

---

Built with ❤️ by the Flexora Team