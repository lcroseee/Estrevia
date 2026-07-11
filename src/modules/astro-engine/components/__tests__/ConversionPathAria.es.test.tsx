// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TimeInput } from '../TimeInput';
import { CityAutocomplete } from '../CityAutocomplete';

const esMessages = {
  timePicker: {
    hourLabel: 'Hora',
    minuteLabel: 'Minutos',
    timeGroupAria: 'Hora',
  },
  cityAutocomplete: {
    suggestionsAria: 'Sugerencias de ciudades',
    searchUnavailable: 'Búsqueda de ciudades no disponible',
  },
};

function renderEs(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="es" messages={esMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Conversion-path aria i18n (SP-B D6)', () => {
  it('TimeInput group and segments announce in Spanish', () => {
    renderEs(<TimeInput value="12:30" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Hora' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Hora' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Minutos' })).toBeTruthy();
  });

  it('CityAutocomplete dropdown announces in Spanish', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              name: 'Bogotá',
              admin1: 'Bogotá D.C.',
              country: 'Colombia',
              countryCode: 'CO',
              latitude: 4.71,
              longitude: -74.07,
              timezone: 'America/Bogota',
              population: 7900000,
            },
          ],
        }),
      }),
    );
    renderEs(<CityAutocomplete value="" onCitySelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bogo' } });
    // 300ms debounce + fetch — findBy polls past both.
    const list = await screen.findByRole('listbox', { name: 'Sugerencias de ciudades' });
    expect(list).toBeTruthy();
  });

  it('CityAutocomplete fetch failure shows the Spanish error line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    renderEs(<CityAutocomplete value="" onCitySelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bogo' } });
    expect(await screen.findByText('Búsqueda de ciudades no disponible')).toBeTruthy();
  });
});
