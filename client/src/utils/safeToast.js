import toast from "react-hot-toast";

/**
 * Deduplicated, non-intrusive toast notifications.
 * Prevents identical messages from stacking up or firing repeatedly within a short window.
 */
const recentToasts = new Map();
const DEDUPE_WINDOW_MS = 2500;

function shouldShow(msg) {
  const key = String(msg || "").trim();
  if (!key) return false;
  const now = Date.now();
  const lastTime = recentToasts.get(key) || 0;
  if (now - lastTime < DEDUPE_WINDOW_MS) {
    return false;
  }
  recentToasts.set(key, now);
  // Periodically clean up map
  if (recentToasts.size > 50) {
    for (const [k, t] of recentToasts.entries()) {
      if (now - t > 10000) recentToasts.delete(k);
    }
  }
  return true;
}

export const safeToast = (message, options = {}) => {
  if (!shouldShow(message)) return;
  return toast(message, {
    id: options.id || String(message).slice(0, 32),
    ...options,
  });
};

safeToast.success = (message, options = {}) => {
  if (!shouldShow(message)) return;
  return toast.success(message, {
    id: options.id || String(message).slice(0, 32),
    ...options,
  });
};

safeToast.error = (message, options = {}) => {
  if (!shouldShow(message)) return;
  return toast.error(message, {
    id: options.id || String(message).slice(0, 32),
    ...options,
  });
};

safeToast.loading = (message, options = {}) => {
  return toast.loading(message, options);
};

safeToast.dismiss = (toastId) => {
  toast.dismiss(toastId);
};

export default safeToast;
