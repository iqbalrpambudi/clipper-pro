/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["konva", "react-konva"],
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || "http://api:8080";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${apiUrl}/storage/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/projects/:id",
        destination: "/project/:id",
        permanent: false,
      },
      {
        source: "/projects/short/:id",
        destination: "/project/short/:id",
        permanent: false,
      },
      {
        source: "/projects/storyboard/:id",
        destination: "/project/storyboard/:id",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
