import type { Metadata } from "next";
import type { Locale } from "./constants";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://fintrack-quintela.vercel.app";

interface SeoMessages {
  "seo.title": string;
  "seo.description": string;
  "seo.ogTitle": string;
  "seo.ogDescription": string;
  "seo.keywords": string;
}

const localeToLanguageMap: Record<Locale, string> = {
  es: "es_ES",
  en: "en_US",
  de: "de_DE",
  fr: "fr_FR",
  it: "it_IT",
};

export function generateMetadata(
  messages: SeoMessages,
  locale: Locale = "es",
): Metadata {
  return {
    title: messages["seo.title"],
    description: messages["seo.description"],
    keywords: messages["seo.keywords"],
    metadataBase: new URL(SITE_URL),
    openGraph: {
      title: messages["seo.ogTitle"],
      description: messages["seo.ogDescription"],
      url: SITE_URL,
      siteName: "Fintrack",
      locale: localeToLanguageMap[locale],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: messages["seo.ogTitle"],
      description: messages["seo.ogDescription"],
    },
    alternates: {
      canonical: SITE_URL,
      languages: {
        "es-ES": `${SITE_URL}?lang=es`,
        "en-US": `${SITE_URL}?lang=en`,
        "de-DE": `${SITE_URL}?lang=de`,
        "fr-FR": `${SITE_URL}?lang=fr`,
        "it-IT": `${SITE_URL}?lang=it`,
      },
    },
  };
}

export function generateJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Fintrack",
        description: "Self-hosted investment tracking application",
        inLanguage: ["es-ES", "en-US", "de-DE", "fr-FR", "it-IT"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#softwareapplication`,
        name: "Fintrack",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description: "Portfolio, transactions, dividends, interests and tax tracking",
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "5",
          ratingCount: "1",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Fintrack",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
        sameAs: ["https://github.com/Gonzalez8/fintrack"],
      },
    ],
  };
}
