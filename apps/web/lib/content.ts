/**
 * Typed content registry. Single source of truth for all section copy.
 *
 * Rules:
 * - Strings with "[INPUT: ...]" are real copy. Nate fills them; they render as-is.
 * - Strings with "[TODO: ...]" are legal-copy gaps (privacy/terms): a fact the
 *   repo does not know yet. They render as-is, visibly, never silently dropped.
 * - Icons stay in component files, mapped by array index.
 * - siteConfig (site.ts) remains the source for name / domain / email; the
 *   `legal` section imports it and interpolates rather than re-typing the
 *   email address as a literal (content-registry.test.mjs forbids that).
 * - problemSolution and deliveryModels are gone entirely: the sections were cut
 *   from the IA, and their interfaces and stub components have been removed.
 */

import { siteConfig } from "./site.ts";

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
  /** Link label under each case on the `/work` list. */
  readLabel: string;
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

export interface LegalSection {
  heading: string;
  body: string[];
  /** Optional bullet list rendered after `body` (e.g. a subprocessor list). */
  list?: string[];
}

export interface LegalPageContent {
  eyebrow: string;
  title: string;
  description: string;
  /** Rendered as-is, e.g. "Last updated September 22, 2026." */
  effectiveDate: string;
  sections: LegalSection[];
}

export interface LegalContent {
  privacy: LegalPageContent;
  terms: LegalPageContent;
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
  connect: PageMeta;
  deluxe: PageMeta;
  aiConsulting: PageMeta;
}

/** Connected-tool ids; match the `--tool-*` CSS vars and `tool.*` Tailwind colors. */
export type ToolId = "shopify" | "square" | "quickbooks" | "calendar" | "gmail";

export interface ToolItem {
  id: ToolId;
  /** Full name, e.g. "Google Calendar". */
  name: string;
  /** Short name used inside the hero chips, e.g. "Calendar". */
  short: string;
  /** What the tool is for, shown on the Connect page chips. */
  role: string;
}

export interface PillarItem {
  n: string;
  label: string;
  name: string;
  line: string;
  price: string;
  href: string;
}

export interface AskHeroItem {
  question: string;
  /** Tools that light up and send dots into the block for this question. */
  toolIds: ToolId[];
  /** Bold lead of the answer, e.g. "6 appointments." */
  answerLead: string;
  answerRest: string;
}

export interface AskHeroContent {
  ariaLabel: string;
  items: [AskHeroItem, AskHeroItem, AskHeroItem];
}

export interface StoryStep {
  /** Full step label, e.g. "How it works | 01 / 05". */
  label: string;
  /** Whole heading text. `emphasis` is the substring to render in the accent style. */
  title: string;
  emphasis: string;
  description: string;
}

export interface StoryContent {
  /** aria-label of the pinned home section. */
  ariaLabel: string;
  /** aria-label of the step rail. */
  railLabel: string;
  /** aria-label of the stage diagram. */
  diagramLabel: string;
  /** aria-label of the home proof row (copy itself is `hero.proofPoints`). */
  proofAriaLabel: string;
  steps: [StoryStep, StoryStep, StoryStep, StoryStep, StoryStep];
  /** Final step: question, answer and the weekly bar chart. */
  chart: {
    question: string;
    answerLead: string;
    answerRest: string;
    days: [string, string, string, string, string, string, string];
    /** Orders per day, Mon to Sun (bar heights). */
    values: [number, number, number, number, number, number, number];
  };
}

export interface ServicesOverviewContent {
  eyebrow: string;
  title: string;
  emphasis: string;
  /** aria-label of the three-cube section. */
  cubeLabel: string;
  /** aria-label of the interactive cube button. */
  cubeAriaLabel: string;
  /** Link label at the foot of each pillar card. */
  cardMore: string;
  processTitle: string;
  processEmphasis: string;
  /** Emphasis inside `contactSection.title` for the closing band. */
  ctaEmphasis: string;
}

export interface ConnectDemoDestination {
  title: string;
  /** Wide-layout line. */
  line: string;
  /** Short line for narrow layouts. */
  short: string;
}

