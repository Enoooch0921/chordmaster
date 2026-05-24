export const formatInitialCaps = (value: string) => (
  value.replace(/(^|[\s_-]+)([a-z])/gu, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`)
);
