/**
 * Typed content registry — single source of truth for all section copy.
 *
 * Rules:
 * - Strings with "[INPUT: …]" are real copy — Nate fills them; they render as-is.
 * - Icons stay in component files, mapped by array index.
 * - siteConfig (site.ts) remains the source for name / domain / email.
 * - problemSolution and deliveryModels interfaces are kept for type safety but
 *   their registry entries are removed — those sections are cut from all pages.
 */

// ---------------------------------------------------------------------------
// Section interfaces
// ---------------------------------------------------------------------------

export interface HeroContent {
  badge: string;
  headline: string;
  subheadline: string;
  ctaPrimary: string;
  ctaSecondary: string;
  proofPoints: [string, string, string];
}

export interface StepItem {
  step: string;
  title: string;
  description: string;
}

export interface HowItWorksContent {
  eyebrow: string;
  title: string;
  description: string;
  items: [StepItem, StepItem, StepItem];
}

export interface UseCaseItem {
  tag: string;
  title: string;
  description: string;
}

export interface UseCasesContent {
  eyebrow: string;
  title: string;
  description: string;
  items: [UseCaseItem, UseCaseItem, UseCaseItem, UseCaseItem];
}

export interface ContactHighlightItem {
  title: string;
  description: string;
}

export interface ContactSectionContent {
  eyebrow: string;
  title: string;
  description: string;
  highlights: [ContactHighlightItem, ContactHighlightItem, ContactHighlightItem];
}

export interface PastWorkItem {
  title: string;
  outcome: string;
  link?: string;
}

export interface PastWorkContent {
  eyebrow: string;
  title: string;
  description: string;
  items: PastWorkItem[];
  holdingState: HoldingState;
}

export interface ReviewItem {
  quote: string;
  author: string;
  role: string;
  company: string;
}

export interface ReviewsContent {
  eyebrow: string;
  title: string;
  description: string;
  items: ReviewItem[];
  holdingState: HoldingState;
}

export interface PricingTier {
  id?: string;
  name: string;
  price: string;
  description: string;
  features: string[];
}

