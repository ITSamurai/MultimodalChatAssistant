import fs from 'fs';
import path from 'path';

/**
 * This script is used to copy important static files to the build directory
 * to ensure they're properly served in production.
 */

// Ensure dist/public directory exists
const distPublicDir = path.join(process.cwd(), 'dist', 'public');
if (!fs.existsSync(distPublicDir)) {
  console.log(`Creating dist/public directory at ${distPublicDir}`);
  fs.mkdirSync(distPublicDir, { recursive: true });
}

// Copy robots.txt
const robotsSource = path.join(process.cwd(), 'public', 'robots.txt');
const robotsTarget = path.join(distPublicDir, 'robots.txt');
if (fs.existsSync(robotsSource)) {
  console.log(`Copying robots.txt to ${robotsTarget}`);
  fs.copyFileSync(robotsSource, robotsTarget);
} else {
  console.log('Creating robots.txt directly in dist/public');
  fs.writeFileSync(robotsTarget, `User-agent: *
Disallow: /
`);
}

// Create sitemap.xml
const sitemapTarget = path.join(distPublicDir, 'sitemap.xml');
console.log(`Creating sitemap.xml at ${sitemapTarget}`);
fs.writeFileSync(sitemapTarget, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- Intentionally empty to prevent search engines from indexing the site -->
</urlset>`);

console.log('Static files have been copied to the build directory');