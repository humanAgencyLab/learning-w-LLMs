import { create } from 'zustand';

/**
 * PR-10 minimal toast store. One message at a time; a later showToast simply
 * replaces the current one and restarts its own hide timer.
 */
let hideTimer = null;

const useToastStore = create((set) => ({
  message: '',
  show: false,
  showToast: (msg, ms = 2400) => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message: msg, show: true });
    hideTimer = setTimeout(() => set({ show: false }), ms);
  },
}));

export default useToastStore;
