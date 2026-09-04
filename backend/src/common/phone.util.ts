import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Real phone validation, not just "is a string" -- the gap that let spam
 * through on abandoned-cart leads (and every other public form): a value
 * like "asdf" or "123" satisfied @IsString() and sailed straight into a
 * CartLead row.
 *
 * Backed by libphonenumber-js (already a transitive dependency of
 * class-validator, declared directly here since this codebase now imports
 * it on purpose rather than relying on someone else's node_modules layout).
 * A number with its own leading "+" is validated against whatever country
 * that country code implies; a bare local number (07..., 011...) is
 * validated against `defaultCountry` -- this is what lets a Kenyan customer
 * type "0722..." and a customer from elsewhere type their own local format
 * once a country is selected on the frontend.
 */
export function isValidPhoneNumber(raw: string, defaultCountry: string = 'KE'): boolean {
  if (!raw?.trim()) return false;
  try {
    const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry as any);
    return Boolean(parsed?.isValid());
  } catch {
    return false;
  }
}

/** E.164 (+<countrycode><number>, no spaces/punctuation) -- the one shape every number is stored in, regardless of how it was typed. Returns null for anything that doesn't validate; callers should validate before normalizing, not use this as the validation step itself. */
export function normalizePhoneNumber(raw: string, defaultCountry: string = 'KE'): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry as any);
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

/**
 * class-validator decorator wrapping the above. Defaults to Kenya since
 * every form in this app defaults to a Kenyan customer; a field for a form
 * that offers a country selector should read the chosen country from the
 * same request body -- see CartLeadLineDto-style DTOs for where that value
 * needs to travel alongside the phone field itself.
 */
export function IsValidPhoneNumber(defaultCountry: string = 'KE', validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidPhoneNumber',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Enter a valid phone number, including the country code if it is not Kenyan.',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return isValidPhoneNumber(value, defaultCountry);
        },
      },
    });
  };
}
