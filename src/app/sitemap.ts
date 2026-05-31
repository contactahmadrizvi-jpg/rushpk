import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.rushpizzaburger.com";

  // Define customer-facing routes to index on Google
  const routes = [
    "",
    "/home",
    "/menu",
    "/about",
    "/cart",
    "/checkout",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" || route === "/menu" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/menu" ? 0.9 : 0.7,
  }));
}
