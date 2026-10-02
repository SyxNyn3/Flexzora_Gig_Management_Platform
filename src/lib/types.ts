export type UserRole = 'admin' | 'worker' | 'company';
export type GigStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type ExpenseCategory = 'travel' | 'equipment' | 'meals' | 'accommodation' | 'other';
export type IntegrationStatus = 'connected' | 'pending' | 'error' | 'disconnected';
export type WaitlistRoleInterest = 'worker' | 'company';
export type WaitlistStatus = 'pending' | 'whitelisted' | 'invited' | 'verified';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'id' | 'created_at' | 'updated_at'>;
        Update: { [K in keyof Omit<Profile, 'id' | 'created_at' | 'updated_at'>]?: Profile[K] | null };
      };
      companies: {
        Row: Company;
        Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Company, 'id' | 'created_at' | 'updated_at'>>;
      };
      skills: {
        Row: Skill;
        Insert: Omit<Skill, 'id' | 'created_at'>;
        Update: Partial<Omit<Skill, 'id' | 'created_at'>>;
      };
      worker_skills: {
        Row: WorkerSkill;
        Insert: Omit<WorkerSkill, 'id' | 'created_at'>;
        Update: Partial<Omit<WorkerSkill, 'id' | 'created_at'>>;
      };
      certifications: {
        Row: Certification;
        Insert: Omit<Certification, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Certification, 'id' | 'created_at' | 'updated_at'>>;
      };
      gigs: {
        Row: Gig;
        Insert: Omit<Gig, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Gig, 'id' | 'created_at' | 'updated_at'>>;
      };
      gig_applications: {
        Row: GigApplication;
        Insert: Omit<GigApplication, 'id' | 'application_date'>;
        Update: Partial<Omit<GigApplication, 'id' | 'application_date'>>;
      };
      availability: {
        Row: Availability;
        Insert: Omit<Availability, 'id' | 'created_at'>;
        Update: Partial<Omit<Availability, 'id' | 'created_at'>>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>;
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Expense, 'id' | 'created_at' | 'updated_at'>>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
      };
      company_integrations: {
        Row: CompanyIntegration;
        Insert: Omit<CompanyIntegration, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CompanyIntegration, 'id' | 'created_at' | 'updated_at'>>;
      };
      calendar_events: {
        Row: CalendarEvent;
        Insert: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>>;
      };
      waiting_list: {
        Row: WaitlistEntry;
        Insert: Omit<WaitlistEntry, 'id' | 'created_at' | 'referral_count'>;
        Update: Partial<Omit<WaitlistEntry, 'id' | 'created_at'>>;
      };
      portfolio_items: {
        Row: PortfolioItem;
        Insert: Omit<PortfolioItem, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PortfolioItem, 'id' | 'created_at' | 'updated_at'>>;
      };
      reviews: {
        Row: Review;
        Insert: Omit<Review, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Review, 'id' | 'created_at' | 'updated_at'>>;
      };
      certification_types: {
        Row: CertificationType;
        Insert: Omit<CertificationType, 'created_at'>;
        Update: Partial<Omit<CertificationType, 'code' | 'created_at'>>;
      };
      venues: {
        Row: Venue;
        Insert: Omit<Venue, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Venue, 'id' | 'created_at' | 'updated_at'>>;
      };
      overtime_rules: {
        Row: OvertimeRule;
        Insert: Omit<OvertimeRule, 'id' | 'created_at'>;
        Update: Partial<Omit<OvertimeRule, 'id' | 'created_at'>>;
      };
      events: {
        Row: ProductionEvent;
        Insert: Omit<ProductionEvent, 'id' | 'created_at' | 'updated_at' | 'venue' | 'company' | 'shifts'>;
        Update: Partial<Omit<ProductionEvent, 'id' | 'created_at' | 'updated_at' | 'venue' | 'company' | 'shifts'>>;
      };
      shifts: {
        Row: Shift;
        Insert: Omit<Shift, 'id' | 'created_at' | 'updated_at' | 'event' | 'skill' | 'assignments'>;
        Update: Partial<Omit<Shift, 'id' | 'created_at' | 'updated_at' | 'event' | 'skill' | 'assignments'>>;
      };
      shift_assignments: {
        Row: ShiftAssignment;
        Insert: Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'timesheet'>;
        Update: Partial<Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'timesheet'>>;
      };
      preferred_rosters: {
        Row: PreferredRosterEntry;
        Insert: Omit<PreferredRosterEntry, 'id' | 'created_at' | 'worker'>;
        Update: Partial<Omit<PreferredRosterEntry, 'id' | 'created_at' | 'worker'>>;
      };
      timesheets: {
        Row: Timesheet;
        Insert: Omit<Timesheet, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'assignment'>;
        Update: Partial<Omit<Timesheet, 'id' | 'created_at' | 'updated_at' | 'shift' | 'worker' | 'assignment'>>;
      };
      escrow_deposits: {
        Row: EscrowDeposit;
        Insert: Omit<EscrowDeposit, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<EscrowDeposit, 'id' | 'created_at' | 'updated_at'>>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at' | 'event' | 'company' | 'worker' | 'payout'>;
        Update: Partial<Omit<Invoice, 'id' | 'created_at' | 'event' | 'company' | 'worker' | 'payout'>>;
      };
      payouts: {
        Row: Payout;
        Insert: Omit<Payout, 'id' | 'created_at' | 'updated_at' | 'invoice'>;
        Update: Partial<Omit<Payout, 'id' | 'created_at' | 'updated_at' | 'invoice'>>;
      };
    };
  };
}

