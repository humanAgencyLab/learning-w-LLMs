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
      signup: async ({ email, password, name }) => {
        set({ isLoading: true, error: null });
        try {
          const { user, accessToken } = await authApi.signup({ email, password, name });
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
      login: async ({ email, password }) => {
        set({ isLoading: true, error: null });
        try {
          const { user, accessToken } = await authApi.login({ email, password });
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
            // Both failed, clear auth state
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
          const currentUser = get().user;
          set({
            user: {
              ...currentUser,
              ...profile,
            },
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
          const currentUser = get().user;
          set({
            user: {
              ...currentUser,
              avatarUrl,
            },
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


