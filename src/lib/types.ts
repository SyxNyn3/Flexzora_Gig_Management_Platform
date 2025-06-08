export type UserRole = 'admin' | 'worker' | 'company';
export type GigStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type ExpenseCategory = 'travel' | 'equipment' | 'meals' | 'accommodation' | 'other';

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  phone?: string;
  location?: string;
  bio?: string;
  hourly_rate?: number;
  experience_years: number;
  portfolio_url?: string;
  linkedin_url?: string;
  is_available: boolean;
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