export interface Profile {
  id: string;
  user_id?: string;
  email: string;
  full_name: string;
  username?: string;
  avatar_url?: string;
  role?: UserRole;
  phone?: string;
  location?: string;
  bio?: string;
  hourly_rate?: number;
  experience_years?: number;
  portfolio_url?: string;
  linkedin_url?: string;
  portfolio_items?: PortfolioItem[];
  is_available?: boolean;
  latitude?: number;
  longitude?: number;
  travel_radius_km?: number;
  day_rate?: number;
  stripe_connect_account_id?: string;
  payouts_enabled?: boolean;
  average_rating?: number;
  review_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItem {
  id: string;
  worker_id: string;
  title: string;
  description?: string;
  url?: string;
  image_url?: string;
  category?: string;
  date_completed?: string;
  client?: string;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  gig_id?: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  description?: string;
  website_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  logo_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category?: string;
  description?: string;
  created_at: string;
}

export interface WorkerSkill {
  id: string;
  worker_id: string;
  skill_id: string;
  proficiency_level: number;
  years_experience: number;
  created_at: string;
  skill?: Skill;
}

export interface Certification {
  id: string;
  worker_id: string;
  name: string;
  issuing_organization?: string;
  issue_date?: string;
  expiration_date?: string;
  credential_id?: string;
  credential_url?: string;
  cert_type_code?: string;
  verified?: boolean;
  verified_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Gig {
  id: string;
  title: string;
  description: string;
  company_id: string;
  created_by: string;
  location: string;
  start_date: string;
  end_date: string;
  hourly_rate?: number;
  total_budget?: number;
  status: GigStatus;
  required_workers: number;
  skills_required?: string[];
  equipment_provided?: string[];
  special_requirements?: string;
  is_remote: boolean;
  contact_info?: any;
  created_at: string;
  updated_at: string;
  company?: Company;
  creator?: Profile;
}

export interface GigApplication {
  id: string;
  gig_id: string;
  worker_id: string;
  status: ApplicationStatus;
  cover_letter?: string;
  proposed_rate?: number;
  application_date: string;
  response_date?: string;
  notes?: string;
  gig?: Gig;
  worker?: Profile;
}

export interface Availability {
  id: string;
  worker_id: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  notes?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  gig_id: string;
  worker_id: string;
  company_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  due_date?: string;
  paid_date?: string;
  invoice_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  gig?: Gig;
  worker?: Profile;
}

export interface Expense {
  id: string;
  worker_id: string;
  gig_id?: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  expense_date: string;
  receipt_url?: string;
  is_reimbursable: boolean;
  is_tax_deductible: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  gig?: Gig;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  action_url?: string;
  metadata?: any;
  created_at: string;
}

export interface CompanyIntegration {
  id: string;
  worker_id: string;
  company_name: string;
  integration_type: string;
  status: IntegrationStatus;
  credentials?: any;
  settings: any;
  last_sync?: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  event_type: 'gig' | 'note' | 'reminder';
  start_time: string;
  end_time?: string;
  all_day: boolean;
  color: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  role_interest: WaitlistRoleInterest;
  production_companies_worked_with?: string;
  past_communication_methods?: string;
  desired_features?: string;
  challenges?: string;
  referred_by_email?: string;
  referral_code: string;
  created_at: string;
  status: WaitlistStatus;
  referral_count: number;
  market_city?: string;
  crew_roles: string[];
  company_type?: string;
  events_per_month: number | null;
  typical_crew_size: number | null;
  pain_points: string[];
  beta_tester: boolean;
  heard_from?: string;
  utm_source?: string;
  notes?: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Form types
export interface ProfileFormData {
  full_name: string;
  username?: string;
  phone?: string;
  location?: string;
  bio?: string;
  hourly_rate?: number;
  experience_years?: number;
  portfolio_url?: string;
  linkedin_url?: string;
  portfolio_items?: PortfolioItem[];
}

export interface GigFormData {
  title: string;
  description: string;
  company_id: string;
  location: string;
  start_date: string;
  end_date: string;
  hourly_rate?: number;
  total_budget?: number;
  required_workers: number;
  skills_required?: string[];
  equipment_provided?: string[];
  special_requirements?: string;
  is_remote: boolean;
}

export interface ApplicationFormData {
  cover_letter?: string;
  proposed_rate?: number;
}

// Error types
export interface DatabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}
// ---------------------------------------------------------------------------
// Marketplace core (events / shifts / rosters / timesheets / escrow / invoices)
// ---------------------------------------------------------------------------
export type EventStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type EventType = 'concert' | 'corporate' | 'festival' | 'theatre' | 'broadcast' | 'sports' | 'other';
export type ShiftStatus = 'draft' | 'open' | 'filled' | 'in_progress' | 'completed' | 'cancelled';
export type AssignmentStatus =
  | 'offered'
  | 'applied'
  | 'confirmed'
  | 'declined'
  | 'rejected'
  | 'withdrawn'
  | 'no_show'
  | 'completed';
export type AssignmentSource = 'direct_book' | 'roster_broadcast' | 'public_marketplace';
export type BroadcastStage = 'none' | 'roster' | 'public';
export type TimesheetStatus = 'open' | 'submitted' | 'approved' | 'disputed' | 'paid';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';
export type PayoutStatus = 'queued' | 'processing' | 'paid' | 'failed';
export type PayoutMethod = 'ach' | 'instant';
export type EscrowStatus = 'pending' | 'funded' | 'partially_released' | 'released' | 'refunded';
export type RosterTier = 'preferred' | 'core' | 'blocked';

export interface CertificationType {
  code: string;
  name: string;
  issuing_body?: string;
  category: 'safety' | 'rigging' | 'equipment' | 'electrical' | 'medical';
  requires_expiry: boolean;
  created_at: string;
}

export interface Venue {
  id: string;
  company_id: string;
  name: string;
  address: string;
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  load_in_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface OvertimeRule {
  id: string;
  code: string;
  name: string;
  region?: string;
  daily_ot_after_hours: number | null;
  daily_dt_after_hours: number | null;
  weekly_ot_after_hours: number | null;
  ot_multiplier: number;
  dt_multiplier: number;
  minimum_call_hours: number;
  meal_penalty_after_hours: number | null;
  created_at: string;
}

export interface ProductionEvent {
  id: string;
  company_id: string;
  venue_id?: string;
  created_by?: string;
  name: string;
  event_type: EventType;
  description?: string;
  starts_on: string;
  ends_on: string;
  status: EventStatus;
  overtime_rule_code: string;
  color: string;
  /** From event_budgets; only present for the owning company. */
  budget_cap?: number;
  platform_fee_pct?: number;
  created_at: string;
  updated_at: string;
  venue?: Venue;
  company?: Company;
  shifts?: Shift[];
}

export interface Shift {
  id: string;
  event_id: string;
  title: string;
  role_name: string;
  skill_id?: string;
  min_proficiency: number;
  required_cert_codes: string[];
  headcount: number;
  starts_at: string;
  ends_at: string;
  hourly_rate: number;
  status: ShiftStatus;
  broadcast_stage: BroadcastStage;
  roster_broadcast_at?: string;
  public_broadcast_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  event?: ProductionEvent;
  skill?: Skill;
  assignments?: ShiftAssignment[];
}

export interface MatchBreakdown {
  gatekeeperPassed: boolean;
  gatekeeperReasons: string[];
  proximity: number;
  availability: number;
  performance: number;
  roster: number;
  distanceKm: number | null;
}

export interface ShiftAssignment {
  id: string;
  shift_id: string;
  worker_id: string;
  status: AssignmentStatus;
  source: AssignmentSource;
  match_score?: number;
  match_breakdown?: MatchBreakdown;
  offered_rate?: number;
  responded_at?: string;
  confirmed_at?: string;
  created_at: string;
  updated_at: string;
  shift?: Shift;
  worker?: Profile;
  timesheet?: Timesheet;
}

export interface PreferredRosterEntry {
  id: string;
  company_id: string;
  worker_id: string;
  tier: RosterTier;
  notes?: string;
  added_by?: string;
  created_at: string;
  worker?: Profile;
}

export interface Timesheet {
  id: string;
  assignment_id: string;
  shift_id: string;
  worker_id: string;
  clock_in_at?: string;
  clock_in_lat?: number;
  clock_in_lng?: number;
  clock_in_distance_m?: number;
  clock_in_verified: boolean;
  clock_out_at?: string;
  clock_out_lat?: number;
  clock_out_lng?: number;
  clock_out_distance_m?: number;
  clock_out_verified: boolean;
  break_minutes: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  gross_pay: number;
  status: TimesheetStatus;
  worker_notes?: string;
  manager_notes?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
  shift?: Shift;
  worker?: Profile;
  assignment?: ShiftAssignment;
}

export interface EscrowDeposit {
  id: string;
  event_id: string;
  company_id: string;
  amount: number;
  released_amount: number;
  currency: string;
  status: EscrowStatus;
  stripe_payment_intent_id?: string;
  funded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  timesheet_id?: string;
  worker_id: string;
  company_id: string;
  event_id?: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  platform_fee: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  tax_year: number;
  issued_at: string;
  paid_at?: string;
  created_at: string;
  event?: ProductionEvent;
  company?: Company;
  worker?: Profile;
  payout?: Payout;
}

export interface Payout {
  id: string;
  invoice_id: string;
  worker_id: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  status: PayoutStatus;
  stripe_transfer_id?: string;
  failure_reason?: string;
  expected_arrival_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
  invoice?: Invoice;
}

export interface WorkerReliability {
  completed: number;
  no_shows: number;
  withdrawn: number;
  reliability_rate: number | null;
  avg_rating: number | null;
}

export interface EventFormData {
  name: string;
  event_type: EventType;
  description?: string;
  venue_id?: string;
  starts_on: string;
  ends_on: string;
  budget_cap?: number;
  overtime_rule_code: string;
}

export interface ShiftFormData {
  title: string;
  role_name: string;
  skill_id?: string;
  min_proficiency: number;
  required_cert_codes: string[];
  headcount: number;
  starts_at: string;
  ends_at: string;
  hourly_rate: number;
  notes?: string;
}

export interface VenueFormData {
  name: string;
  address: string;
  city?: string;
  region?: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
}

