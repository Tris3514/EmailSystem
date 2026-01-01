/** @type {import('next').NextConfig} */
const nextConfig = {
  // Azure App Service supports full Next.js with API routes
  // Use standalone output for optimized Azure deployments (optional)
  // Set AZURE_DEPLOYMENT=true and AZURE_USE_STANDALONE=true to enable
  output: (process.env.AZURE_DEPLOYMENT === 'true' && process.env.AZURE_USE_STANDALONE === 'true') 
    ? 'standalone' 
    : undefined,
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig

