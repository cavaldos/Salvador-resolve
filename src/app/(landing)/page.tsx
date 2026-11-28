import { siteConfig } from "@/config/site";
import { MinimalLanding } from "@/modules/landing/components/MinimalLanding";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteConfig.url}/#website`,
      name: siteConfig.name,
      alternateName: "Salvador Video Editor",
      url: siteConfig.url,
      description: siteConfig.description,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${siteConfig.url}/#application`,
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
      applicationCategory: "MultimediaApplication",
      browserRequirements:
        "Requires JavaScript and a browser with supported media APIs.",
      featureList: [
        "Multi-track video editing",
        "Text, image, and audio layers",
        "Local project storage",
        "MP4 and WebM export, depending on browser support",
      ],
      isPartOf: { "@id": `${siteConfig.url}/#website` },
    },
  ],
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-mkt-bg text-mkt-fg">
      <link rel="canonical" href={siteConfig.url} />
      <script type="application/ld+json">
        {JSON.stringify(structuredData).replace(/</g, "\\u003c")}
      </script>
      <MinimalLanding />
    </div>
  );
}
