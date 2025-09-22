function cn(...inputs) {
  // Si usas Tailwind en el backend, puedes dejar esto, pero normalmente no se usa.
  return inputs.filter(Boolean).join(' ');
}

module.exports = { cn };
