import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots { const url = process.env.NEXT_PUBLIC_SITE_URL; return url?.startsWith("https://") ? { rules: { userAgent: "*", allow: "/", disallow: ["/*/checkout"] }, sitemap: `${url.replace(/\/$/, "")}/sitemap.xml` } : { rules: { userAgent: "*", disallow: "/" } }; }
