// This file can be included in the production build process
// It ensures robots.txt is properly served as plain text

const fs = require('fs');
const path = require('path');

module.exports = function(app) {
  // Explicitly serve robots.txt as plain text
  app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    
    // Try to read from the file system first
    const robotsPath = path.join(process.cwd(), 'public', 'robots.txt');
    if (fs.existsSync(robotsPath)) {
      res.send(fs.readFileSync(robotsPath, 'utf8'));
    } else {
      // Fallback content
      res.send(`User-agent: *
Disallow: /`);
    }
  });
  
  // Explicitly serve sitemap.xml
  app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- Intentionally empty to prevent search engines from indexing the site -->
</urlset>`);
  });
};