export interface ConnectDemoContent {
  eyebrow: string;
  title: string;
  emphasis: string;
  noSetupFee: string;
  replayLabel: string;
  /** aria-label of the steps section. */
  stageLabel: string;
  diagramLabel: string;
  /** Per step of `connect.steps`: the substring of the title to emphasise. */
  stepEmphasis: [string, string, string];
  /** Per step: "bcns Connect | 01 / 03". */
  stepLabels: [string, string, string];
  toolsEyebrow: string;
  toolsTitle: string;
  toolsEmphasis: string;
  toolsLede: string;
  /** Extra chips after the five `tools` (no role line). */
  extraChips: [string, string, string];
  /** Sorted-row labels in the stage diagram. */
  rows: [string, string, string, string, string];
  destinations: [ConnectDemoDestination, ConnectDemoDestination, ConnectDemoDestination];
  faqEmphasis: string;
  /** `faq.items[].question` values to show on the Connect page, in order. */
  faqQuestions: [string, string, string, string, string, string];
}

export interface DeluxeTile {
  name: string;
  value: number;
  /** Text before the number, e.g. "$". Omitted when none. */
  prefix?: string;
  /** Text after the number, e.g. "d". Omitted when none. */
  suffix?: string;
  sub: string;
  toolIds: ToolId[];
}

export interface DeluxeRow {
  title: string;
  detail: string;
  tag: string;
}

export interface DeluxeChip {
  question: string;
  tiles: [DeluxeTile, DeluxeTile, DeluxeTile];
  listHeading: string;
  /** Either bars (percent heights, Mon to Sun) or rows, never both. */
  bars?: number[];
  rows?: DeluxeRow[];
  /** Agent answer; `**text**` marks bold. */
  answer: string;
  source: string;
}

export interface DeluxeStep {
  label: string;
  title: string;
  emphasis: string;
  description: string;
}

export interface DeluxeDemoContent {
  /** Page head eyebrow/title/lede are `useCases.blockEyebrow/blockTitle/blockDescription`. */
  titleEmphasis: string;
  ctaSecondary: string;
  howEyebrow: string;
  askTitle: string;
  askEmphasis: string;
  askLede: string;
  groupLabel: string;
  dashboardTitle: string;
  agentLabel: string;
  agentPlaceholder: string;
  /** Letters under the bar chart, Mon to Sun. */
  dayLetters: string;
  chips: [DeluxeChip, DeluxeChip, DeluxeChip];
  steps: [DeluxeStep, DeluxeStep, DeluxeStep, DeluxeStep];
  buildEyebrow: string;
  buildTitle: string;
  buildEmphasis: string;
  workEyebrow: string;
  workTitle: string;
  workEmphasis: string;
  workCta: string;
  /** Price-slot label per `pastWork.items`, in order. */
  workLabels: [string, string];
  pricingEyebrow: string;
}

export interface AiDayLeaveItem {
  n: string;
  title: string;
  line: string;
}

export interface AiDayContent {
  /** Substring of `aiConsult.title` styled as the accent in the page head. */
  titleEmphasis: string;
  ctaSecondary: string;
  tabsLabel: string;
  /** Tab names in order; also the first word of each step label. */
  tabs: [string, string, string];
  /** Per step of `aiConsult.steps`: the substring of the title to emphasise. */
  stepEmphasis: [string, string, string];
  /** Per step: "Morning | 01 / 03". */
  stepLabels: [string, string, string];
  timeline: {
    ariaLabel: string;
    /** Stop labels for narrow layouts. */
    short: [string, string, string];
    /** Stop labels for wide layouts. */
    long: [string, string, string];
    start: string;
    end: string;
    now: string;
  };
  leaveEyebrow: string;
  leaveTitle: string;
  leaveEmphasis: string;
  leave: [AiDayLeaveItem, AiDayLeaveItem, AiDayLeaveItem];
  pricingEyebrow: string;
  faqEmphasis: string;
  /** `faq.items[].question` values to show on the AI consulting page, in order. */
  faqQuestions: [string, string, string, string];
}

export interface PricingPageContent {
  /** Link label under each tier, in tier order. */
  learnMore: [string, string, string];
  disclaimer: string;
}

export interface AboutPageContent {
  whyHeading: string;
  /** Substring of the closing line of `about.whyBcns` styled as the accent. */
  whyEmphasis: string;
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
  legal: LegalContent;
  navCards: NavCardsContent;
  pageMeta: PageMetaRegistry;
  tools: [ToolItem, ToolItem, ToolItem, ToolItem, ToolItem];
  pillars: [PillarItem, PillarItem, PillarItem];
  askHero: AskHeroContent;
  story: StoryContent;
  servicesOverview: ServicesOverviewContent;
  connectDemo: ConnectDemoContent;
  deluxeDemo: DeluxeDemoContent;
  aiDay: AiDayContent;
  pricingPage: PricingPageContent;
  aboutPage: AboutPageContent;
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
      readLabel: "Read the case study",
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
          "You are free to cancel any time. Your access continues for 30 days after you cancel, then the service ends; you can request an export of your data any time before it is deleted, about 60 days after you cancel.",
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

