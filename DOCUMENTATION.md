# Flexora Platform Documentation

## Overview

Flexora is a professional gig management platform for production and event workers. It connects freelance professionals with companies, streamlines scheduling, and manages finances in one unified platform.

## Database Schema

### Core Entities

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

## Feature Checklist

### Authentication & User Management
- [x] User registration and login
- [x] Role-based access (worker, company, admin)
- [x] Profile management
- [x] Avatar/profile picture
- [ ] Email verification
- [ ] Password reset

### Worker Features
- [x] Profile creation and management
- [x] Skill management with proficiency levels
- [x] Certification management
- [x] Availability settings
- [x] Gig discovery and application
- [x] Application tracking
- [x] Calendar integration
- [x] Expense tracking
- [x] Payment history
- [x] Company connections
- [ ] Rating and reviews
- [ ] Portfolio showcase

### Company Features
- [x] Company profile management
- [x] Gig creation and management
- [x] Worker discovery
- [x] Application review
- [x] Payment processing
- [x] Team management
- [x] Scheduling interface
- [ ] Worker ratings
- [ ] Analytics dashboard

### Gig Management
- [x] Gig creation with detailed information
- [x] Gig discovery and search
- [x] Application process
- [x] Scheduling and calendar integration
- [x] Communication system
- [x] Conflict detection
- [ ] Automated matching

### Financial Management
- [x] Payment tracking
- [x] Expense tracking
- [x] Financial dashboard
- [x] Invoice generation
- [ ] Tax reporting
- [ ] Payment processing integration

### Integrations
- [x] Email integration (Gmail)
- [x] Calendar integration
- [x] Company system integrations
- [ ] Payment processor integration
- [ ] Accounting software integration

### Communication
- [x] In-app notifications
- [x] Messaging system
- [ ] Email notifications
- [ ] SMS notifications

### Analytics & Reporting
- [x] Basic financial reporting
- [x] Schedule visualization
- [ ] Advanced analytics
- [ ] Custom reports

## Technical Architecture

### Frontend
- React with TypeScript
- React Router for navigation
- TanStack Query for data fetching
- Tailwind CSS with shadcn/ui components
- Recharts for data visualization
- React Big Calendar for calendar views

### Backend
- Supabase for authentication, database, and storage
- PostgreSQL database with RLS policies
- Supabase Edge Functions for serverless functionality
- Real-time subscriptions for notifications

### Integrations
- AuthKit for third-party service connections
- Gmail API for email integration
- Google Calendar API for calendar sync

## Testing Strategy

### Unit Tests
- [ ] Component tests with Vitest
- [ ] Hook tests
- [ ] Utility function tests

### Integration Tests
- [ ] API integration tests
- [ ] Form submission flows
- [ ] Authentication flows

### End-to-End Tests
- [ ] User registration and login
- [ ] Gig creation and application
- [ ] Payment processing
- [ ] Calendar functionality

## Deployment

- Vite for development and production builds
- Netlify for frontend hosting
- Supabase for backend services

## Development Workflow

1. Feature planning and documentation
2. Database schema updates (migrations)
3. Backend API implementation
4. Frontend component development
5. Integration and testing
6. Code review and refinement
7. Deployment

## Future Enhancements

- Mobile application
- Advanced matching algorithm
- AI-powered scheduling recommendations
- Blockchain-based payment verification
- Expanded integration ecosystem