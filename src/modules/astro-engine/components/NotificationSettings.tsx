'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

type PermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

interface Preferences {
  dailyMoonPhase: boolean;
  fullNewMoon: boolean;
  weeklyDigest: boolean;
  preferredTime: string;
}

const DEFAULT_PREFS: Preferences = {
  dailyMoonPhase: false,
  fullNewMoon: false,
  weeklyDigest: false,
  preferredTime: '08:00',
};

export function NotificationSettings() {
  const t = useTranslations('notifications');

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Check browser support and current permission on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      setIsLoading(false);
      return;
    }

    setPermission(Notification.permission as PermissionState);

    // Check if service worker is registered and has an active subscription
    navigator.serviceWorker?.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setIsSubscribed(!!sub);
      })
      .catch(() => {
        // SW not registered yet — that's ok
      });

    // Fetch current preferences from API
    fetch('/api/v1/push/preferences')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.data) {
          setPrefs(data.data);
        }
      })
      .catch(() => {
        // Use defaults on error
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Enable push notifications: request permission + register SW + subscribe
  const handleEnablePush = useCallback(async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported');
      return;
    }

    // Request permission
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
    if (result !== 'granted') return;

    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Subscribe to push
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error('[notifications] VAPID public key not set');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Send subscription to our API
      const subJson = subscription.toJSON();
      const res = await fetch('/api/v1/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error('[notifications] subscription error:', err);
    }
  }, []);

  // Disable push notifications: unsubscribe SW + delete from API
  const handleDisablePush = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }

      await fetch('/api/v1/push/subscribe', { method: 'DELETE' });
      setIsSubscribed(false);
    } catch (err) {
      console.error('[notifications] unsubscribe error:', err);
    }
  }, []);

  // Save preference change to API
  const handlePrefChange = useCallback(
    async (key: keyof Preferences, value: boolean | string) => {
      const newPrefs = { ...prefs, [key]: value };
      setPrefs(newPrefs);
      setIsSaving(true);

      try {
        await fetch('/api/v1/push/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
      } catch {
        // Revert on error
        setPrefs(prefs);
      } finally {
        setIsSaving(false);
      }
    },
    [prefs],
  );

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-8"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        <SpinnerIcon />
      </div>
    );
  }

  const TOGGLE_OPTIONS: {
    key: keyof Omit<Preferences, 'preferredTime'>;
    labelKey: string;
    descKey: string;
  }[] = [
    {
      key: 'fullNewMoon',
      labelKey: 'fullNewMoon',
      descKey: 'fullNewMoonDesc',
    },
    {
      key: 'dailyMoonPhase',
      labelKey: 'dailyMoonPhase',
      descKey: 'dailyMoonPhaseDesc',
    },
    {
      key: 'weeklyDigest',
      labelKey: 'weeklyDigest',
      descKey: 'weeklyDigestDesc',
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Push permission section */}
      <div className="flex flex-col gap-3">
        <h3
          className="text-sm font-semibold"
          style={{ color: 'rgba(255,255,255,0.9)' }}
        >
          {t('title')}
        </h3>

        {permission === 'unsupported' && (
          <p
            className="text-xs"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {t('unsupported')}
          </p>
        )}

        {permission === 'denied' && (
          <p className="text-xs" style={{ color: '#E74C3C' }}>
            {t('denied')}
          </p>
        )}

        {permission !== 'unsupported' && permission !== 'denied' && (
          <button
            type="button"
            onClick={isSubscribed ? handleDisablePush : handleEnablePush}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98]"
            style={{
              background: isSubscribed
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              border: isSubscribed
                ? '1px solid rgba(255,255,255,0.08)'
                : 'none',
              color: isSubscribed ? 'rgba(255,255,255,0.6)' : '#0A0A0F',
              boxShadow: isSubscribed
                ? 'none'
                : '0 4px 16px -4px rgba(255,215,0,0.4)',
            }}
            aria-label={
              isSubscribed
                ? 'Disable push notifications'
                : 'Enable push notifications'
            }
          >
            {isSubscribed ? (
              <>
                <BellOffIcon />
                {t('disable')}
              </>
            ) : (
              <>
                <BellIcon />
                {t('enable')}
              </>
            )}
          </button>
        )}
      </div>

      {/* Notification type toggles (only shown when subscribed) */}
      {isSubscribed && (
        <div className="flex flex-col gap-4">
          {TOGGLE_OPTIONS.map(({ key, labelKey, descKey }) => (
            <label
              key={key}
              className="flex items-start justify-between gap-3 cursor-pointer"
            >
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  {t(labelKey)}
                </span>
                <span
                  className="text-xs"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {t(descKey)}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                aria-label={t(labelKey)}
                disabled={isSaving}
                onClick={() => handlePrefChange(key, !prefs[key])}
                className="relative shrink-0 w-10 h-6 rounded-full transition-colors duration-200"
                style={{
                  background: prefs[key]
                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                    : 'rgba(255,255,255,0.12)',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200"
                  style={{
                    background: prefs[key] ? '#0A0A0F' : 'rgba(255,255,255,0.5)',
                    transform: prefs[key]
                      ? 'translateX(16px)'
                      : 'translateX(0)',
                  }}
                />
              </button>
            </label>
          ))}

          {/* Preferred time */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span
                className="text-sm font-medium"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              >
                {t('preferredTime')}
              </span>
              <span
                className="text-xs"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                {t('preferredTimeDesc')}
              </span>
            </div>
            <input
              type="time"
              value={prefs.preferredTime}
              onChange={(e) =>
                handlePrefChange('preferredTime', e.target.value)
              }
              className="px-2 py-1.5 rounded-lg text-sm outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)',
                colorScheme: 'dark',
              }}
              aria-label="Preferred notification time"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// -- Helpers ------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// -- Inline SVG icons ---------------------------------------------------------

function SpinnerIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
      <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