  // ---------------------------------------------------------------------------
  // Legal (privacy / terms)
  //
  // Every factual claim below traces to docs/architecture/legal-pages-research.md
  // §(c) (fact inventory) or §(e) (Nate's 2026-09-22 decisions); see that doc
  // before editing. `[TODO: ...]` strings are unresolved facts; keep the
  // brackets, don't fill them with a guess.
  //
  // MAINTAINER NOTE (not rendered): the "30 days" / "no archive after
  // deletion" / "backups roll off within 7 days" wording below matches
  // platform/scripts/hard-delete.ts on the `retention-30d` branch, merged
  // to `main` as PR #60 (https://github.com/bcn-services/bcns/pull/60,
  // main 558087c). This copy is accurate as shipped.
  // Deletion is operator-run: nothing schedules hard-delete.ts; the 30-day
  // figure is when the script permits deletion, and running it promptly is
  // an operating practice (Shopify §6.2.3 requires deletion within 30 days
  // of uninstall).
  //
  // MAINTAINER NOTE (not rendered): the 30-day access after cancellation
  // (FAQ, terms) is an operating practice, not a platform state: the
  // platform has only `clients.status = churned` (R34, logins and syncs
  // stop at the next tick). The operator marks the client churned 30 days
  // after the cancel email, so "account ends" = churned_at, and deletion
  // is permitted 30 days after that.
  //
  // MAINTAINER NOTE (not rendered): "stored in the United States" (privacy,
  // "Where your data is stored") is confirmed: droplet and Spaces are
  // SFO3, Supabase is N. Virginia, Cloud Run is us-east4 (checked
  // 2026-09-22). All US.
  //
  // MAINTAINER NOTE (not rendered): the "Agreement and acceptance" sentence
  // about the Stripe Checkout consent box and the hub sign-in acceptance
  // describes a DECIDED but NOT YET BUILT flow. Stripe Checkout is not set
  // up yet, and the hub has no acceptance step today. The sentence is only
  // true once both ship: Stripe Checkout setup, and a hub "By signing in
  // you agree" line (a later PR). The "Who we share it with" list's Stripe
  // entry, the terms' "Fees and billing" line, and the FAQ deliberately
  // omit or soften Stripe until Checkout is live.
  legal: {
    privacy: {
      eyebrow: "Privacy",
      title: "Privacy Policy",
      description:
        "How bcns collects, uses, and protects the information that runs through bcns Connect, the hub, and the MCP server.",
      effectiveDate: "Last updated September 22, 2026.",
      sections: [
        {
          heading: "Who we are",
          body: [
            `This policy is for BCNS LLC, a Delaware limited liability company ("${siteConfig.name}," "we," "us"). It covers the marketing site, the ${siteConfig.name} Connect hub, the MCP server, and any custom build or consulting engagement.`,
            `Contact us about this policy at ${siteConfig.email}.`,
          ],
        },
        {
          heading: "The two roles we play",
          body: [
            "For your own account data, like your email and sign-in sessions, bcns is the controller: we decide why that data is collected and how it's used.",
            "For the data you connect from Shopify, Meta Ads, monday.com, Google Drive, or a meeting-notes folder, bcns is a processor. You are the controller of that data, and you decide what gets connected and why.",
          ],
        },
        {
          heading: "What we collect",
          body: [
            "Contact form: your name, business, email and message, sent through Web3Forms.",
            "Accounts: the email addresses of the account owner and any team members you invite, plus sign-in sessions.",
            "Shopify, if you connect it: order totals, statuses, line items and refunds going back 13 months; products, variants and prices; inventory counts; Shopify Payments payouts; and, on each order, the customer's ID, email and display name only, with no phone number or address.",
            "Meta Ads, if you connect it: your ad account's timezone and currency; campaign and ad details, including ad creative; daily performance numbers like spend, impressions, clicks and reach; and copies of your ad creative images, which we store.",
            "monday.com, if you connect it: the one board you point us at, its name, columns, groups, and every item's name, dates, group and column values. Whatever your team keeps in those columns, including names or emails, comes with it.",
            "Google Drive and meeting notes, if you connect them: for a meeting-notes folder, the full text of the notes, which can include the names of people in the meeting and what they said. For a Drive folder, file names, types, sizes, dates, links, and thumbnail images we copy and store. We don't touch the underlying file contents in Drive.",
            "Access tokens: for each source you connect, we store a token that lets our sync service read that source on your behalf. See \"Security\" below for how we protect it.",
          ],
        },
        {
          heading: "How we use it",
          body: [
            "We use your connected data to sync it, store it, and show it back to you in your dashboard, and to make it available to the AI tools you choose to connect.",
            "We never sell your data, use it to run ads, build profiles of people in it, or use it to train an AI model.",
          ],
        },
        {
          heading: "AI tools and MCP",
          body: [
            "When you connect an AI assistant like Claude or ChatGPT to the MCP server, your data goes to the AI provider you picked, because you asked it to, under your own agreement with that provider.",
            "bcns does not send your data to any AI provider on its own, and we never train models on your data.",
          ],
        },
        {
          heading: "Who we share it with",
          body: [
            "We share data with the vendors below only to run the service. We disclose data when the law requires it, and in a business transfer only with the protections this policy already promises.",
          ],
          list: [
            "Supabase: hosts our database, sign-in system and file storage for connected-source data, tokens and accounts",
            "Google Cloud: runs the background job that syncs each connected source into our database",
            "DigitalOcean: hosts the Connect hub, the MCP server, client apps, and nightly backups of client apps' databases",
            "Resend: delivers internal operational email, like alerts when a deletion request comes in",
            "Web3Forms: delivers the marketing site's contact form",
            "Cloudflare: provides DNS and TLS for some client apps",
            "Vercel: hosts this marketing site",
            "Stripe: will process subscription payments once we take card payments; card details go to Stripe, never to bcns",
          ],
        },
        {
          heading: "Google user data",
          body: [
            "The use of information received from Google Workspace scopes will adhere to the Google User Data Policy, including the Limited Use requirements.",
            "We use that data only to provide the features you see in the product. We don't sell it to advertisers or data brokers, don't use it for credit or employment decisions, and don't use it to train or improve an AI model beyond your own personalized use. No one reads it by hand except with your agreement, for security, for legal compliance, or as anonymous internal operations.",
          ],
        },
        {
          heading: "How long we keep it",
          body: [
            "While your account is active, we keep your connected data current and available.",
            "Thirty days after your account ends, we delete the copy of your connected-source data that we hold. We don't keep an archive or backup export of it after that.",
            "During those 30 days, you can ask us for an export of your data.",
            "Backup copies our database provider keeps as part of normal operations roll off on its normal backup rotation, currently 7 days, after we delete your data.",
          ],
        },
        {
          heading: "Requesting deletion",
          body: [
            `To delete your account or your data, email ${siteConfig.email}.`,
            "If you're a customer of one of our clients and want your Shopify order data removed, Shopify sends us that request directly. We handle a shop's full data removal (\"shop/redact\") by hand, inside Shopify's 48-hour window, and a customer-level removal request by hand as well.",
            `If you interacted with a Meta ad and want your data removed, email ${siteConfig.email} and we'll confirm by email once it's done.`,
            "These requests are handled by a person, not automatically; we'll confirm with you once each one is complete.",
          ],
        },
        {
          heading: "Security",
          body: [
            "Data is encrypted in transit and at rest by our database provider; access tokens are stored in a table only our sync service can read.",
            "Your data is also isolated from every other client's by row-level database rules, and only bcns's operator has broader access.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            `You can ask to see, correct, delete, or export your data at any time. Email ${siteConfig.email}.`,
            "If your own customers want to exercise rights over data you hold about them, they should contact you, not us; we hold that data on your behalf.",
            "bcns is not intended for consumers or for use outside the United States.",
          ],
        },
        {
          heading: "Where your data is stored",
          body: ["Your data is stored in the United States."],
        },
        {
          heading: "Cookies and Do Not Track",
          body: [
            "We use a sign-in cookie so you stay logged in, and short-lived cookies during the moment you connect a new source. That's all: no analytics, advertising or tracking cookies.",
            "Because we don't track you across sites, a Do Not Track signal from your browser doesn't change anything here; there's nothing to turn off.",
          ],
        },
        {
          heading: "Children",
          body: [
            "bcns is a business tool. It isn't directed at, and we don't knowingly collect data from, anyone under 13.",
          ],
        },
        {
          heading: "Changes to this policy",
          body: [
            "If we make a material change to this policy, we'll update the date at the top of this page and, where the change matters to you, tell you directly.",
          ],
        },
        {
          heading: "Contact us",
          body: [`Questions about this policy: ${siteConfig.email}.`],
        },
      ],
    },
    terms: {
      eyebrow: "Terms",
      title: "Terms of Service",
      description:
        "The agreement between BCNS LLC and any business using bcns Connect, a Deluxe build, or AI consulting.",
      effectiveDate: "Last updated September 22, 2026.",
      sections: [
        {
          heading: "Agreement and acceptance",
          body: [
            `These terms are between BCNS LLC ("${siteConfig.name}") and the business signing up ("you"). The person accepting them must have the authority to bind that business.`,
            "You accept these terms by checking the consent box at checkout in Stripe Checkout, and again every time you sign in to the hub.",
            "A custom build or a day of AI consulting is governed by these terms plus a signed quote, which sets the scope and price for that engagement.",
          ],
        },
        {
          heading: "Definitions",
          body: [
            '"Services" means bcns Connect, any Deluxe build, and any AI consulting engagement.',
            '"Customer Data" means the data you or your Connected Sources send us.',
            '"Connected Sources" means any third-party platform you authorize us to read from, like Shopify, Meta Ads, monday.com, or Google Drive.',
            '"Order Form" means a signed quote for a Deluxe build or a consulting engagement.',
            '"AI Output" means anything generated by an AI tool as part of the Services.',
          ],
        },
        {
          heading: "The services",
          body: [
            "bcns Connect is a monthly subscription that connects your tools into one place. Deluxe builds and AI consulting are separate engagements, each scoped and priced on their own Order Form.",
          ],
        },
        {
          heading: "Accounts and access",
          body: [
            "The account owner controls who else on your team has access. You're responsible for keeping your team's credentials safe, and for what your team, and anything they connect, including an AI assistant over MCP, does with that access.",
          ],
        },
        {
          heading: "Connected sources",
          body: [
            "When you connect a source, you're telling us we're authorized to read it, and that you have the right to share that data with us, including any personal data belonging to your own customers, and that you've given your customers any notice they're owed.",
            "Every connected platform is governed by its own terms. We're not responsible for its outages or for changes it makes to its own API.",
          ],
        },
        {
          heading: "Your data, your ownership",
          body: [
            "You own your data. We get a limited license to process it only to provide the Services; never to sell it, use it for ads, or train a model on it.",
          ],
        },
        {
          heading: "Data processing",
          body: [
            "A short data processing addendum covering how we handle data you connect is available on request.",
            "See our Privacy Policy for the full detail on what we collect and how long we keep it.",
          ],
        },
        {
          heading: "Acceptable use",
          body: [
            "Don't send us data you don't have the right to share, scrape or reverse-engineer the Services, run load tests or security probes without asking us first, resell the Services, or use them in a way that breaks a Connected Source's own terms.",
          ],
        },
        {
          heading: "AI features and output",
          body: [
            'AI Output can be wrong. Review it before you rely on it; it isn\'t financial, legal, or tax advice. We don\'t control any third-party AI provider you choose to connect; see "AI tools and MCP" in our Privacy Policy for how that connection works.',
          ],
        },
        {
          heading: "Fees and billing",
          body: [
            "bcns Connect is $200 a month with no setup fee. Deluxe builds and AI consulting are billed per their Order Form.",
            "You're responsible for any taxes on top of the listed price. If a payment fails, we may suspend the Services until it's resolved.",
            "If we change our pricing, we'll give you reasonable advance notice before the new price takes effect.",
          ],
        },
        {
          heading: "Term, cancellation and suspension",
          body: [
            "bcns Connect runs month to month. Cancel any time by emailing us. Your access continues for 30 days after you cancel, then your account ends, so your data is deleted about 60 days after you cancel.",
            "We can suspend the Services for non-payment or for a serious violation of these terms, and we'll tell you when we can.",
          ],
        },
        {
          heading: "What happens when the service ends",
          body: [
            "Once your account ends, logins and syncing stop. You can request an export of your data any time in the 30 days that follow. Thirty days after your account ends, your data is deleted on the schedule in our Privacy Policy.",
          ],
        },
        {
          heading: "Confidentiality",
          body: [
            "Each of us will keep the other's non-public information confidential, and use it only to run this relationship.",
          ],
        },
        {
          heading: "Warranties and disclaimer",
          body: [
            'THE SERVICES ARE PROVIDED "AS IS." WE DON\'T GUARANTEE UNINTERRUPTED SERVICE, AND WE DON\'T GUARANTEE THE ACCURACY OF DATA PULLED FROM A THIRD-PARTY SOURCE.',
          ],
        },
        {
          heading: "Limitation of liability",
          body: [
            "Neither of us is liable to the other for indirect or consequential damages. Our total liability to you is capped at the fees you paid us in the 12 months before the claim. There are no other carve-outs to that cap.",
          ],
        },
        {
          heading: "Indemnification",
          body: [
            "You'll cover any claim arising from your data or from your breach of a Connected Source's own terms. We don't provide a separate intellectual-property indemnity.",
          ],
        },
        {
          heading: "Intellectual property",
          body: [
            "bcns owns the Connect platform, the hub, and the MCP server. Deliverables from a Deluxe build follow whatever the Order Form says.",
          ],
        },
        {
          heading: "Changes to the service and these terms",
          body: [
            "We'll give you reasonable advance notice of a material change to these terms, and for a material change, we'll ask you to accept the updated terms again, the same way you accepted them the first time.",
          ],
        },
        {
          heading: "Governing law and venue",
          body: [
            "These terms are governed by Delaware law. Any dispute goes to the state or federal courts of Delaware, and only those courts. There's no arbitration requirement here.",
          ],
        },
        {
          heading: "General terms",
          body: [
            "These terms, plus any Order Form, are the entire agreement between us; an Order Form controls over these terms if the two conflict. You can't assign this agreement without our consent; we can, as part of a sale or merger of the business. Neither of us is responsible for a delay caused by something outside our control. If any part of these terms turns out to be unenforceable, the rest still stands, and us not enforcing a term once doesn't waive it later.",
            `We'll send notices to the email on your account, or to ${siteConfig.email} for notices to us.`,
          ],
        },
        {
          heading: "Contact us",
          body: [`Questions about these terms: ${siteConfig.email}.`],
        },
      ],
    },
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
    connect: {
      title: "bcns Connect | Every Tool in One Place",
      description:
        "bcns Connect plugs into the tools your small business already uses and keeps everything organized in one place. $200/month, no setup fee.",
    },
    deluxe: {
      title: "Deluxe Builds | bcns",
      description:
        "Custom AI agents, apps and dashboards built on top of your bcns Connect data. From $5,000 setup plus $300/month, with a fixed quote before work starts.",
    },
    aiConsulting: {
      title: "AI Consulting | bcns",
      description:
        "One day on your business: we find where AI actually helps, build a workflow with you watching, and get your team using it. $1,000 a day.",
    },
  },

