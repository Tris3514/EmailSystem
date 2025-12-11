/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // Disable server-side features for static export
  // API routes will need to be hosted separately
  // Skip API routes during static export (they won't work on GitHub Pages)
  distDir: '.next',
}

module.exports = nextConfig

