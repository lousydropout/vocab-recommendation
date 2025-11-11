import { type SignInOutput } from 'aws-amplify/auth';
/**
 * Sign in with email and password
 */
export declare function login(email: string, password: string): Promise<SignInOutput>;
/**
 * Sign out the current user
 */
export declare function logout(): Promise<void>;
/**
 * Get the current authentication token
 */
export declare function getToken(): Promise<string | null>;
/**
 * Check if user is authenticated
 */
export declare function isAuthenticated(): Promise<boolean>;
/**
 * Get current user info
 */
export declare function getCurrentUserInfo(): Promise<import("aws-amplify/auth").AuthUser | null>;
