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
  /** Heading rendered above the grid itself; eyebrow/title/description above feed the page head. */
  blockEyebrow: string;
  blockTitle: string;
  blockDescription: string;
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
  buildingBlocks: HowItWorksContent;
  howItWorks: HowItWorksContent;
  connect: AiConsultContent;
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
    badge: "bcns Connect: your whole business in one place",
    headline: "Get your business ready for the future",
    subheadline:
      "bcns Connect brings the tools you already use into one place, so AI and software can finally work from your real business",
    ctaPrimary: "Book a free consult",
    ctaSecondary: "See how it works",
    proofPoints: [
      "Keep the tools you already use",
      "$200 a month, no setup fee",
      "Build on top whenever you're ready",
    ],
  },

  buildingBlocks: {
    eyebrow: "What we offer",
    title: "Three building blocks for a business that's ready for AI.",
    description:
      "Everyone starts with bcns Connect. Add a custom build or a day of AI consulting whenever you're ready.",
    items: [
      {
        step: "01",
        title: "bcns Connect",
        description:
          "Every tool your business runs on, connected in one organized place. Ready for your team, the AI tools you choose, or anything you build next.",
      },
      {
        step: "02",
        title: "Deluxe builds",
        description:
          "An AI agent, an app, a dashboard, anything really. Custom built on top of Connect around how your business already works.",
      },
      {
        step: "03",
        title: "AI consulting",
        description:
          "One day spent on your business. We find where AI actually helps, build it with you, and get your team using it.",
      },
    ],
  },

  howItWorks: {
    eyebrow: "Our process",
    title: "From first call to your personalized product. We're here to assist at every step.",
    description: "You communicate your needs, we build you a tool that accommodates them.",
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
          "We connect your tools and build anything you asked for on top, then let you test it and refine it until it's right. Once launched, we host it, maintain it and support your needs so you can focus on your business.",
      },
    ],
  },

  connect: {
    eyebrow: "bcns Connect",
    title: "How bcns Connect works",
    description: "One connection for your whole business.",
    rate: "$200 / month",
    steps: [
      {
        step: "01",
        title: "We connect the tools you already use",
        description:
          "Your online store, ad accounts, project boards, calendar, email and files. We plug into each one, and nothing about how you use them changes.",
      },
      {
        step: "02",
        title: "Everything lands in one organized place",
        description:
          "Customers, orders, money, messages and files, sorted the same way no matter where they came from and kept current on their own. For the first time, all of it can be searched and compared together.",
      },
      {
        step: "03",
        title: "You put it to work",
        description:
          "Your team sees the whole business at once. The AI tools you already use can work from your real data instead of guesses. And anything we build for you with Deluxe starts from here.",
      },
    ],
  },

  useCases: {
    eyebrow: "Our services",
    title: "The building blocks of a business ready for what's next",
    description:
      "bcns Connect is the foundation every business starts on. Deluxe builds and AI consulting add to it when you're ready.",
    blockEyebrow: "Deluxe builds",
    blockTitle: "Anything you need, custom built on top of Connect.",
    blockDescription:
      "Starting at $5,000 setup and $300/month on top of Connect. If you have a pain point, we can build a tool to alleviate it.",
    items: [
      {
        tag: "Agents",
        title: "AI Agents",
        description:
          "An assistant that already knows your business. It answers questions about your customers, orders and money, drafts replies, and flags what needs you, working from your real data.",
      },
      {
        tag: "Apps",
        title: "Custom Apps",
        description:
          "Booking systems, back-office tools, customer portals. Built around how you already work, and reading from the same data as everything else.",
      },
      {
        tag: "Insight",
        title: "Dashboards & Reporting",
        description:
          "One place to hold all your business analytics. Your data is already connected, so we build the views that are useful to you.",
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
      "Send a few sentences about your business and its pain points. We'll reply within one business day with next steps to get you connected.",
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
        title: "Your data",
        description:
          "We host and maintain everything for you. Your data is always yours and we'll hand it over at any time.",
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
      "Every business starts on bcns Connect for a flat monthly rate with no setup fee. Deluxe builds and AI consulting are added on top when you need them.",
    tiers: [
      {
        id: "connect",
        name: "bcns Connect",
        price: "$200 per month",
        seats: "No setup fee.",
        description:
          "The foundation for everything else. Every tool your business runs on, connected and organized in one place.",
        features: [
          "Connects the tools you already use",
          "Your data organized and kept current automatically",
          "Ready for your team and the AI tools you choose",
          "Hosting, backups and support included",
        ],
      },
      {
        id: "deluxe",
        name: "Deluxe build",
        price: "$5,000+ setup",
        setup: "$5,000+ setup",
        monthly: "+ from $300/mo on top of Connect",
        description:
          "Anything custom built on top of your Connect data: an agent, an app, a dashboard.",
        features: [
          "Scoped and quoted after our consult",
          "Built around how you already work",
          "30 days of fixes and tweaks included",
          "One year of bug fixes, free",
        ],
      },
      {
        id: "consulting",
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
          "Your bcns Connect fee keeps your tools connected and your data current. It covers hosting, backups, security patches, bug fixes and support. A Deluxe build adds its own monthly fee to cover the same care for what we built you.",
      },
      {
        question: "Does my tool use AI?",
        answer:
          "bcns Connect gets your business ready for AI. Whether to use it is up to you. Some of our Deluxe builds use AI, but only when it is actually the right tool for the job.",
      },
      {
        question: "What happens if I want to cancel?",
        answer:
          "You are free to cancel any time. You will retain access for the time paid for and receive all your data once the service ends.",
      },
      {
        question: "What is bcns Connect?",
        answer:
          "It connects the software your business already runs on and keeps everything organized in one place, so your team, AI tools and anything we build for you all work from the same information.",
      },
      {
        question: "Do I have to stop using my current software?",
        answer:
          "No. Connect works alongside your tools. You keep using them exactly as you do today.",
      },
      {
        question: "Can I use my data with other tools?",
        answer:
          "Yes. Your data is yours. Once it's organized in Connect, you can plug in the AI assistants and apps you already like.",
      },
      {
        question: "What does a Deluxe build add?",
        answer:
          "Something custom built for you on top of Connect: an AI agent, an app, a dashboard, anything really. We scope it with you and give you a fixed quote before any work starts.",
      },
      {
        question: "Is my data private?",
        answer:
          "Yes. Only you and your team can see your data, and we'll hand over a full copy any time, free.",
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
        bio: "Nate builds the tools. He is drawn to efficiency, and to software that optimizes your workflow exactly how you want it to. Time spent inside day-to-day operations showed him how much of a workday goes to operations that could be automated but weren't, due to the inconvenience of change and hesitation to pay for outside solutions that aren't tailored to the existing process. He has extensive experience creating tools to reduce friction in his own work. bcns exists because that toolbox should not stop with the person who built it.",
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
          "bcns Connect, custom Deluxe builds and AI consulting. The three building blocks and how they fit together.",
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
      title: "bcns: Get Your Small Business Ready for AI",
      description:
        "bcns Connect brings the tools your small business already uses into one organized place, ready for AI and custom software. $200/month, no setup fee. Book a free 30-minute consult.",
    },
    services: {
      title: "What We Offer | bcns",
      description:
        "bcns Connect, custom Deluxe builds and AI consulting for small businesses. Three building blocks for a business that's ready for AI.",
    },
    work: {
      title: "Past Work | bcns",
      description:
        "Case studies from bcns client builds. Each one covers the problem, what we built, and what changed. First projects in progress now.",
    },
    pricing: {
      title: "Pricing | bcns",
      description:
        "bcns Connect is $200/month with no setup fee. Deluxe builds start at $5,000 setup plus $300/month on top of Connect. AI consulting at $1,000 per day. Fixed quotes, no hourly surprises.",
    },
    about: {
      title: "About bcns | Two Founders, Custom Software",
      description:
        "Nate builds. Brandon makes sure it's worth building. Two founders who left generic tools behind to build custom software that fits small businesses.",
    },
  },
};
