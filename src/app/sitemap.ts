import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Projects exist on each user's device, not as public pages.
  return [{ url: siteConfig.url }];
}
