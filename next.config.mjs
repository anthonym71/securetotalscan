/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow accessing the dev server from other devices on the local network
  // (e.g. viewing on your phone at http://192.168.1.21:3001). Dev-only.
  allowedDevOrigins: ["192.168.1.21", "192.168.1.*"],
};

export default nextConfig;
