# RiverMeadow AI Assistant

AI-powered document assistant that integrates with Pinecone vector database to provide intelligent responses based on a knowledge base.

## SEO Protection

This application uses multiple layers of protection to prevent search engines from indexing its content:

1. **robots.txt**: 
   - Blocks all search engines with `User-agent: * Disallow: /`
   - Specifically blocks major bots like Googlebot, Bingbot, etc.
   - Located at `/public/robots.txt`

2. **X-Robots-Tag Headers**: 
   - All responses include: `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`
   - Implemented in Express middleware

3. **Meta Tags**:
   - HTML includes meta robot tags: `<meta name="robots" content="noindex, nofollow">`
   - Specific tags for major crawlers

4. **sitemap.xml**:
   - Empty sitemap to prevent discovery of any URLs

## Deployment Notes

### Important: Serving robots.txt Correctly

When deploying to production, ensure robots.txt is served with the correct content type:

```
Content-Type: text/plain
```

If you encounter issues with robots.txt being served as HTML:

1. **Express Option (Current Implementation):**
   - The Express routes in `server/routes.ts` define explicit handlers for `/robots.txt` and `/sitemap.xml`
   - These should work in both development and production

2. **Web Server Configuration:**
   - For Nginx: Use the configuration in `public/nginx-config.conf`
   - For Apache: Use the .htaccess file in `public/.htaccess`

3. **Manual Test:**
   - Verify with: `curl -I https://yourdomain.com/robots.txt`
   - Should show `Content-Type: text/plain`

## Running the Application

```
npm run dev
```

## Building for Production

```
npm run build
npm run start
```