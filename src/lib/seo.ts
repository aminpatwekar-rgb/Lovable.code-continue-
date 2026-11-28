// Central SEO helpers for the public pages.
export const SITE_URL = "https://workonyx.org";
export const SITE_NAME = "ONYX";
export const SITE_TAGLINE = "One platform for every classroom";
export const OG_IMAGE = `${SITE_URL}/icon-512.png`;

export function canonicalLink(path: string) {
  return { rel: "canonical", href: `${SITE_URL}${path === "/" ? "" : path}` };
}

/** Builds a JSON-LD <script> entry for a route's `head().scripts`. */
export function jsonLd(data: Record<string, unknown>) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

export const ORGANIZATION_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  email: "workonyx.support@gmail.com",
  slogan: SITE_TAGLINE,
};

export const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
};

export const SOFTWARE_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description:
    "Handwriting-first assignment platform for schools and colleges: classes, scanned or paste-locked typed submissions, quizzes, grading and feedback.",
};

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path === "/" ? "" : it.path}`,
    })),
  };
}

export function faqLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
