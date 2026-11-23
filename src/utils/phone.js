export function normalizePhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  return digits;
}

export function isValidPhone(normalized) {
  return /^\d{7,15}$/.test(normalized || '');
}

export function maskPhone(phone) {
  const digits = String(phone || '');
  if (digits.length < 5) return '****';
  return `${digits.slice(0, 2)}****${digits.slice(-3)}`;
}
