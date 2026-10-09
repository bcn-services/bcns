REVIEW: 0C/0I/1M
# Review Report
**Date:** 2026-10-08
**Files Reviewed:** 7

## Findings

### Minor
Minor — apps/sb/app/layout.tsx:7 — Before this change, `next/font/google` served Inter Tight's latin-ext/vietnamese/cyrillic/greek faces as well as latin (subsets only controls preload). The vendored latin file is missing ₹ U+20B9, ł, ő, ș and Ğ (I decoded its cmap). An INR tenant's currency symbol, or a product/campaign/vendor name with latin-ext letters, now renders those glyphs in system-ui in the middle of a word. A USD/English tenant (the Shopify reviewer) sees no change. "→" U+2192 is in no Google subset, so it falls back both before and after. — Accept it and add one line to apps/sb/app/fonts/README.md saying non-latin glyphs fall back. Vendor the latin-ext woff2 only when a non-English tenant lands.

## STANDARDS.md Updates
- Money: stored money is amount x 100 for every currency; formatters divide by 100, and Intl picks only the display digits
- Fonts: self-host with next/font/local and never next/font/google; vendored latin variable woff2 + licence + provenance README; weight is an axis range; latin-ext falls back