  // -------------------------------------------------------------------------
  // Editorial-rebuild keys (home stage, services sub-pages)
  // -------------------------------------------------------------------------

  tools: [
    { id: "shopify", name: "Shopify", short: "Shopify", role: "Online store" },
    { id: "square", name: "Square", short: "Square", role: "Payments" },
    { id: "quickbooks", name: "QuickBooks", short: "QuickBooks", role: "Money" },
    { id: "calendar", name: "Google Calendar", short: "Calendar", role: "Calendar" },
    { id: "gmail", name: "Gmail", short: "Gmail", role: "Email" },
  ],

  pillars: [
    {
      n: "01",
      label: "Get organized",
      name: "bcns Connect",
      line: "Every tool you use, connected in one organized place.",
      price: "$200 a month",
      href: "/services/connect",
    },
    {
      n: "02",
      label: "Put it to work",
      name: "Deluxe builds",
      line: "An AI agent, an app or a dashboard, built on top of Connect around how you work.",
      price: "From $5,000 setup",
      href: "/services/deluxe",
    },
    {
      n: "03",
      label: "Learn to optimize",
      name: "AI consulting",
      line: "One day on your business: where AI actually helps, built with you, and your team using it.",
      price: "$1,000 a day",
      href: "/services/ai-consulting",
    },
  ],

