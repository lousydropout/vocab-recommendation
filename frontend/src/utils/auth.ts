import { Amplify } from 'aws-amplify';
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  type SignInOutput,
} from 'aws-amplify/auth';

import { config } from './config';

// Cognito configuration from CDK outputs
const COGNITO_USER_POOL_ID = config.COGNITO_USER_POOL_ID;
const COGNITO_USER_POOL_CLIENT_ID = config.COGNITO_USER_POOL_CLIENT_ID;

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: COGNITO_USER_POOL_ID,
      userPoolClientId: COGNITO_USER_POOL_CLIENT_ID,
      loginWith: {
        email: true,
      },
    },
  },
});

const TOKEN_KEY = 'cognito_id_token';

/**
 * Sign in with email and password
 */
export async function login(email: string, password: string): Promise<SignInOutput> {
  try {
    const output = await signIn({
      username: email,
      password,
    });

    // Store token after successful sign-in
    if (output.isSignedIn) {
      await storeToken();
    }

    return output;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Sign out the current user
 */
export async function logout(): Promise<void> {
  try {
    await signOut();
    localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('Logout error:', error);
    // Clear token even if signOut fails
    localStorage.removeItem(TOKEN_KEY);
    throw error;
  }
}

/**
 * Get the current authentication token
 */
export async function getToken(): Promise<string | null> {
  try {
    // Try to get from session first
    const session = await fetchAuthSession();
    if (session.tokens?.idToken) {
      const token = session.tokens.idToken.toString();
      localStorage.setItem(TOKEN_KEY, token);
      return token;
    }

    // Fallback to localStorage
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Error getting token:', error);
    // Fallback to localStorage
    return localStorage.getItem(TOKEN_KEY);
  }
}

/**
 * Store token in localStorage
 */
async function storeToken(): Promise<void> {
  try {
    const session = await fetchAuthSession();
    if (session.tokens?.idToken) {
      const token = session.tokens.idToken.toString();
      localStorage.setItem(TOKEN_KEY, token);
    }
  } catch (error) {
    console.error('Error storing token:', error);
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    return !!user;
  } catch (error) {
    return false;
  }
}

/**
 * Get current user info
 */
export async function getCurrentUserInfo() {
  try {
    const user = await getCurrentUser();
    return user;
  } catch (error) {
    return null;
  }
}

