export function normalizeCnic(input) {
  const compact = String(input || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{6,20}$/.test(compact)) return null;
  if (/^(\d)\1{12}$/.test(compact)) return null;
  return compact;
}

export function formatCnic(digits) {
  const compact = String(digits || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d{13}$/.test(compact)) {
    return `${compact.slice(0, 5)}-${compact.slice(5, 12)}-${compact.slice(12)}`;
  }
  return compact;
}

export function maskCnicLast4(last4) {
  const tail = String(last4 || '').slice(-4).padStart(4, '•');
  return `•••••••••${tail}`;
}
