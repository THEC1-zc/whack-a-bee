import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["imagedelivery.net", "res.cloudinary.com"],
  },
  async redirects() {
    return [
      {
        source: "/.well-known/farcaster.json",
        destination: "https://api.farcaster.xyz/miniapps/hosted-manifest/019c719c-0c84-248a-a577-41ed4db2c4da",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
