/**
 * "How to connect" copy for each source, shown on the source page (app/source-guide.tsx).
 * Written from the real flows (app/api/oauth/<source>/{start,callback,pick}, lib/google-connect.ts):
 * the steps are what an owner actually sees. Second person, no jargon. Edit wording here only;
 * tests/source-guides.test.mjs keeps it to six steps and free of technical words.
 */
import { HUB_SOURCES, type HubSource } from "./sources";

export interface SourceGuide {
  intro: string;
  /** At most six: one short action each. */
  steps: string[];
  after: string;
}

const SYNC = "You land back here and your first sync starts within the hour.";
const GOOGLE_AFTER = "Google Meet and Google Drive use the same Google sign-in.";

export const GUIDES: Record<HubSource, SourceGuide> = {
  shopify: {
    intro: "Connect your Shopify store so bcns can read your sales. The install happens in the Shopify App Store.",
    steps: [
      "Press Connect on the Shopify card. The bcns Connect page in the Shopify App Store opens in a new tab.",
      "Press Install (Shopify may call it Add app) and sign in to your store if Shopify asks.",
      "Approve the access Shopify shows you. bcns can only read your orders, products, customers, inventory, reports and payouts. It can't change anything in your store.",
      "If asked, sign in to bcns Connect with your owner login.",
      "If Shopify shows a plan page, approve it.",
      "bcns Connect opens in that same tab and your first sync starts within the hour. The tab you started from shows it after a reload.",
    ],
    after:
      "One workspace connects one store. To switch stores, the owner disconnects it under Sources, Shopify, waits a few minutes for its data to be removed, then installs bcns Connect on the new store.",
  },
  meta: {
    intro: "Connect your Meta (Facebook) ad account so bcns can read how your ads are doing.",
    steps: [
      "Press Connect on the Meta Ads card.",
      "Sign in to Facebook and approve read access to your ads. bcns can't change or create ads.",
      "If your login can see more than one ad account, choose the one to connect.",
      SYNC,
    ],
    after: "The Facebook login you use needs access to the ad account you want. The sign-in lasts about two months. When the card says Reconnect needed, press Connect again with the same login.",
  },
  monday: {
    intro: "Connect monday.com so bcns can read one of your boards.",
    steps: [
      "Press Connect on the Monday.com card.",
      "Sign in to monday.com and approve.",
      "If your login can see more than one board, choose the one to connect.",
      SYNC,
    ],
    after: "bcns syncs one board at a time.",
  },
  meet: {
    intro: "Connect Google so bcns can read the notes your meetings save to Google Drive.",
    steps: [
      "Press Connect on the Google Meet card.",
      "Sign in to Google and approve.",
      "Google shows a folder picker. Choose the folder your meeting notes are saved in.",
      SYNC,
    ],
    after: GOOGLE_AFTER,
  },
  drive: {
    intro: "Connect Google so bcns can read the files in one Google Drive folder.",
    steps: [
      "Press Connect on the Google Drive card.",
      "Sign in to Google and approve.",
      "Google shows a folder picker. Choose the folder you want to bring in.",
      SYNC,
    ],
    after: `bcns syncs that folder and the files inside it, and nothing else in your Drive. You can change the folder later on this page. ${GOOGLE_AFTER}`,
  },
  quickbooks: {
    intro: "Connect QuickBooks so bcns can read your company's accounting data.",
    steps: [
      "Press Connect on the QuickBooks card.",
      "Sign in to Intuit, the company that makes QuickBooks.",
      "If Intuit asks which company to use, choose it, then approve.",
      SYNC,
    ],
    after: "One workspace connects one QuickBooks company.",
  },
};

/** `/guide?source=`: one HubSource shows just that guide; missing or unknown means all of them (null). */
export function guideFilter(param: string | string[] | undefined): HubSource | null {
  return HUB_SOURCES.find((s) => s === param) ?? null;
}

/** Shown under every guide: who sees Connect, and what to do when the card says something else. */
export const GUIDE_FOOTER =
  "Only the workspace owner sees Connect. Other members see Request connection, which emails bcns and we set it up with you.";
