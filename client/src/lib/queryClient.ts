import { QueryClient } from '@tanstack/react-query';

// Create a QueryClient with default options
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Generic type for API response
interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<T>;
  text: () => Promise<string>;
}

// Api request options
interface ApiRequestOptions {
  on401?: 'throw' | 'returnNull' | 'returnResponse';
  headers?: Record<string, string>;
  timeout?: number;
}

// Create a reusable API request function
export async function apiRequest<T = any>(
  method: string,
  url: string,
  body?: any,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  // Set default options
  const { 
    on401 = 'throw',
    headers: customHeaders = {},
    timeout = 30000 // 30 seconds default timeout
  } = options;

  // Get auth token from localStorage
  const authToken = localStorage.getItem('authToken');
  console.log(`API Request to ${url} - Auth token exists: ${Boolean(authToken)}`);

  // Prepare request options
  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...customHeaders,
    },
    credentials: 'include',
  };

  // Add auth token if available
  if (authToken) {
    requestOptions.headers = {
      ...requestOptions.headers,
      'Authorization': `Bearer ${authToken}`,
    };
    console.log(`Using token for ${url}: ${authToken.substring(0, 15)}...`);
  }

  // Add body if provided
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    requestOptions.body = JSON.stringify(body);
  }

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeout);
  });

  try {
    // Make the request with timeout
    const response = await Promise.race([
      fetch(url, requestOptions),
      timeoutPromise
    ]) as Response;

    // Check for new token in response
    const newToken = response.headers.get('authorization');
    if (newToken && newToken.startsWith('Bearer ')) {
      const token = newToken.substring(7);
      localStorage.setItem('authToken', token);
    }

    // Handle 401 Unauthorized based on options
    if (response.status === 401) {
      if (on401 === 'returnNull') {
        return null as any;
      } else if (on401 === 'returnResponse') {
        // Return response object with extra methods
        return {
          ok: response.ok,
          status: response.status,
          headers: response.headers,
          json: () => response.json(),
          text: () => response.text(),
        };
      } else {
        // Default behavior: throw error
        throw new Error('Not authenticated');
      }
    }

    // Return response object with extra methods
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      json: () => response.json(),
      text: () => response.text(),
    };
  } catch (error) {
    console.error(`API request error (${method} ${url}):`, error);
    throw error;
  }
}

/**
 * Create a query function that uses apiRequest
 */
export function getQueryFn<T = any>({ on401 = 'throw' }: { on401?: 'throw' | 'returnNull' | 'returnResponse' } = {}) {
  return async (context: any): Promise<T | null> => {
    try {
      // Extract URL and parameters from the query key
      const [url, params] = context.queryKey;
      
      // Append params to URL if they exist and URL doesn't already have query params
      const fullUrl = params && !url.includes('?') 
        ? `${url}?${new URLSearchParams(params).toString()}` 
        : url;
        
      const response = await apiRequest<T>('GET', fullUrl, undefined, { on401 });
      
      if (!response) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  };
}