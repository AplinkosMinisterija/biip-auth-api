import { companyCode as companyCodeChecker, personalCode as personalCodeChecker } from 'lt-codes';

export * from './tokens';
export * from './hashes';
export * from './mails';
export * from './recaptcha';

// Convention: a natural person acting as a company uses 'FA_<personalCode>'.
const FA_COMPANY_CODE_REGEX = /^FA_(\d{11})$/;

export const isValidCompanyCode = (code: string): boolean => {
  if (!code) return false;
  if (companyCodeChecker.validate(code).isValid) return true;
  const match = FA_COMPANY_CODE_REGEX.exec(code);
  if (match) return personalCodeChecker.validate(match[1]).isValid;
  return false;
};

export const normalizeName = (words: string) => {
  if (!words) return;
  const makeWordUpperCase = (word: string) => {
    return word.charAt(0).toUpperCase() + word.substring(1);
  };

  const normalizeWords = (words: string, delimiter: string = ' ') => {
    return words
      .split(delimiter)
      .map((word: string) => makeWordUpperCase(word))
      .join(delimiter);
  };

  words = words.toLowerCase();
  words = normalizeWords(words, ' ');
  words = normalizeWords(words, '-');
  return words;
};
