import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as authApi from '../lib/authApi';
import * as profileApi from '../lib/profileApi';

const initial = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

const useAuthStore = create(
  persist(
    (set, get) => ({
      ...initial,

      /**
       * Sign up a new user
       */
      signup: async ({ password, name, username, autoGenerateUsername }) => {
        set({ isLoading: true, error: null });
        try {
          const { user, accessToken } = await authApi.signup({ password, name, username, autoGenerateUsername });
          set({
            user,
            accessToken,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return { user, accessToken };
        } catch (error) {
          set({
            isLoading: false,
            error: error.message || 'Signup failed',
          });
          throw error;
        }
      },

      /**
       * Log in a user
       */
      login: async ({ username, password }) => {
        set({ isLoading: true, error: null });
        try {
          const { user, accessToken } = await authApi.login({ username, password });
          set({
            user,
            accessToken,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return { user, accessToken };
        } catch (error) {
          set({
            isLoading: false,
            error: error.message || 'Login failed',
          });
          throw error;
        }
      },

      /**
       * Log out the current user
       */
      logout: async () => {
        set({ isLoading: true });
        try {
          await authApi.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            ...initial,
            isLoading: false,
          });
        }
      },

      /**
       * Refresh access token
       */
      refreshToken: async () => {
        try {
          const { accessToken } = await authApi.refreshToken();
          set({ accessToken });
          return accessToken;
        } catch (error) {
          // If refresh fails, logout user
          get().logout();
          throw error;
        }
      },

      /**
       * Get current user info
       */
      fetchUser: async () => {
        set({ isLoading: true, error: null });
        try {
          const user = await authApi.getCurrentUser();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return user;
        } catch (error) {
          // Don't treat rate limit errors as auth failures
          const isRateLimit = error.message?.includes('rate limit') || 
                             error.message?.includes('RATE_LIMITED') ||
                             error.message?.includes('RATE_LIMIT_EXCEEDED');
          
          if (isRateLimit) {
            // Rate limit error - don't change auth state, just set error
            set({
              isLoading: false,
              error: error.message || 'API rate limit exceeded',
            });
            throw error;
          }
          
          // Don't set isAuthenticated to false on error - let ProtectedRoute handle auth checks
          // This prevents redirects when profile page tries to fetch user
          set({
            isLoading: false,
            error: error.message || 'Failed to fetch user',
          });
          throw error;
        }
      },

      /**
       * Initialize auth state from stored token
       */
      initialize: async () => {
        const storedToken = authApi.getAccessToken();
        if (!storedToken) {
          set({ isAuthenticated: false, user: null });
          return;
        }

        set({ isLoading: true });
        try {
          const user = await authApi.getCurrentUser();
          set({
            user,
            accessToken: storedToken,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          // Don't treat rate limit errors as auth failures
          const isRateLimit = error.message?.includes('rate limit') || 
                             error.message?.includes('RATE_LIMITED') ||
                             error.message?.includes('RATE_LIMIT_EXCEEDED');
          
          if (isRateLimit) {
            // Rate limit error - keep auth state, just set error
            set({
              isLoading: false,
              error: error.message || 'API rate limit exceeded',
            });
            return;
          }
          
          // Token might be invalid, try to refresh
          try {
            await get().refreshToken();
            const user = await authApi.getCurrentUser();
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (refreshError) {
            // Check if refresh error is also rate limit
            const isRefreshRateLimit = refreshError.message?.includes('rate limit') || 
                                      refreshError.message?.includes('RATE_LIMITED') ||
                                      refreshError.message?.includes('RATE_LIMIT_EXCEEDED');
            
            if (isRefreshRateLimit) {
              // Rate limit on refresh - keep auth state
              set({
                isLoading: false,
                error: refreshError.message || 'API rate limit exceeded',
              });
              return;
            }
            
            // Both failed and not rate limits, clear auth state
            set({
              ...initial,
              isLoading: false,
            });
          }
        }
      },

      /**
       * Update user profile
       */
      updateProfile: async (profileData) => {
        set({ isLoading: true, error: null });
        try {
          const { profile } = await profileApi.updateProfile(profileData);
          // Refresh full user data to get updated stats and avatar
          const updatedUser = await authApi.getCurrentUser();
          set({
            user: updatedUser,
            isLoading: false,
            error: null,
          });
          return profile;
        } catch (error) {
          set({
            isLoading: false,
            error: error.message || 'Failed to update profile',
          });
          throw error;
        }
      },

      /**
       * Update user preferences
       */
      updatePreferences: async (preferences) => {
        set({ isLoading: true, error: null });
        try {
          const { preferences: updatedPreferences } = await profileApi.updatePreferences(preferences);
          const currentUser = get().user;
          set({
            user: {
              ...currentUser,
              preferences: updatedPreferences,
            },
            isLoading: false,
            error: null,
          });
          return updatedPreferences;
        } catch (error) {
          set({
            isLoading: false,
            error: error.message || 'Failed to update preferences',
          });
          throw error;
        }
      },

      /**
       * Upload avatar
       */
      uploadAvatar: async (file) => {
        set({ isLoading: true, error: null });
        try {
          const { avatarUrl } = await profileApi.uploadAvatar(file);
          // Refresh full user data to get updated avatar and stats
          const updatedUser = await authApi.getCurrentUser();
          set({
            user: updatedUser,
            isLoading: false,
            error: null,
          });
          return avatarUrl;
        } catch (error) {
          set({
            isLoading: false,
            error: error.message || 'Failed to upload avatar',
          });
          throw error;
        }
      },

      /**
       * Clear error
       */
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;


