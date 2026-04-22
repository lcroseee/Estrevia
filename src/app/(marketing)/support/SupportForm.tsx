'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { postJson } from '@/shared/lib/apiFetch';

export function SupportForm() {
  const t = useTranslations('support');
  const { isPro } = useSubscription();
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setError(null);
    const result = await postJson<{ success: boolean; data?: unknown; error?: string }>(
      '/api/v1/support/contact',
      { email, subject, message },
    );

    switch (result.kind) {
      case 'ok':
        if (result.data.success) {
          setState('success');
          setEmail('');
          setSubject('');
          setMessage('');
        } else {
          // Server returned 2xx but success: false — treat as a send failure.
          setState('error');
          setError(t('errorSend'));
        }
        break;

      case 'auth-required':
        // Clerk middleware intercepted the request — redirect to sign-in.
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent('/support')}`;
        break;

      case 'error':
        setState('error');
        setError(t('errorSend'));
        break;

      case 'network-error':
        setState('error');
        setError(t('errorNetwork'));
        break;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isPro && (
        <p
          className="text-xs px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(255,215,0,0.08)',
            color: 'rgba(255,215,0,0.9)',
            border: '1px solid rgba(255,215,0,0.25)',
          }}
        >
          {t('priorityBadge')}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="support-email" className="text-xs uppercase tracking-wider text-white/50">
          {t('emailLabel')}
        </label>
        <input
          id="support-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 focus:outline-none focus:border-white/30"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="support-subject" className="text-xs uppercase tracking-wider text-white/50">
          {t('subjectLabel')}
        </label>
        <input
          id="support-subject"
          type="text"
          required
          minLength={3}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 focus:outline-none focus:border-white/30"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="support-message" className="text-xs uppercase tracking-wider text-white/50">
          {t('messageLabel')}
        </label>
        <textarea
          id="support-message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 focus:outline-none focus:border-white/30 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black disabled:opacity-50"
      >
        {state === 'sending' ? t('sending') : t('submit')}
      </button>

      {state === 'success' && (
        <p className="text-sm text-emerald-400 text-center" role="status">
          {t('successMessage')}
        </p>
      )}

      {state === 'error' && error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
