export const sampleEvents = [
  {
    type: "scan:start",
    payload: { url: "https://example.com", level: "AA", maxPages: 5 },
    receivedAt: "2026-05-29T09:31:00.000Z",
  },
  {
    type: "discovery:start",
    payload: { url: "https://example.com" },
    receivedAt: "2026-05-29T09:31:01.000Z",
  },
  {
    type: "discovery:complete",
    payload: { count: 4 },
    receivedAt: "2026-05-29T09:31:04.000Z",
  },
  {
    type: "audit:page:complete",
    payload: { url: "https://example.com", violations: 0 },
    receivedAt: "2026-05-29T09:31:08.000Z",
  },
  {
    type: "audit:page:error",
    payload: { url: "https://example.com/legal", error: "Navigation timed out after 30000ms" },
    receivedAt: "2026-05-29T09:31:13.000Z",
  },
  {
    type: "scan:complete",
    payload: { exitCode: 1 },
    receivedAt: "2026-05-29T09:31:15.000Z",
  },
];

export const sampleResult = {
  schemaVersion: 1,
  generatedAt: "2026-05-29T09:31:15.000Z",
  summary: {
    totalPages: 4,
    scannedPages: 4,
    totalViolations: 5,
    affectedElements: 8,
    countNodes: 8,
    pagesWithViolations: 2,
    pagesWithIssues: 2,
    pagesWithErrors: 1,
    bySeverity: {
      critical: 1,
      serious: 2,
      moderate: 1,
      minor: 1,
    },
  },
  pages: [
    {
      url: "https://example.com",
      pageTitle: "Example Home",
      loadTimeMs: 642,
      violations: [],
    },
    {
      url: "https://example.com/pricing",
      pageTitle: "Pricing",
      loadTimeMs: 890,
      violations: [
        {
          id: "color-contrast",
          impact: "critical",
          description: "Ensure the contrast between foreground and background colors meets WCAG thresholds.",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
          wcagTags: ["wcag2aa", "wcag143"],
          nodes: [
            {
              html: "<button class=\"primary\">Start scan</button>",
              target: [".pricing-hero .primary"],
              failureSummary: "Text contrast ratio is below the required 4.5:1 threshold.",
            },
            {
              html: "<span class=\"muted-price\">per month</span>",
              target: [".price-card .muted-price"],
              failureSummary: "Small text has insufficient contrast.",
            },
          ],
        },
        {
          id: "button-name",
          impact: "serious",
          description: "Ensure buttons have discernible text.",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.11/button-name",
          wcagTags: ["wcag2a", "wcag412"],
          nodes: [
            {
              html: "<button aria-label=\"\"></button>",
              target: [".carousel-next"],
              failureSummary: "Button is empty and has no accessible name.",
            },
          ],
        },
      ],
    },
    {
      url: "https://example.com/docs",
      pageTitle: "Docs",
      loadTimeMs: 711,
      violations: [
        {
          id: "html-has-lang",
          impact: "serious",
          description: "Ensure every HTML document has a lang attribute.",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.11/html-has-lang",
          wcagTags: ["wcag2a", "wcag311"],
          nodes: [
            {
              html: "<html>",
              target: ["html"],
              failureSummary: "The html element does not have a lang attribute.",
            },
          ],
        },
        {
          id: "image-alt",
          impact: "moderate",
          description: "Ensure images have alternate text or a role of none or presentation.",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.11/image-alt",
          wcagTags: ["wcag2a", "wcag111"],
          nodes: [
            {
              html: "<img src=\"architecture.png\">",
              target: ["main img:nth-of-type(1)"],
              failureSummary: "Image element is missing alt text.",
            },
            {
              html: "<img src=\"diagram.png\">",
              target: ["main img:nth-of-type(2)"],
              failureSummary: "Image element is missing alt text.",
            },
          ],
        },
        {
          id: "link-name",
          impact: "minor",
          description: "Ensure links have discernible text.",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.11/link-name",
          wcagTags: ["wcag2a", "wcag412"],
          nodes: [
            {
              html: "<a href=\"/support\"><svg></svg></a>",
              target: [".support-link"],
              failureSummary: "Link has no text or accessible label.",
            },
            {
              html: "<a href=\"/next\"><span></span></a>",
              target: [".next-page"],
              failureSummary: "Link has no discernible text.",
            },
          ],
        },
      ],
    },
    {
      url: "https://example.com/legal",
      pageTitle: "Legal",
      loadTimeMs: 0,
      error: "Navigation timed out after 30000ms",
      violations: [],
    },
  ],
};
