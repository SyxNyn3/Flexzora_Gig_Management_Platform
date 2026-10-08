import { StickyScroll } from "@/components/ui/sticky-scroll-reveal";

const content = [
  {
    title: "Unified Call Sheet",
    description:
      "Every Load-In, Show Call, and Strike across every staging company in one calendar. Conflict detection flags overlapping calls before you accept them.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/3760067/pexels-photo-3760067.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Crew schedule calendar"
        />
      </div>
    ),
  },
  {
    title: "Escrow-Backed Payouts",
    description:
      "Companies fund escrow when the call is booked. Approved timesheets release payment automatically — see exactly what's queued for your next payout run.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/4386366/pexels-photo-4386366.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Escrow payment pipeline"
        />
      </div>
    ),
  },
  {
    title: "Production Company Network",
    description:
      "Connect directly with the staging companies calling you — sync rosters, receive crew offers, and keep gig comms out of your text messages.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Production team coordination"
        />
      </div>
    ),
  },
  {
    title: "Crew Card & Certifications",
    description:
      "Your ETCP Arena Rigger, OSHA-30, and Boom Lift credentials live on your profile — verified and visible to companies before the offer goes out.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Worker credentials and certifications"
        />
      </div>
    ),
  },
  {
    title: "Match Scoring",
    description:
      "Open calls rank by fit — your day rate, certifications, distance to the venue, and past ratings decide who gets surfaced first.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Gig matching interface"
        />
      </div>
    ),
  },
  {
    title: "Geofenced Timesheets",
    description:
      "Clock in from the dock at Stadium Main Stage or Ballroom C. GPS-verified hours mean faster approvals and zero disputes at settlement.",
    content: (
      <div className="h-full w-full flex items-center justify-center text-white">
        <img
          src="https://images.pexels.com/photos/669615/pexels-photo-669615.jpeg?auto=compress&cs=tinysrgb&w=800"
          className="h-full w-full object-cover"
          alt="Timesheet dashboard"
        />
      </div>
    ),
  },
];

export function StickyScrollSection() {
  return (
    <section className="py-20 border-t border-white/5 bg-zinc-900/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            How FlexZora works the call
          </h2>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            The tools that carry a show from the dock to the payout run
          </p>
        </div>

        <StickyScroll content={content} />
      </div>
    </section>
  );
}