export interface PricingContent {
  eyebrow: string;
  title: string;
  description: string;
  tiers: PricingTier[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqContent {
  eyebrow: string;
  title: string;
  description: string;
  items: FaqItem[];
}

export interface FounderItem {
  name: string;
  roleLine: string;
  photo?: string;
  bio: string;
  credentials: string[];
}

export interface AboutContent {
  eyebrow: string;
  title: string;
  description: string;
  founders: [FounderItem, FounderItem];
  whyBcns: string;
}

export interface NavCardItem {
  title: string;
  description: string;
  href: string;
}

export interface NavCardsContent {
  items: [NavCardItem, NavCardItem, NavCardItem, NavCardItem];
}

export interface HoldingState {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface PageMeta {
  title: string;
  description: string;
}

export interface PageMetaRegistry {
  home: PageMeta;
  services: PageMeta;
  work: PageMeta;
  pricing: PageMeta;
  about: PageMeta;
}

export interface SiteContent {
  hero: HeroContent;
  howItWorks: HowItWorksContent;
  useCases: UseCasesContent;
  contactSection: ContactSectionContent;
  pastWork: PastWorkContent;
  reviews: ReviewsContent;
  pricing: PricingContent;
  faq: FaqContent;
  about: AboutContent;
  navCards: NavCardsContent;
  pageMeta: PageMetaRegistry;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const siteContent: SiteContent = {
  hero: {
    badge: "Custom software for local businesses",
    headline: "Software built around how your business already works",
    subheadline:
      "Off-the-shelf tools make you change your process. We build tools that fit it — scoped, quoted, and delivered.",
    ctaPrimary: "Book a free consult",
    ctaSecondary: "See what we build",
    proofPoints: [
      "Fixed quote before work starts",
      "You own everything we build",
      "Free 30-minute consult",
    ],
  },

  howItWorks: {
    eyebrow: "The process",
    title: "Three steps from first call to finished tool",
    description: "You'll know the price and the plan before anything gets built.",
    items: [
      {
        step: "01",
        title: "Free consult",
        description:
          "A 30-minute conversation about how your business runs and where the friction is. No jargon.",
      },
      {
        step: "02",
        title: "Scope & quote",
        description:
          "We write up exactly what we'll build, what it costs, and when it lands. You approve first.",
      },
      {
        step: "03",
        title: "Build & handoff",
        description:
          "We build it, walk your team through it, and include [INPUT: support window] of fixes. You own the result.",
      },
    ],
  },

  useCases: {
    eyebrow: "What we build",
    title: "Tools shaped to your business, not the other way around",
    description:
      "Four kinds of problems we solve most — if yours isn't here, ask anyway.",
    items: [
      {
        tag: "Bookings",
        title: "Scheduling & booking systems",
        description:
          "Take appointments the way you already do — deposits, reminders, and a calendar that matches your real workflow.",
      },
      {
        tag: "Operations",
        title: "Inventory & back-office automation",
        description:
          "Replace the spreadsheet juggling: ordering, invoicing, and tracking that update themselves.",
      },
      {
        tag: "Insight",
        title: "Dashboards & reporting",
        description:
          "One screen that shows how the business is doing — sales, costs, trends — without exporting anything.",
      },
      {
        tag: "AI",
        title: "AI consulting",
        description:
          "A working session to find where AI actually saves you time, then set it up with you. Priced per day.",
      },
    ],
  },

  contactSection: {
    eyebrow: "Get in touch",
    title: "Tell us what's slowing you down",
    description:
      "Send a few sentences about your business and the problem. We'll reply within [INPUT: response-time promise] with next steps — and honest advice, even if that advice is \"you don't need custom software.\"",
    highlights: [
      {
        title: "Free consult",
        description:
          "A 30-minute call about how your business runs. No pitch, no obligation.",
      },
      {
        title: "Fixed quote",
        description: "You approve the exact price before any work starts.",
      },
      {
        title: "You own it",
        description:
          "Code, accounts, and data are yours, working with us or not.",
      },
    ],
  },

  pastWork: {
    eyebrow: "Past work",
    title: "Past work",
    description: "What we've built, and what it changed for the businesses using it.",
    items: [],
    holdingState: {
      title: "Our first builds are in progress",
      body: "We're building for our first clients right now. Case studies land here as projects wrap — each covering the problem, what we built, and what changed.",
      ctaLabel: "Want to be one of them? Book a free consult.",
      ctaHref: "/#contact",
    },
  },

  reviews: {
    eyebrow: "Reviews",
    title: "Reviews",
    description: "What our clients say.",
    items: [],
    holdingState: {
      title: "Reviews will live here too",
      body: "Real names, real businesses, unedited — as soon as our first clients have something to say.",
      ctaLabel: "Want to be one of them? Book a free consult.",
      ctaHref: "/#contact",
    },
  },

  pricing: {
    eyebrow: "Pricing",
    title: "Two build sizes, one day rate — quoted before we start",
    description:
      "Every project gets a fixed quote up front. The tiers show typical scope; your quote depends on the consult.",
    tiers: [
      {
        name: "Starter build",
        price: "[INPUT: starter price range]",
        description:
          "A single-purpose tool: a booking page, a report generator, one automation.",
        features: [
          "One core workflow, built end to end",
          "Delivered in [INPUT: starter turnaround]",
          "[INPUT: support window] of included fixes",
        ],
      },
      {
        name: "Full build",
        price: "[INPUT: full-build price range]",
        description:
          "A system your business runs on: multiple workflows, logins, data that stays in sync.",
        features: [
          "Multiple connected workflows",
          "Delivered in [INPUT: full-build turnaround]",
          "[INPUT: support window] of included fixes",
        ],
      },
      {
        name: "AI consulting",
        price: "[INPUT: day rate] / day",
        description:
          "Working sessions to find and set up AI where it pays for itself.",
        features: [
          "Audit of where AI fits your operation",
          "Hands-on setup, not a slide deck",
          "Plain-English handoff notes",
        ],
      },
    ],
  },

  faq: {
    eyebrow: "FAQ",
    title: "The questions we'd ask too",
    description: "Anything else — ask in the form and we'll answer straight.",
    items: [
      {
        question: "How much will my project cost?",
        answer:
          "Every project gets a fixed quote after the free consult. Typical starter builds run [INPUT: starter range]; full builds [INPUT: full range]. The quote is the price — no hourly surprises.",
      },
      {
        question: "How long does a build take?",
        answer:
          "[INPUT: typical turnaround summary]. You get a delivery date with the quote, and we tell you immediately if anything threatens it.",
      },
      {
        question: "What happens if something breaks after delivery?",
        answer:
          "Every build includes [INPUT: support window] of fixes at no charge. After that, we're a message away.",
      },
      {
        question: "Do I need to be technical to work with you?",
        answer:
          "No. We ask about your business, not your tech. Everything comes with a plain-English walkthrough.",
      },
    ],
  },

  about: {
    eyebrow: "About",
    title: "The people behind bcns",
    description: "Two founders — one builds, one makes sure it's worth building.",
    founders: [
      {
        name: "Nate Seluga",
        roleLine: "Engineering",
        photo: "[INPUT: photo]",
        bio: "what he builds and why custom tools for small businesses; [INPUT: 1-2 notable projects with concrete outcomes]; builder-first — school is a credential, not the lead.",
        credentials: [
          "Computer science, Harvey Mudd College",
          "[INPUT: credential 2]",
          "[INPUT: credential 3]",
        ],
      },
      {
        name: "Brandon Chung",
        roleLine: "Business & clients",
        photo: "[INPUT: photo]",
        bio: "[INPUT: business experience summary]; owns scoping, communication, and making sure every build serves the business.",
        credentials: [
          "[INPUT: NYU program] , New York University",
          "[INPUT: credential 2]",
          "[INPUT: credential 3]",
        ],
      },
    ],
    whyBcns:
      "[INPUT: 2-3 sentences — why you two started bcns and what you want it to be]",
  },

  navCards: {
    items: [
      {
        title: "What we build",
        description:
          "Booking systems, dashboards, automations, and AI consulting — the problems we solve and how.",
        href: "/services",
      },
      {
        title: "Past work",
        description:
          "What we've built, and what it changed for the businesses using it.",
        href: "/work",
      },
      {
        title: "Pricing",
        description:
          "Two build sizes and a day rate for AI consulting — and how quoting works.",
        href: "/pricing",
      },
      {
        title: "About",
        description:
          "Two founders — one builds, one makes sure it's worth building.",
        href: "/about",
      },
    ],
  },

  pageMeta: {
    home: {
      title: "[INPUT: meta/home-title]",
      description: "[INPUT: meta/home-description]",
    },
    services: {
      title: "[INPUT: meta/services-title]",
      description: "[INPUT: meta/services-description]",
    },
    work: {
      title: "[INPUT: meta/work-title]",
      description: "[INPUT: meta/work-description]",
    },
    pricing: {
      title: "[INPUT: meta/pricing-title]",
      description: "[INPUT: meta/pricing-description]",
    },
    about: {
      title: "[INPUT: meta/about-title]",
      description: "[INPUT: meta/about-description]",
    },
  },
};
