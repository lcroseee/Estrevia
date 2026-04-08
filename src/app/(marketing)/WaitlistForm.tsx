'use client';

import { useState, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type FormState = 'idle' | 'loading' | 'success' | 'error';

export function WaitlistForm() {
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const validateEmail = (value: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateEmail(email)) {
        setErrorMessage('Please enter a valid email address.');
        setFormState('error');
        return;
      }

      setFormState('loading');
      setErrorMessage('');

      try {
        const res = await fetch('/api/v1/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), source: 'landing' }),
        });

        if (res.ok) {
          setFormState('success');
        } else if (res.status === 422) {
          setErrorMessage('Please enter a valid email address.');
          setFormState('error');
        } else if (res.status === 429) {
          setErrorMessage('Too many requests. Please try again in a moment.');
          setFormState('error');
        } else {
          setErrorMessage('Something went wrong. Please try again.');
          setFormState('error');
        }
      } catch {
        setErrorMessage('Network error. Please check your connection.');
        setFormState('error');
      }
    },
    [email]
  );

  // ── Success state ────────────────────────────────────────────────────────
  if (formState === 'success') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="success"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-3 py-4"
          role="status"
          aria-live="polite"
          aria-label="Successfully joined the waitlist"
        >
          <span className="text-3xl" aria-hidden="true">
            ☽
          </span>
          <p
            className="text-base text-white/80"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
          >
            You are on the list.
          </p>
          <p className="text-xs text-white/35">
            We will notify you when Estrevia launches.
          </p>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Waitlist sign-up form"
      className="flex flex-col gap-3 w-full"
    >
      {/* Input + button row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label htmlFor={emailId} className="sr-only">
            Email address
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (formState === 'error') {
                setFormState('idle');
                setErrorMessage('');
              }
            }}
            disabled={formState === 'loading'}
            aria-invalid={formState === 'error'}
            aria-describedby={formState === 'error' ? errorId : undefined}
            className="w-full rounded-xl px-4 py-3 text-sm bg-white/5 border border-white/10 text-white placeholder-white/25 focus:outline-none focus:border-[#FFD700]/40 focus:ring-1 focus:ring-[#FFD700]/25 transition-colors aria-[invalid=true]:border-red-400/50 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={formState === 'loading'}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#FFD700] text-[#0A0A0F] text-sm font-semibold tracking-wide hover:bg-[#FFE033] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          aria-busy={formState === 'loading'}
        >
          {formState === 'loading' ? (
            <>
              <span
                className="inline-block w-4 h-4 border-2 border-[#0A0A0F]/30 border-t-[#0A0A0F] rounded-full animate-spin"
                aria-hidden="true"
              />
              Joining…
            </>
          ) : (
            'Join Waitlist'
          )}
        </button>
      </div>

      {/* Inline error message */}
      {formState === 'error' && errorMessage && (
        <p id={errorId} className="text-xs text-red-400 text-center" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
