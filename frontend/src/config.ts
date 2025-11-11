// Environment configuration
// For Vite, use import.meta.env.VITE_API_URL, etc.
// For browser builds, these can be set via environment variables

declare const process: {
  env: {
    API_URL?: string;
    COGNITO_USER_POOL_ID?: string;
    COGNITO_USER_POOL_CLIENT_ID?: string;
  };
} | undefined;

export const config = {
  API_URL: (typeof process !== 'undefined' && process.env?.API_URL)
    ? process.env.API_URL
    : (typeof window !== 'undefined' && (window as any).__ENV__?.API_URL)
    ? (window as any).__ENV__.API_URL
    : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    ? import.meta.env.VITE_API_URL
    : "https://m18eg6bei9.execute-api.us-east-1.amazonaws.com/prod",
  
  COGNITO_USER_POOL_ID: (typeof process !== 'undefined' && process.env?.COGNITO_USER_POOL_ID)
    ? process.env.COGNITO_USER_POOL_ID
    : (typeof window !== 'undefined' && (window as any).__ENV__?.COGNITO_USER_POOL_ID)
    ? (window as any).__ENV__.COGNITO_USER_POOL_ID
    : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COGNITO_USER_POOL_ID)
    ? import.meta.env.VITE_COGNITO_USER_POOL_ID
    : 'us-east-1_65hpvHpPX',
  
  COGNITO_USER_POOL_CLIENT_ID: (typeof process !== 'undefined' && process.env?.COGNITO_USER_POOL_CLIENT_ID)
    ? process.env.COGNITO_USER_POOL_CLIENT_ID
    : (typeof window !== 'undefined' && (window as any).__ENV__?.COGNITO_USER_POOL_CLIENT_ID)
    ? (window as any).__ENV__.COGNITO_USER_POOL_CLIENT_ID
    : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COGNITO_USER_POOL_CLIENT_ID)
    ? import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID
    : 'jhnvud4iqcf15vac6nc2d2b9p',
};


