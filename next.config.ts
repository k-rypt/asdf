import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@assessment-toolkit/core", "@assessment-toolkit/ui"],
  async headers() {
    return [
      {
        // Self-hosted Pyodide (scripts/copy-pyodide.mjs). The folder name is
        // the pinned version, so its contents never change at a given URL --
        // cache for a year and skip revalidation; an upgrade changes the URL.
        source: "/pyodide/:version/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
