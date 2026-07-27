'use client';

import { PASSWORD_RULES, validatePassword } from '@/lib/password-policy';
import { Input } from '@/components/ui/Form';
import { cn } from '@/lib/format';

export function PasswordRequirements({ senha }: { senha: string }) {
  const { failedRules } = validatePassword(senha);
  const failedIds = new Set(failedRules.map((r) => r.id));

  return (
    <ul className="mt-2 space-y-1" aria-label="Requisitos de senha">
      {PASSWORD_RULES.map((rule) => {
        const ok = senha.length > 0 && !failedIds.has(rule.id);
        const fail = senha.length > 0 && failedIds.has(rule.id);
        return (
          <li
            key={rule.id}
            className={cn(
              'text-[12px]',
              ok && 'text-ok',
              fail && 'text-danger',
              !ok && !fail && 'text-ink-3',
            )}
          >
            {ok ? '✓' : fail ? '✗' : '○'} {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  required,
  autoComplete,
  showRequirements = false,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
  showRequirements?: boolean;
  id?: string;
}) {
  const fieldId = id ?? 'password-field';

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <Input
        id={fieldId}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        minLength={showRequirements ? 8 : undefined}
      />
      {showRequirements && <PasswordRequirements senha={value} />}
    </div>
  );
}
