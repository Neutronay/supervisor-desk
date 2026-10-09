/** @type {import('next').NextConfig} */
const nextConfig = {
  // Files go browser -> Supabase Storage directly, so server actions only carry small payloads.
  reactStrictMode: true
};
export default nextConfig;
