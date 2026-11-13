export const cnpjPattern = /^[A-Z0-9]{12}\d{2}$/;

export function normalizeDocument(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[.\-/\s]/g, "");
}

export function validCnpj(value: string) {
  if (!cnpjPattern.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digit = (base: string) => {
    const sum = [...base]
      .reverse()
      .reduce(
        (total, char, index) =>
          total + (char.charCodeAt(0) - 48) * (2 + (index % 8)),
        0,
      );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return (
    digit(value.slice(0, 12)) === Number(value[12]) &&
    digit(value.slice(0, 13)) === Number(value[13])
  );
}
