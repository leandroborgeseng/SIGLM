export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'minLength', label: 'Mínimo de 8 caracteres', test: (p) => p.length >= 8 },
  { id: 'uppercase', label: 'Pelo menos uma letra maiúscula', test: (p) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'Pelo menos uma letra minúscula', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'Pelo menos um número', test: (p) => /\d/.test(p) },
  {
    id: 'special',
    label: 'Pelo menos um caractere especial',
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export function validatePassword(senha: string) {
  const failedRules = PASSWORD_RULES.filter((rule) => !rule.test(senha));
  return {
    valid: failedRules.length === 0,
    failedRules,
    failedLabels: failedRules.map((r) => r.label),
  };
}

export function passwordPolicyMessage(senha: string): string | null {
  const { valid, failedLabels } = validatePassword(senha);
  if (valid) return null;
  return `Senha não atende aos requisitos: ${failedLabels.join('; ')}`;
}