  askHero: {
    ariaLabel:
      "Example: ask your business a question, and the connected tools answer in plain words",
    items: [
      {
        question: "Who's booked tomorrow?",
        toolIds: ["calendar"],
        answerLead: "6 appointments.",
        answerRest: "First one at 9:30.",
      },
      {
        question: "Which invoices are still unpaid?",
        toolIds: ["quickbooks"],
        answerLead: "3 invoices,",
        answerRest: "$1,240 in total.",
      },
      {
        question: "What sold best this month?",
        toolIds: ["shopify", "square"],
        answerLead: "The large candle set,",
        answerRest: "41 sold.",
      },
    ],
  },

  story: {
    ariaLabel: "How it works",
    railLabel: "Jump to a step",
    diagramLabel:
      "Five tool cards start jumbled, settle into an arc, and send colored dots into one building block.",
    proofAriaLabel: "Why bcns Connect",
    steps: [
      {
        label: "How it works | 01 / 05",
        title: "Your tools, all over the place",
        emphasis: "all over the place",
        description:
          "Shopify, Square, QuickBooks, Google Calendar, Gmail. Each holds a piece of your business, and none of them talk to each other.",
      },
      {
        label: "How it works | 02 / 05",
        title: "We connect them",
        emphasis: "connect them",
        description:
          "One connection to each, set up by us. You keep using every tool the way you do today.",
      },
      {
        label: "How it works | 03 / 05",
        title: "Everything in one place",
        emphasis: "one place",
        description:
          "Customers, orders, money, appointments and messages, sorted together and kept current.",
      },
      {
        label: "How it works | 04 / 05",
        title: "Three ways to use it",
        emphasis: "Three ways",
        description:
          "Get organized, put it to work, or learn to optimize. Start with Connect and add the rest when you are ready.",
      },
      {
        label: "How it works | 05 / 05",
        title: "Ask it anything",
        emphasis: "anything",
        description: "An AI agent or an app we build for you works on top of your organized data.",
      },
    ],
    chart: {
      question: "What did we sell last week?",
      answerLead: "$4,280",
      answerRest: "from 63 orders. Up 12% on the week before.",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      values: [3, 4, 3, 5, 4, 6, 7],
    },
  },

