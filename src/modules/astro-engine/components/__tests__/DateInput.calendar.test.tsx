// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DateInput } from '../DateInput';

const esMessages = {
  dateInput: {
    monthAria: 'Mes',
    dayAria: 'Día',
    yearAria: 'Año',
    openCalendarAria: 'Abrir calendario',
    calendarDialogAria: 'Calendario para elegir fecha',
    prevMonthAria: 'Mes anterior',
    nextMonthAria: 'Mes siguiente',
  },
};

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

function renderInput(locale: 'en' | 'es') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'es' ? esMessages : enMessages}>
      <DateInput value="1990-01-15" onChange={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe('DateInput — Spanish calendar (SP-B D6)', () => {
  it('popover header, weekdays and day-cell aria are Spanish for locale=es', () => {
    renderInput('es');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendario' }));
    expect(screen.getByRole('dialog', { name: 'Calendario para elegir fecha' })).toBeTruthy();
    expect(screen.getByText(/enero/)).toBeTruthy(); // header "enero 1990"
    expect(screen.getByText('Lu')).toBeTruthy(); // weekday headers Do…Sá
    expect(screen.getByText('Sá')).toBeTruthy();
    expect(screen.getByRole('button', { name: '15 ene 1990' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeTruthy();
  });

  it('segment inputs announce in Spanish', () => {
    renderInput('es');
    expect(screen.getByLabelText('Día')).toBeTruthy();
    expect(screen.getByLabelText('Mes')).toBeTruthy();
    expect(screen.getByLabelText('Año')).toBeTruthy();
  });

  it('stays English for locale=en (regression)', () => {
    renderInput('en');
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(screen.getByText(/January/)).toBeTruthy();
    expect(screen.getByText('Su')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Jan 15, 1990' })).toBeTruthy();
  });
});
