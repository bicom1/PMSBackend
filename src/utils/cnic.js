export function normalizeCnic(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length !== 13) return null;
  return digits;
}

export function formatCnic(digits) {
  const value = String(digits || '').replace(/\D/g, '');
  if (value.length !== 13) return value;
  return `${value.slice(0, 5)}-${value.slice(5, 12)}-${value.slice(12)}`;
}

export function maskCnicLast4(last4) {
  const tail = String(last4 || '').slice(-4).padStart(4, '•');
  return `•••••••••${tail}`;
}
