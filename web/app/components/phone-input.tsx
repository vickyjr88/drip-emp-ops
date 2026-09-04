"use client";

/**
 * A phone number field with a country selector, always sending a single
 * fully-qualified "+<dial code><local number>" string upstream.
 *
 * Every backend DTO that accepts a phone number validates it for real now
 * (IsValidPhoneNumber, see backend/src/common/phone.util.ts) rather than
 * accepting any non-empty string -- garbage phone numbers were one of the
 * two things spamming the abandoned-cart lead flow. This component is the
 * frontend half of that fix: it defaults to Kenya (+254, this shop's own
 * market) but lets a customer from elsewhere pick their own country, so the
 * validation on the way in matches a real number instead of forcing every
 * shopper to type Kenya's format.
 *
 * The country and local-number parts are kept in local state and only
 * combined into the single string the caller sees -- callers never need to
 * know a selector exists, they just get one value, the same shape
 * (`onChange` firing a plain string) as any other controlled text input.
 */

import { ChangeEvent, useId, useMemo, useState } from 'react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';

const DEFAULT_COUNTRY: CountryCode = 'KE';

let cachedCountryOptions: Array<{ code: CountryCode; name: string; dialCode: string }> | null = null;

/** Built once per page load, not per render -- Intl.DisplayNames and iterating all ~245 countries is wasted work to repeat on every keystroke. */
function countryOptions(): Array<{ code: CountryCode; name: string; dialCode: string }> {
  if (cachedCountryOptions) return cachedCountryOptions;

  const displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

  cachedCountryOptions = getCountries()
    .map((code) => ({
      code,
      name: displayNames?.of(code) || code,
      dialCode: getCountryCallingCode(code),
    }))
    // Alphabetical by name, not ISO code -- a customer scans for their
    // country's name, not "KE" vs "TZ".
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountryOptions;
}

/** Splits a stored "+<dialcode><rest>" value back into a country guess and the local digits, for pre-filling the two controls from an existing value (e.g. editing a saved profile). Falls back to the default country when the value doesn't parse. */
function splitExisting(value: string): { country: CountryCode; local: string } {
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return { country: DEFAULT_COUNTRY, local: value };

  const options = countryOptions();
  // Longest dial code first (e.g. "1242" for Bahamas before "1" for the US/Canada block).
  const sorted = [...options].sort((a, b) => b.dialCode.length - a.dialCode.length);
  const match = sorted.find((option) => digits.startsWith(`+${option.dialCode}`));
  if (!match) return { country: DEFAULT_COUNTRY, local: value };
  return { country: match.code, local: digits.slice(match.dialCode.length + 1) };
}

export function PhoneInput({
  value,
  onChange,
  required,
  placeholder,
  autoComplete,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  id?: string;
}) {
  const options = useMemo(() => countryOptions(), []);
  const initial = useMemo(() => splitExisting(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [local, setLocal] = useState(initial.local);
  const selectId = useId();

  function emit(nextCountry: CountryCode, nextLocal: string) {
    const dialCode = getCountryCallingCode(nextCountry);
    const digits = nextLocal.replace(/\D/g, '');
    onChange(digits ? `+${dialCode}${digits}` : '');
  }

  function onCountryChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as CountryCode;
    setCountry(next);
    emit(next, local);
  }

  function onLocalChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setLocal(next);
    emit(country, next);
  }

  return (
    <span className="lp-phone-field">
      <select
        id={selectId}
        className="lp-phone-country"
        value={country}
        onChange={onCountryChange}
        aria-label="Country code"
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name} (+{option.dialCode})
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        className="lp-phone-number"
        value={local}
        onChange={onLocalChange}
        required={required}
        placeholder={placeholder ?? 'e.g. 722 123456'}
        autoComplete={autoComplete}
        inputMode="tel"
      />
    </span>
  );
}
