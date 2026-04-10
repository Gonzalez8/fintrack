import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://fintrack-quintela.vercel.app";

const locales = ["es", "en", "de", "fr", "it"];

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    {
      path: "",
      priority: 1,
      changeFrequency: "monthly" as const,
    },
    {
      path: "/welcome",
      priority: 0.9,
      changeFrequency: "monthly" as const,
    },
    {
      path: "/login",
      priority: 0.5,
      changeFrequency: "yearly" as const,
    },
  ];

  const sitemap: MetadataRoute.Sitemap = [];

  routes.forEach((route) => {
    sitemap.push({
      url: `${SITE_URL}${route.path}`,
      lastModified: new Date(),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: {
        languages: Object.fromEntries(
          locales.map((locale) => [locale, `${SITE_URL}${route.path}?lang=${locale}`])
        ),
      },
    });
  });

  return sitemap;
}
