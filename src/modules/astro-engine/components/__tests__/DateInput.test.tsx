// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DateInput } from '../DateInput';

// ----- Helpers --------------------------------------------------------------

const enMessages = {
  dateInput: {
    monthAria: 'Month',
    dayAria: 'Day',
    yearAria: 'Year',
    openCalendarAria: 'Open calendar',
    calendarDialogAria: 'Date picker calendar',
    prevMonthAria: 'Previous month',
    nextMonthAria: 'Next month',
  },
};

function renderDateInput(value = '1990-05-17') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <DateInput value={value} onChange={vi.fn()} max="2026-01-01" />
    </NextIntlClientProvider>,
  );
}

// ----- Tests ----------------------------------------------------------------

describe('DateInput — session-recording PII masking (portaled calendar popover)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('tags the portaled calendar popover root with data-ph-mask when open', () => {
    renderDateInput();

    // The popover is not mounted until the calendar is opened.
    expect(screen.queryByRole('dialog')).toBeNull();

    // Open the calendar via its toggle button.
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));

    // CalendarPopover is portaled to document.body, so it escapes the form's
    // DOM subtree — rrweb's closest('[data-ph-mask]') would find nothing.
    // The popover root must therefore carry its own data-ph-mask, or the
    // visible birth month/year label + highlighted birth day record unmasked.
    const popover = screen.getByRole('dialog', { name: 'Date picker calendar' });
    expect(popover.hasAttribute('data-ph-mask')).toBe(true);
  });
});