  servicesOverview: {
    eyebrow: "Our services",
    title: "Three ways bcns can help your business",
    emphasis: "help your business",
    cubeLabel: "The three pillars of bcns",
    cubeAriaLabel: "The three bcns cubes. Open to see our three services.",
    cardMore: "Learn more",
    processTitle: "How we work",
    processEmphasis: "work",
    ctaEmphasis: "slowing you down",
  },

  connectDemo: {
    eyebrow: "bcns Connect",
    title: "How bcns Connect works",
    emphasis: "bcns Connect",
    noSetupFee: "no setup fee",
    replayLabel: "Play again",
    stageLabel: "How bcns Connect works",
    diagramLabel:
      "Tools start jumbled and connected, a cube appears and sorts everything into organized rows, then it feeds a team view, AI tools and Deluxe builds.",
    stepEmphasis: ["connect", "one organized place", "put it to work"],
    stepLabels: [
      "bcns Connect | 01 / 03",
      "bcns Connect | 02 / 03",
      "bcns Connect | 03 / 03",
    ],
    toolsEyebrow: "What it connects",
    toolsTitle: "The tools you already use",
    toolsEmphasis: "already use",
    toolsLede: "We plug into each one. Nothing about how you use them changes.",
    extraChips: ["Ad accounts", "Project boards", "Files"],
    rows: ["Customers", "Orders", "Money", "Messages", "Files"],
    destinations: [
      { title: "Team view", line: "The whole business at once", short: "The business" },
      { title: "AI tools", line: "Work from your real data", short: "Real data" },
      { title: "Deluxe builds", line: "Anything we build starts here", short: "Start here" },
    ],
    faqEmphasis: "ask too",
    faqQuestions: [
      "What is bcns Connect?",
      "Do I have to stop using my current software?",
      "What does the monthly fee cover?",
      "Can I use my data with other tools?",
      "Is my data private?",
      "What happens if I want to cancel?",
    ],
  },

