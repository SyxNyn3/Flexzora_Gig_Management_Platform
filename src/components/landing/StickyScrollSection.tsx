import React from "react";
import { StickyScroll } from "@/components/ui/sticky-scroll-reveal";

const content = [
  {
    title: "Smart Scheduling",
    description:
      "Never double-book again. Our unified calendar intelligently detects conflicts and syncs across all your connected company platforms, ensuring you're always where you need to be.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/3760067/pexels-photo-3760067.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Calendar with scheduling"
        />
      </div>
    ),
  },
  {
    title: "Financial Tracking",
    description:
      "Effortlessly manage your income and expenses. Track every payment, categorize spending, and generate professional invoices and tax-ready reports, all in one place.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/669615/pexels-photo-669615.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Financial dashboard"
        />
      </div>
    ),
  },
  {
    title: "Seamless Company Integrations",
    description:
      "Connect directly with the production companies you already work with. Sync schedules, receive gig offers, and manage communications from platforms like Rhino Staging, Giglife, and more.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Company integrations"
        />
      </div>
    ),
  },
  {
    title: "Showcase Your Portfolio",
    description:
      "Build a stunning online portfolio directly within FlexZora. Highlight your best projects, skills, and certifications to attract new opportunities and impress potential clients.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Digital portfolio"
        />
      </div>
    ),
  },
  {
    title: "Advanced Gig Discovery",
    description:
      "Find your next big opportunity with powerful search and filtering options. Discover gigs tailored to your skills, location, and availability, ensuring the perfect match every time.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Gig search interface"
        />
      </div>
    ),
  },
  {
    title: "Secure Payments",
    description:
      "Get paid on time, every time. Our secure payment system integrates with Stripe to ensure smooth transactions, automatic invoicing, and complete financial transparency for both workers and companies.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Secure payment processing"
        />
      </div>
    ),
  },
];

export function StickyScrollSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Discover How FlexZora Works
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Explore our powerful features designed to streamline your freelance career
          </p>
        </div>
        
        <StickyScroll content={content} />
      </div>
    </section>
  );
}