'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import type { CitySearchResult } from '@/shared/types';

interface CityAutocompleteProps {
  value: string;
  onCitySelect: (city: CitySearchResult) => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatPopulation(pop: number): string {
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M`;
  if (pop >= 1_000) return `${Math.round(pop / 1_000)}K`;
  return String(pop);
}

export function CityAutocomplete({
  value,
  onCitySelect,
  onChange,
  placeholder = 'Search city...',
  disabled = false,
  error,
}: CityAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const comboboxId = useId();
  const listId = `${comboboxId}-list`;
  const errorId = `${comboboxId}-error`;

  // Fetch cities when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    let cancelled = false;

    async function fetchCities() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(
          `/api/v1/cities?q=${encodeURIComponent(debouncedQuery)}&limit=10`
        );
        if (!res.ok) throw new Error('Failed to fetch cities');
        const data = await res.json() as { results: CitySearchResult[] };
        if (!cancelled) {
          setResults(data.results ?? []);
          setIsOpen(true);
          setActiveIndex(-1);
        }
      } catch {
        if (!cancelled) {
          setFetchError('City search unavailable');
          setResults([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchCities();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      onChange?.(val);
    },
    [onChange]
  );

  const selectCity = useCallback(
    (city: CitySearchResult) => {
      const label = city.admin1
        ? `${city.name}, ${city.admin1}, ${city.country}`
        : `${city.name}, ${city.country}`;
      setQuery(label);
      onChange?.(label);
      setResults([]);
      setIsOpen(false);
      setActiveIndex(-1);
      onCitySelect(city);
    },
    [onCitySelect, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          selectCity(results[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    },
    [isOpen, results, activeIndex, selectCity]
  );

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.closest('[data-city-autocomplete]')?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const hasError = !!error;
  const inputId = `${comboboxId}-input`;

  return (
    <div data-city-autocomplete className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={
            activeIndex >= 0 ? `${comboboxId}-option-${activeIndex}` : undefined
          }
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          className={[
            'w-full rounded-lg border bg-white/5 px-3 py-2.5 text-sm text-white',
            'placeholder:text-white/30 transition-colors',
            'focus:outline-none focus:ring-1',
            hasError
              ? 'border-red-500/60 focus:border-red-400 focus:ring-red-400/30'
              : 'border-white/12 focus:border-white/30 focus:ring-white/10',
            disabled ? 'opacity-40 cursor-not-allowed' : '',
          ].join(' ')}
        />
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
            <svg
              className="animate-spin h-4 w-4 text-white/40"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Error message */}
      {hasError && (
        <p id={errorId} className="mt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      {/* Fetch error */}
      {fetchError && !isOpen && (
        <p className="mt-1 text-xs text-amber-400/70">{fetchError}</p>
      )}

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="City suggestions"
          className={[
            'absolute z-50 mt-1 w-full rounded-xl border border-white/10',
            'bg-[#13131D] shadow-2xl shadow-black/60 backdrop-blur-xl',
            'max-h-60 overflow-y-auto py-1',
          ].join(' ')}
        >
          {results.map((city, idx) => (
            <li
              key={`${city.name}-${city.latitude}-${city.longitude}`}
              id={`${comboboxId}-option-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              className={[
                'flex flex-col px-3 py-2 cursor-pointer transition-colors',
                activeIndex === idx
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/6 hover:text-white',
              ].join(' ')}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur
                selectCity(city);
              }}
            >
              <span className="truncate text-sm font-medium text-white/90 leading-snug">
                {city.name}
              </span>
              <span className="truncate text-xs text-white/40 leading-snug">
                {city.admin1 ? `${city.admin1} · ${city.country}` : city.country}
                {city.population > 0 && (
                  <span className="font-mono tabular-nums">
                    {'\u00A0\u00B7\u00A0'}{formatPopulation(city.population)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
