import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.rushpizzaburger.com";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/home", "/menu", "/about", "/cart", "/checkout"],
      disallow: [
        "/admin",
        "/admin/*",
        "/pos",
        "/pos/*",
        "/kitchen",
        "/kitchen/*",
        "/login",
        "/api/*",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
