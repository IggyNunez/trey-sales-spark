import { useState, useEffect, useCallback } from 'react';
import { 
  CURRENT_NOTIFICATION, 
  isNotificationDismissed, 
  dismissNotification as dismissNotificationHelper 
} from '@/config/notifications';
import { useAuth } from '@/hooks/useAuth';

interface UseUpdateNotificationReturn {
  showBanner: boolean;
  isLoading: boolean;
  dismissNotification: () => void;
  currentNotification: typeof CURRENT_NOTIFICATION;
}

export function useUpdateNotification(): UseUpdateNotificationReturn {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Only show banner for authenticated users
    if (!user) {
      setShowBanner(false);
      setIsLoading(false);
      return;
    }

    // Check if this notification has been dismissed
    const dismissed = isNotificationDismissed(CURRENT_NOTIFICATION.id);
    setShowBanner(!dismissed);
    setIsLoading(false);
  }, [user]);

  const dismissNotification = useCallback(() => {
    dismissNotificationHelper(CURRENT_NOTIFICATION.id);
    setShowBanner(false);
  }, []);

  return {
    showBanner,
    isLoading,
    dismissNotification,
    currentNotification: CURRENT_NOTIFICATION,
  };
}
