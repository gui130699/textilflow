import type { NextConfig } from "next";

const spark = process.env.NEXT_PUBLIC_API_MODE === "firestore";

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  pageExtensions: spark
    ? ["spark.tsx", "tsx", "ts", "jsx", "js"]
    : ["server.tsx", "server.ts", "tsx", "ts", "jsx", "js"],
  ...(spark
    ? { output: "export" as const }
    : {
        serverExternalPackages: ["firebase-admin", "firebase-functions"],
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Referrer-Policy", value: "no-referrer" },
                {
                  key: "Permissions-Policy",
                  value: "camera=(), microphone=(), geolocation=()",
                },
              ],
            },
          ];
        },
      }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