  deluxeDemo: {
    titleEmphasis: "custom built",
    ctaSecondary: "See how a build comes together",
    howEyebrow: "How a build works",
    askTitle: "Ask your business a question.",
    askEmphasis: "a question.",
    askLede:
      "Pick one below. This is how a dashboard and an AI agent answer it, using data that is already organized in Connect.",
    groupLabel: "Pick a question",
    dashboardTitle: "Your dashboard",
    agentLabel: "AI agent",
    agentPlaceholder: "Ask about your business",
    dayLetters: "MTWTFSS",
    chips: [
      {
        question: "What did we sell last week?",
        tiles: [
          { name: "Orders", value: 63, sub: "last week", toolIds: ["shopify", "square"] },
          { name: "Money", value: 4280, prefix: "$", sub: "last week", toolIds: ["quickbooks", "square"] },
          { name: "Customers", value: 214, sub: "in total", toolIds: ["shopify", "square", "gmail"] },
        ],
        listHeading: "Sales by day",
        bars: [46, 54, 62, 58, 88, 80, 52],
        answer: "**$4,280** from **63** orders. Up 12% on the week before.",
        source: "From your Orders and Money data",
      },
      {
        question: "What's booked this week?",
        tiles: [
          { name: "Booked", value: 9, sub: "this week", toolIds: ["calendar"] },
          { name: "Today", value: 2, sub: "on the schedule", toolIds: ["calendar"] },
          { name: "Open", value: 5, sub: "slots left", toolIds: ["calendar", "square"] },
        ],
        listHeading: "Coming up",
        rows: [
          { title: "Tue 9:00", detail: "Maria R. · Full detail", tag: "Confirmed" },
          { title: "Wed 1:30", detail: "Sam T. · Interior clean", tag: "Confirmed" },
          { title: "Fri 10:00", detail: "Jo L. · Paint correction", tag: "Deposit paid" },
        ],
        answer: "**9** bookings this week, **2** today. Thursday afternoon is still open.",
        source: "From your Calendar and Square data",
      },
      {
        question: "Who needs a reply?",
        tiles: [
          { name: "To answer", value: 5, sub: "messages", toolIds: ["gmail"] },
          { name: "Quotes", value: 3, sub: "no reply yet", toolIds: ["gmail", "quickbooks"] },
          { name: "Oldest", value: 2, suffix: "d", sub: "days waiting", toolIds: ["gmail"] },
        ],
        listHeading: "Waiting on you",
        rows: [
          { title: "Dana K.", detail: "Asked for a quote", tag: "Draft ready" },
          { title: "Pat M.", detail: "Wants to reschedule", tag: "Draft ready" },
          { title: "Lee S.", detail: "Where is my order?", tag: "Draft ready" },
        ],
        answer: "**5** messages are waiting. I drafted replies for the top **3**.",
        source: "From your Gmail and Orders data",
      },
    ],
    steps: [
      {
        label: "01 / 04",
        title: "Your data, already organized.",
        emphasis: "already organized.",
        description:
          "Customers, orders, money, appointments and messages, sorted in bcns Connect. Every Deluxe build starts here.",
      },
      {
        label: "02 / 04",
        title: "We build an app on top.",
        emphasis: "app",
        description:
          "A dashboard, a booking tool, a back-office app, reading from the same data as everything else.",
      },
      {
        label: "03 / 04",
        title: "An agent that knows your business.",
        emphasis: "knows your business.",
        description: "Ask in plain words. It answers from your real data, not guesses.",
      },
      {
        label: "04 / 04",
        title: "Built around how you work.",
        emphasis: "how you work.",
        description:
          "Scoped with you, quoted fixed, and arranged the way your team actually uses it.",
      },
    ],
    buildEyebrow: "What we build",
    buildTitle: "If you have a pain point, we can build a tool to alleviate it.",
    buildEmphasis: "we can build a tool",
    workEyebrow: "Past work",
    workTitle: "What we've built, and what it changed.",
    workEmphasis: "what it changed.",
    workCta: "Read the case study",
    workLabels: ["Dashboard", "Custom app"],
    pricingEyebrow: "Deluxe build pricing",
  },

