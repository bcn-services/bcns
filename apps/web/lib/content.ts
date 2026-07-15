/**
 * Typed content registry — single source of truth for all section copy.
 *
 * Rules:
 * - Every string field is either a "[SLOT: …]" placeholder or a neutral
 *   structural default (step numbers, etc.).
 * - Icons stay in component files, mapped by array index.
 * - siteConfig (site.ts) remains the source for name / domain / email.
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

export interface ProblemItem {
  problem: string;
  solution: string;
}

export interface ProblemSolutionContent {
  eyebrow: string;
  title: string;
  description: string;
  items: [ProblemItem, ProblemItem, ProblemItem];
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

export interface DeliveryModelItem {
  title: string;
  description: string;
}

export interface DeliveryModelsContent {
  eyebrow: string;
  title: string;
  description: string;
  items: [DeliveryModelItem, DeliveryModelItem, DeliveryModelItem];
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
}

export interface PricingTier {
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

export interface AboutFounderContent {
  eyebrow: string;
  title: string;
  description?: string;
  cardTitleBio: string;
  cardTitleCredentials: string;
  bio: string;
  credentials: string[];
}

export interface SiteContent {
  hero: HeroContent;
  problemSolution: ProblemSolutionContent;
  howItWorks: HowItWorksContent;
  deliveryModels: DeliveryModelsContent;
  useCases: UseCasesContent;
  contactSection: ContactSectionContent;
  pastWork: PastWorkContent;
  reviews: ReviewsContent;
  pricing: PricingContent;
  faq: FaqContent;
  aboutFounder: AboutFounderContent;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const siteContent: SiteContent = {
  hero: {
    badge: "[SLOT: hero/badge]",
    headline: "[SLOT: hero/headline]",
    subheadline: "[SLOT: hero/subheadline]",
    ctaPrimary: "[SLOT: hero/cta-primary]",
    ctaSecondary: "[SLOT: hero/cta-secondary]",
    proofPoints: [
      "[SLOT: hero/proof-point-1]",
      "[SLOT: hero/proof-point-2]",
      "[SLOT: hero/proof-point-3]",
    ],
  },

  problemSolution: {
    eyebrow: "[SLOT: problem-solution/eyebrow]",
    title: "[SLOT: problem-solution/title]",
    description: "[SLOT: problem-solution/description]",
    items: [
      {
        problem: "[SLOT: problem-solution/item-1-problem]",
        solution: "[SLOT: problem-solution/item-1-solution]",
      },
      {
        problem: "[SLOT: problem-solution/item-2-problem]",
        solution: "[SLOT: problem-solution/item-2-solution]",
      },
      {
        problem: "[SLOT: problem-solution/item-3-problem]",
        solution: "[SLOT: problem-solution/item-3-solution]",
      },
    ],
  },

  howItWorks: {
    eyebrow: "[SLOT: how-it-works/eyebrow]",
    title: "[SLOT: how-it-works/title]",
    description: "[SLOT: how-it-works/description]",
    items: [
      {
        step: "01",
        title: "[SLOT: how-it-works/step-1-title]",
        description: "[SLOT: how-it-works/step-1-description]",
      },
      {
        step: "02",
        title: "[SLOT: how-it-works/step-2-title]",
        description: "[SLOT: how-it-works/step-2-description]",
      },
      {
        step: "03",
        title: "[SLOT: how-it-works/step-3-title]",
        description: "[SLOT: how-it-works/step-3-description]",
      },
    ],
  },

  deliveryModels: {
    eyebrow: "[SLOT: delivery-models/eyebrow]",
    title: "[SLOT: delivery-models/title]",
    description: "[SLOT: delivery-models/description]",
    items: [
      {
        title: "[SLOT: delivery-models/item-1-title]",
        description: "[SLOT: delivery-models/item-1-description]",
      },
      {
        title: "[SLOT: delivery-models/item-2-title]",
        description: "[SLOT: delivery-models/item-2-description]",
      },
      {
        title: "[SLOT: delivery-models/item-3-title]",
        description: "[SLOT: delivery-models/item-3-description]",
      },
    ],
  },

  useCases: {
    eyebrow: "[SLOT: use-cases/eyebrow]",
    title: "[SLOT: use-cases/title]",
    description: "[SLOT: use-cases/description]",
    items: [
      {
        tag: "[SLOT: use-cases/item-1-tag]",
        title: "[SLOT: use-cases/item-1-title]",
        description: "[SLOT: use-cases/item-1-description]",
      },
      {
        tag: "[SLOT: use-cases/item-2-tag]",
        title: "[SLOT: use-cases/item-2-title]",
        description: "[SLOT: use-cases/item-2-description]",
      },
      {
        tag: "[SLOT: use-cases/item-3-tag]",
        title: "[SLOT: use-cases/item-3-title]",
        description: "[SLOT: use-cases/item-3-description]",
      },
      {
        tag: "[SLOT: use-cases/item-4-tag]",
        title: "[SLOT: use-cases/item-4-title]",
        description: "[SLOT: use-cases/item-4-description]",
      },
    ],
  },

  contactSection: {
    eyebrow: "[SLOT: contact/eyebrow]",
    title: "[SLOT: contact/title]",
    description: "[SLOT: contact/description]",
    highlights: [
      {
        title: "[SLOT: contact/highlight-1-title]",
        description: "[SLOT: contact/highlight-1-description]",
      },
      {
        title: "[SLOT: contact/highlight-2-title]",
        description: "[SLOT: contact/highlight-2-description]",
      },
      {
        title: "[SLOT: contact/highlight-3-title]",
        description: "[SLOT: contact/highlight-3-description]",
      },
    ],
  },

  pastWork: {
    eyebrow: "[SLOT: past-work/eyebrow]",
    title: "[SLOT: past-work/title]",
    description: "[SLOT: past-work/description]",
    items: [
      {
        title: "[SLOT: past-work/item-1-title]",
        outcome: "[SLOT: past-work/item-1-outcome]",
        link: "[SLOT: past-work/item-1-link]",
      },
      {
        title: "[SLOT: past-work/item-2-title]",
        outcome: "[SLOT: past-work/item-2-outcome]",
        link: "[SLOT: past-work/item-2-link]",
      },
    ],
  },

  reviews: {
    eyebrow: "[SLOT: reviews/eyebrow]",
    title: "[SLOT: reviews/title]",
    description: "[SLOT: reviews/description]",
    items: [
      {
        quote: "[SLOT: reviews/item-1-quote]",
        author: "[SLOT: reviews/item-1-author]",
        role: "[SLOT: reviews/item-1-role]",
        company: "[SLOT: reviews/item-1-company]",
      },
      {
        quote: "[SLOT: reviews/item-2-quote]",
        author: "[SLOT: reviews/item-2-author]",
        role: "[SLOT: reviews/item-2-role]",
        company: "[SLOT: reviews/item-2-company]",
      },
    ],
  },

  pricing: {
    eyebrow: "[SLOT: pricing/eyebrow]",
    title: "[SLOT: pricing/title]",
    description: "[SLOT: pricing/description]",
    tiers: [
      {
        name: "[SLOT: pricing/tier-1-name]",
        price: "[SLOT: pricing/tier-1-price]",
        description: "[SLOT: pricing/tier-1-description]",
        features: [
          "[SLOT: pricing/tier-1-feature-1]",
          "[SLOT: pricing/tier-1-feature-2]",
          "[SLOT: pricing/tier-1-feature-3]",
        ],
      },
      {
        name: "[SLOT: pricing/tier-2-name]",
        price: "[SLOT: pricing/tier-2-price]",
        description: "[SLOT: pricing/tier-2-description]",
        features: [
          "[SLOT: pricing/tier-2-feature-1]",
          "[SLOT: pricing/tier-2-feature-2]",
          "[SLOT: pricing/tier-2-feature-3]",
        ],
      },
      {
        name: "[SLOT: pricing/tier-3-name]",
        price: "[SLOT: pricing/tier-3-price]",
        description: "[SLOT: pricing/tier-3-description]",
        features: [
          "[SLOT: pricing/tier-3-feature-1]",
          "[SLOT: pricing/tier-3-feature-2]",
          "[SLOT: pricing/tier-3-feature-3]",
        ],
      },
    ],
  },

  faq: {
    eyebrow: "[SLOT: faq/eyebrow]",
    title: "[SLOT: faq/title]",
    description: "[SLOT: faq/description]",
    items: [
      {
        question: "[SLOT: faq/item-1-question]",
        answer: "[SLOT: faq/item-1-answer]",
      },
      {
        question: "[SLOT: faq/item-2-question]",
        answer: "[SLOT: faq/item-2-answer]",
      },
      {
        question: "[SLOT: faq/item-3-question]",
        answer: "[SLOT: faq/item-3-answer]",
      },
    ],
  },

  aboutFounder: {
    eyebrow: "[SLOT: about/eyebrow]",
    title: "[SLOT: about/title]",
    description: "[SLOT: about/description]",
    cardTitleBio: "[SLOT: about/card-title-bio]",
    cardTitleCredentials: "[SLOT: about/card-title-credentials]",
    bio: "[SLOT: about/bio]",
    credentials: [
      "[SLOT: about/credential-1]",
      "[SLOT: about/credential-2]",
      "[SLOT: about/credential-3]",
    ],
  },
};
