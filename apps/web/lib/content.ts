/**
 * Typed content registry. Single source of truth for all section copy.
 *
 * Rules:
 * - Strings with "[INPUT: ...]" are real copy. Nate fills them; they render as-is.
 * - Icons stay in component files, mapped by array index.
 * - siteConfig (site.ts) remains the source for name / domain / email.
 * - problemSolution and deliveryModels interfaces are kept for type safety but
 *   their registry entries are removed. Those sections are cut from all pages.
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

export interface ScreenshotItem {
  src: string;
  alt: string;
  caption: string;
}

export interface PastWorkItem {
  slug: string;
  title: string;
  problem: string;
  approach: string;
  outcome: string;
  screenshots: ScreenshotItem[];
  link?: string;
}

export interface CaseStudyLabels {
  backLabel: string;
  problemLabel: string;
  approachLabel: string;
  outcomeLabel: string;
}

export interface PastWorkContent {
  eyebrow: string;
  title: string;
  description: string;
  items: PastWorkItem[];
  holdingState: HoldingState;
  caseStudy: CaseStudyLabels;
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
  setup?: string;
  monthly?: string;
  seats?: string;
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
      "Off-the-shelf tools make you change your process. We build tools that fit it. Scoped, quoted, and delivered.",
    ctaPrimary: "Book a free consult",
    ctaSecondary: "See what we build",
    proofPoints: [
      "Fixed quote before work starts",
      "We host it and keep it running",
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
        title: "Build & launch",
        description:
          "We build it, launch it, and walk your team through it. From there we host, run, and maintain it, so it keeps working without you managing servers or updates.",
      },
    ],
  },

  useCases: {
    eyebrow: "What we build",
    title: "Tools shaped to your business, not the other way around",
    description:
      "Four kinds of problems we solve most. If yours isn't here, ask anyway.",
    items: [
      {
        tag: "Bookings",
        title: "Scheduling & booking systems",
        description:
          "Take appointments the way you already do, with deposits, reminders, and a calendar that matches your real workflow.",
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
          "One screen that shows how the business is doing. Sales, costs, trends. No exporting anything.",
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
      "Send a few sentences about your business and the problem. We'll reply within one business day with next steps, and honest advice, even if that advice is you don't need custom software.",
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
        title: "Your data",
        description:
          "We host and maintain the app for you. Your data is always yours, and we'll export it and hand it over whenever you ask.",
      },
    ],
  },

  pastWork: {
    eyebrow: "Past work",
    title: "Past work",
    description: "What we've built, and what it changed for the businesses using it.",
    items: [
      {
        slug: "delucas",
        title: "[INPUT: delucas case study title]",
        problem: "[INPUT: delucas problem]",
        approach: "[INPUT: delucas approach]",
        outcome: "[INPUT: delucas outcome]",
        screenshots: [],
      },
      {
        slug: "l2detailz",
        title: "[INPUT: l2detailz case study title]",
        problem: "[INPUT: l2detailz problem]",
        approach: "[INPUT: l2detailz approach]",
        outcome: "[INPUT: l2detailz outcome]",
        screenshots: [],
      },
    ],
    holdingState: {
      title: "Our first builds are in progress",
      body: "We're building for our first clients right now. Case studies land here as projects wrap. Each one covers the problem, what we built, and what changed.",
      ctaLabel: "Want to be one of them? Book a free consult.",
      ctaHref: "/#contact",
    },
    caseStudy: {
      backLabel: "Back to Work",
      problemLabel: "The problem",
      approachLabel: "Our approach",
      outcomeLabel: "The outcome",
    },
  },

  reviews: {
    eyebrow: "Reviews",
    title: "Reviews",
    description: "What our clients say.",
    items: [],
    holdingState: {
      title: "No reviews yet. That changes with our first client.",
      body: "Real names, real businesses, unedited. As soon as our first clients have something to say.",
      ctaLabel: "Want to be one of them? Book a free consult.",
      ctaHref: "/#contact",
    },
  },

  pricing: {
    eyebrow: "Pricing",
    title: "Two build sizes. A setup fee, then monthly to run it.",
    description:
      "Each build has a one-time setup fee and a flat monthly fee that covers hosting and support. You get the exact numbers in a fixed quote after the free consult.",
    tiers: [
      {
        name: "Standard build",
        price: "$1,000 setup",
        setup: "$1,000 one-time setup",
        monthly: "$149/mo",
        seats: "Includes up to 15 users, then $20/user per month.",
        description:
          "A single-purpose tool: a booking page, a report generator, one automation.",
        features: [
          "One core workflow, built end to end",
          "Delivered in about a week",
          "30 days of fixes and tweaks included",
          "One year of bug fixes, free",
        ],
      },
      {
        name: "Advanced build",
        price: "$3,000 setup",
        setup: "$3,000 one-time setup",
        monthly: "$349/mo",
        seats: "Includes up to 15 users, then $20/user per month.",
        description:
          "A system your business runs on: multiple workflows, logins, data that stays in sync.",
        features: [
          "Multiple connected workflows",
          "Delivered in two to three weeks",
          "30 days of fixes and tweaks included",
          "One year of bug fixes, free",
        ],
      },
      {
        name: "AI consulting",
        price: "$800 / day",
        description:
          "Working sessions to find and set up AI where it pays for itself.",
        features: [
          "Audit of where AI fits your operation",
          "Hands-on setup, not a slide deck",
          "Plain-English project notes",
        ],
      },
    ],
  },

  faq: {
    eyebrow: "FAQ",
    title: "The questions we'd ask too",
    description: "Anything else, ask in the form and we'll answer straight.",
    items: [
      {
        question: "How much will my project cost?",
        answer:
          "Every build has a one-time setup fee plus a flat monthly fee that keeps it running and supported. Standard builds are $1,000 setup and $149/mo. Advanced builds are $3,000 setup and $349/mo. Both include up to 15 users, then $20/user per month. You get the exact numbers in a fixed quote after the free consult. No hourly surprises.",
      },
      {
        question: "How long does a build take?",
        answer:
          "Most single tools ship in about a week. Larger connected systems take two to three weeks. You get a delivery date with the quote, and we tell you right away if anything threatens it.",
      },
      {
        question: "What happens if something breaks after delivery?",
        answer:
          "For the first 30 days, tell us anything that needs fixing or refining and we handle it, no questions asked. After that, genuine bugs in what we built stay free to fix for a year. New features, or changes to things that already work, are quoted separately.",
      },
      {
        question: "Do I need to be technical to work with you?",
        answer:
          "No. We ask about your business, not your tech. Everything comes with a plain-English walkthrough.",
      },
      {
        question: "What does the monthly fee cover?",
        answer:
          "The monthly fee keeps your tool running and cared for. It covers hosting, uptime, daily backups, security patches, bug fixes, and small tweaks along the way. We run it on our own servers, so you and your team reach it from any device with a login. You never manage a server or an update yourself.",
      },
      {
        question: "Does my tool use AI, and how does that get billed?",
        answer:
          "AI is optional. If your tool uses AI features, you bring your own Anthropic key, and Anthropic bills you directly for what those features use. You stay in control of that cost, and you can leave AI out entirely if you'd rather not use it.",
      },
      {
        question: "What happens if I stop paying the monthly fee?",
        answer:
          "Hosting stops, so the live tool goes offline. Your data is always yours. Before we shut anything down, we export your data and hand it over so you keep everything the tool held. No lock-in, no games.",
      },
    ],
  },

  about: {
    eyebrow: "About",
    title: "The people behind bcns",
    description: "Two founders. One builds, one makes sure it's worth building.",
    founders: [
      {
        name: "Nate Seluga",
        roleLine: "Engineering",
        photo: "[INPUT: photo]",
        bio: "Nate builds the tools. He cares about fast, simple, and stable, in that order. No bloat, no unnecessary dependencies, nothing that breaks six months after launch. Computer science at Harvey Mudd College.",
        credentials: [
          "Computer science, Harvey Mudd College",
        ],
      },
      {
        name: "Brandon Chung",
        roleLine: "Business & clients",
        photo: "[INPUT: photo]",
        bio: "[INPUT: business experience summary]. Brandon owns scoping, communication, and making sure every build earns its cost. He's the reason we don't build things clients don't need.",
        credentials: [
          "[INPUT: NYU program], New York University",
          "[INPUT: credential 2]",
          "[INPUT: credential 3]",
        ],
      },
    ],
    whyBcns:
      "Small businesses get two bad options. Software that doesn't fit, or a price only big companies can pay. We build the third one. Custom tools, built lean, straight from the two of us.",
  },

  navCards: {
    items: [
      {
        title: "What we build",
        description:
          "Booking systems, dashboards, automations, and AI consulting. The problems we solve and how.",
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
          "Two build sizes and a day rate for AI consulting. And how quoting works.",
        href: "/pricing",
      },
      {
        title: "About",
        description:
          "Two founders. One builds, one makes sure it's worth building.",
        href: "/about",
      },
    ],
  },

  pageMeta: {
    home: {
      title: "bcns: Custom Software for Local Businesses",
      description:
        "bcns builds custom software for local businesses. Fixed quotes, fast turnaround, and tools built around how you already work. Book a free 30-minute consult.",
    },
    services: {
      title: "What We Build | bcns",
      description:
        "Booking systems, inventory tools, dashboards, and AI consulting for local businesses. Four problem types, one studio that builds to fit your workflow.",
    },
    work: {
      title: "Past Work | bcns",
      description:
        "Case studies from bcns client builds. Each one covers the problem, what we built, and what changed. First projects in progress now.",
    },
    pricing: {
      title: "Pricing | bcns",
      description:
        "Standard builds are $1,000 setup and $149/mo. Advanced builds are $3,000 setup and $349/mo. Both include up to 15 users, then $20/user per month. AI consulting at $800 per day. Fixed quotes, no hourly surprises.",
    },
    about: {
      title: "About bcns | Two Founders, Custom Software",
      description:
        "Nate builds. Brandon makes sure it's worth building. Two founders who left generic tools behind to build custom software that fits local businesses.",
    },
  },
};