  aiDay: {
    titleEmphasis: "AI consult",
    ctaSecondary: "See the day",
    tabsLabel: "Part of the day",
    tabs: ["Morning", "Midday", "Afternoon"],
    stepEmphasis: ["already do", "with you watching", "real work"],
    stepLabels: ["Morning | 01 / 03", "Midday | 02 / 03", "Afternoon | 03 / 03"],
    timeline: {
      ariaLabel:
        "A one-day timeline from morning to evening. A marker moves along it as a bottleneck is found, a tool is built, and a team uses it.",
      short: ["Find", "Build", "Use"],
      long: ["Find where AI helps", "Build it with you", "Your team uses it"],
      start: "Morning",
      end: "Evening",
      now: "Now",
    },
    leaveEyebrow: "What you leave with",
    leaveTitle: "By evening, it's already working.",
    leaveEmphasis: "it's already working.",
    leave: [
      {
        n: "01",
        title: "A clear list of where AI helps",
        line: "The repetitive, slow or double-typed parts of your week, and the honest answer on which of them are worth automating.",
      },
      {
        n: "02",
        title: "One workflow you watched get built",
        line: "The task costing you the most hours, built in front of you, so you know how it was put together and can build the next one.",
      },
      {
        n: "03",
        title: "A team that has used it on real work",
        line: "Your people ran it on their own jobs, with us there when something broke. Hands-on training, not a slide deck.",
      },
    ],
    pricingEyebrow: "AI consulting pricing",
    faqEmphasis: "we'd ask too",
    faqQuestions: [
      "Do you use AI?",
      "Do I need to be technical to work with you?",
      "Does my tool use AI?",
      "Can I use my data with other tools?",
    ],
  },

  pricingPage: {
    learnMore: ["About bcns Connect", "About Deluxe builds", "About AI consulting"],
    disclaimer:
      "Prices listed are standard starting price and are subject to change. We will provide a fixed quote for your product after our consult.",
  },

  aboutPage: {
    whyHeading: "Why bcns",
    whyEmphasis: "the specific one.",
  },
};
