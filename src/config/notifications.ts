export interface NotificationFeature {
  icon: string;
  title: string;
  description: string;
}

export interface NotificationConfig {
  id: string;
  version: string;
  date: string;
  title: string;
  bannerTitle: string;
  bannerDescription: string;
  features: NotificationFeature[];
}

export const CURRENT_NOTIFICATION: NotificationConfig = {
  id: 'update-jan-2026-v5',
  version: '2.9',
  date: 'January 29, 2026',
  title: 'Call Journey Report Page',
  bannerTitle: 'New: Call Journey Reports!',
  bannerDescription: "Full attribution tracking & source breakdowns for all your calls",
  features: [
    {
      icon: 'BarChart3',
      title: 'Dedicated Report Page',
      description: 'Navigate from any metric card to a full-page report with comprehensive call data, replacing the limited modal view.',
    },
    {
      icon: 'Filter',
      title: 'Advanced Filtering',
      description: 'Filter by traffic source, closer, setter, event type, outcome, and calendar platform. All filters sync to URL for easy sharing.',
    },
    {
      icon: 'TrendingUp',
      title: 'Source Breakdown Table',
      description: 'See performance aggregated by traffic source: calls, show rate, close rate, and revenue—all in one view.',
    },
    {
      icon: 'Download',
      title: 'CSV Export',
      description: 'Export filtered call data with full attribution chain including traffic source, setter, closer, and revenue.',
    },
  ],
};

// Storage key for localStorage
export const NOTIFICATION_STORAGE_KEY = 'salesreps_dismissed_notifications';

// Helper to check if a notification has been dismissed
export function isNotificationDismissed(notificationId: string): boolean {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!stored) return false;
    const dismissed: string[] = JSON.parse(stored);
    return dismissed.includes(notificationId);
  } catch {
    return false;
  }
}

// Helper to dismiss a notification
export function dismissNotification(notificationId: string): void {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    const dismissed: string[] = stored ? JSON.parse(stored) : [];
    if (!dismissed.includes(notificationId)) {
      dismissed.push(notificationId);
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(dismissed));
    }
  } catch {
    // Silently fail if localStorage is unavailable
  }
}
