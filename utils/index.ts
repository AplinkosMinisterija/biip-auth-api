export * from './tokens';
export * from './hashes';
export * from './mails';
export * from './recaptcha';

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
