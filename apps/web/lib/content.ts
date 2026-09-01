/**
 * Typed content registry. Single source of truth for all section copy.
 *
 * Rules:
 * - Strings with "[INPUT: ...]" are real copy. Nate fills them; they render as-is.
 * - Icons stay in component files, mapped by array index.
 * - siteConfig (site.ts) remains the source for name / domain / email.
 * - problemSolution and deliveryModels are gone entirely: the sections were cut
 *   from the IA, and their interfaces and stub components have been removed.
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

export interface AiConsultStep {
  step: string;
  title: string;
  description: string;
}

export interface AiConsultContent {
  eyebrow: string;
  title: string;
  description: string;
  rate: string;
  steps: [AiConsultStep, AiConsultStep, AiConsultStep];
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
  /** Industry + build type, shown as a Badge on the /work card (e.g. "Restaurant · Bookkeeping"). */
  tag: string;
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
  aiConsult: AiConsultContent;
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
    badge: "Software custom built for your business",
    headline: "We build tools around how your business already works",
    subheadline:
      "For businesses that only want to pay for what they actually need",
    ctaPrimary: "Book a free consult",
    ctaSecondary: "See what we build",
    proofPoints: [
      "We work with you to create a plan",
      "You test it, we refine it",
      "Fixed price, agreed before we start",
    ],
  },

  howItWorks: {
    eyebrow: "Our process",
    title: "From first call to your personalized product. We're here to assist at every step.",
    description: "You communicate your needs, we build you a tool that accomodates them.",
    items: [
      {
        step: "01",
        title: "The call",
        description:
          "A 30-minute conversation about how your business runs and where the friction is at no cost to you. We ask questions to help you figure out exactly what you need.",
      },
      {
        step: "02",
        title: "The plan",
        description:
          "We write up exactly what we'll build, what it costs, and when it lands. You get the chance to review it and make sure it's tailored to your exact needs.",
      },
      {
        step: "03",
        title: "The build",
        description:
          "We build it, let you test it and refine it until it's right for you. Once launched, we host it, maintain it and support your needs so you can focus on your business.",
      },
    ],
  },

  useCases: {
    eyebrow: "Our services",
    title: "Tools are meant to serve you, not complicate things further",
    description:
      "Four solutions to common business challenges. If you need something else, we're happy to accomodate you.",
    items: [
      {
        tag: "Bookings",
        title: "Scheduling & Booking Systems",
        description:
          "Automate deposits, reminders, cancellations and scheduling using the same workflows already in place.",
      },
      {
        tag: "Operations",
        title: "Inventory & Back-Office Automation",
        description:
          "Enhance your spreadsheets. Whether you want to replace or integrate them, we can help you optimize your data management.",
      },
      {
        tag: "Insight",
        title: "Dashboards & Reporting",
        description:
          "One place to hold all your business analytics. We can consolidate your data and enable you to easily generate insights that are useful to you.",
      },
      {
        tag: "Other",
        title: "Something Else",
        description:
          "Your options aren't limited to what we've done before. If you have a pain point, we can build a tool to alleviate it.",
      },
    ],
  },

  aiConsult: {
    eyebrow: "AI consulting",
    title: "How an AI consult works",
    description: "One day, spent on your business.",
    rate: "$1,000 / day",
    steps: [
      {
        step: "01",
        title: "We look at the work you already do",
        description:
          "We go through your week with you and find the parts that are repetitive, slow, or typed in twice. Most of a business does not need AI. We tell you which parts of yours do.",
      },
      {
        step: "02",
        title: "We build one of them with you watching",
        description:
          "We take the task costing you the most hours and build the workflow for it while you watch, so you see how it was put together and not just the finished thing.",
      },
      {
        step: "03",
        title: "Your team uses it on real work",
        description:
          "The rest of the day is your people running it on their own jobs, with us there when something breaks.",
      },
    ],
  },

  contactSection: {
    eyebrow: "Get in touch",
    title: "Tell us what's slowing you down",
    description:
      "Send a few sentences about your business and its pain points. We'll reply within one business day with next steps to create your custom solution.",
    highlights: [
      {
        title: "Free consult",
        description:
          "A 30-minute call about how your business runs. No obligations or cost to you.",
      },
      {
        title: "Fixed quote",
        description: "You approve the exact product and its price before any work starts.",
      },
      {
        title: "Your product",
        description:
          "We host and maintain the app for you. Your data is always yours and we'll hand it over at any time.",
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
        title: "DeLuca's revenue dashboard",
        tag: "Restaurant · Bookkeeping",
        problem:
          "He was not tracking revenue or costs. The only signal he had about the business was the amount that landed in his bank account.",
        approach:
          "A dashboard that fills itself by parsing his email and pulling the rest through direct API access. Recurring items like rent are set once as rules.",
        outcome:
          "He can see monthly revenue, spending, and what he is paying for, without doing anything to keep it current.",
        screenshots: [
          {
            src: "/case-studies/delucas-dashboard.png",
            alt: "DeLuca's dashboard showing monthly money in, spent, and profit totals above a 12-month profit bar chart and an expenses-by-category breakdown.",
            caption:
              "The monthly view: money in, money out, profit, and which categories the spending went to.",
          },
        ],
      },
      {
        slug: "l2detailz",
        title: "L2 Detailz booking site and admin",
        tag: "Auto detailing · Booking",
        problem:
          "Bookings arrived as unsorted email and the schedule was kept by hand, costing time and leaving room for error. He also could not post his own deals.",
        approach:
          "We rebuilt his HTML site as a web app with an admin login, so bookings, scheduling, and on-site promotions are managed in one place.",
        outcome:
          "He manages scheduling, routes, and site promotions in one place, without the manual hours or the room for error.",
        screenshots: [
          {
            src: "/case-studies/l2detailz-frontend.png",
            alt: "L2 Detailz marketing site showing the Essential, Signature, and Prestige detailing package cards with pricing and included services.",
            caption:
              "The public site, with the three detailing packages and what each includes.",
          },
          {
            src: "/case-studies/l2detailz-calendar.png",
            alt: "L2 Detailz admin calendar in month view with scheduled detailing jobs listed across the days of the month.",
            caption:
              "The admin calendar: every booking with its time, package, and vehicle, in month view.",
          },
        ],
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
    description: "Hear from our past clients about what it was like to work with us.",
    items: [],
    holdingState: {
      title: "No reviews yet. That changes with our first client.",
      body: "We pride ourselves on quality service and communication. We value your feedback and will share it here as soon as we have it.",
      ctaLabel: "Want to be one of them? Book a free consult.",
      ctaHref: "/#contact",
    },
  },

  pricing: {
    eyebrow: "Pricing",
    title: "We charge you for what you actually need and no more.",
    description:
      "Each build has a one-time setup fee and a flat monthly rate for hosting and maintenance.",
    tiers: [
      {
        name: "Standard build",
        price: "$3,000 setup",
        setup: "$3,000 setup",
        monthly: "$250/mo",
        seats: "Includes up to 15 users, then $20/user per month.",
        description:
          "A single-purpose tool to streamline one of your current pain points.",
        features: [
          "One core workflow, built end to end",
          "Delivered in one week",
          "30 days of fixes and tweaks included",
          "One year of bug fixes, free",
        ],
      },
      {
        name: "Advanced build",
        price: "$6,000 setup",
        setup: "$6,000 setup",
        monthly: "$500/mo",
        seats: "Includes up to 15 users, then $20/user per month.",
        description:
          "A highly technical tool or fully integrated system to manage your whole business.",
        features: [
          "A full workflow management system",
          "Delivered in two to three weeks",
          "30 days of fixes and tweaks included",
          "One year of bug fixes, free",
        ],
      },
      {
        name: "AI consulting",
        price: "$1,000 / day",
        description:
          "Want to learn how to integrate AI into your business? We can teach you modern best practices and practical applications.",
        features: [
          "Audit your business for AI opportunities",
          "Learn how to build impactful AI workflows",
          "Hands-on training for your team",
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
        question: "Do you use AI?",
        answer:
          "AI is the most powerful tool on Earth, but it isn't magic. We have created custom AI tools to streamline our workflows and ensure quality products for our clients. It allows us to build faster and more efficiently to tend to your needs when you need it. ",
      },
      {
        question: "Do I need to be technical to work with you?",
        answer:
          "No. We ask about your business and help you figure out how to streamline your processes. We emphasize clear communication and will ensure you can understand everything you need to about your solution.",
      },
      {
        question: "What does the monthly fee cover?",
        answer:
          "The monthly fee keeps your tool running and cared for. It covers hosting, uptime, daily backups, security patches and bug fixes. We host it so you and your team can focus on using it.",
      },
      {
        question: "Does my tool use AI?",
        answer:
          "AI isn't magic. Some of our builds use AI but only when it is actually the right tool for the job. If you want AI integrated into your product, we can help you implement it.",
      },
      {
        question: "What happens if I want to cancel?",
        answer:
          "You are free to cancel any time. You will retain access for the time payed for and receive all your data once the service ends.",
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
        photo: "/founders/nate-seluga.jpg",
        bio: "Nate builds the tools. He is drawn to efficiency, and to software optimizes your workflow exactly how you want it to. Time spent inside day-to-day operations showed him how much of a workday goes to operations that could be automated but weren't, due to the inconvenience of change and hesitation to pay for outside solutions that aren't tailored to the existing process. He has extensive experience creating tools to reduce friction in his own work. bcns exists because that toolbox should not stop with the person who built it.",
        credentials: [
          "Computer science, Harvey Mudd College",
        ],
      },
      {
        // No `photo` yet. The component falls back to initials until one exists.
        name: "Brandon Chung",
        roleLine: "Business & clients",
        bio: "Brandon studies economics at New York University and has worked in business evaluation and optimization, including time as an investor. That work comes down to one question asked repeatedly: what enables a business to make money, and what is quietly slowing down that process. He has spent time finding the businesses and projects that already work and identifying what would make them work better. On a bcns project he owns scoping and communication, meaning he is the one who advises you on solutions that are worth building.",
        credentials: [
          "Economics, New York University",
        ],
      },
    ],
    whyBcns:
      "Every business we have worked in runs on at least one process that could be faster. The software sold to fix it is built for the general version of the problem, not the one that business actually has. We started bcns to build the specific one.",
  },

  navCards: {
    items: [
      {
        title: "Our Service",
        description:
          "Business management systems, analytics dashboards and workflow automations. The problems we solve and how.",
        href: "/services",
      },
      {
        title: "Past Work",
        description:
          "Scheduling apps, revenue trackers and more. What we've built, and what it changed for the businesses using it.",
        href: "/work",
      },
      {
        title: "Pricing",
        description:
          "Understand our pricing model and what it covers. We charge you for what you actually need and no more.",
        href: "/pricing",
      },
      {
        title: "About",
        description:
          "Learn more about the team behind bcns and why we do what we do.",
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
        "Standard builds are $3,000 setup and $250/mo. Advanced builds are $6,000 setup and $500/mo. Both include up to 15 users, then $20/user per month. AI consulting at $1,000 per day. Fixed quotes, no hourly surprises.",
    },
    about: {
      title: "About bcns | Two Founders, Custom Software",
      description:
        "Nate builds. Brandon makes sure it's worth building. Two founders who left generic tools behind to build custom software that fits local businesses.",
    },
  },
};
