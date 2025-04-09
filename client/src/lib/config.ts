// Constants and environment configuration

// URL Configuration - determines what base URL to use for the application
// This allows us to deploy to different domains without code changes
export const BASE_URL = 
  // Check if we're running in production and if a specific domain is defined
  process.env.NODE_ENV === 'production' && import.meta.env.VITE_DOMAIN
    ? import.meta.env.VITE_DOMAIN
    // If no production domain is set, use the current URL
    : window.location.origin;

console.log('Using BASE_URL:', BASE_URL);

// Override the base URL when running in production
// This is mainly for deployment to custom domains like vertical-assistant.com
export function getFullUrl(path: string): string {
  if (path.startsWith('http')) {
    return path; // Path is already absolute
  }
  
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  return `${BASE_URL}/${cleanPath}`;
}