// Client-side checks for a new password. Supabase Auth still enforces the
// project's own server-side policy; these only give an early, clear message.
export const MIN_PASSWORD_LENGTH = 8;

export function validateNewPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `新密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`;
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return '新密码需同时包含字母和数字。';
  if (next !== confirm) return '两次输入的新密码不一致。';
  return null;
}

/** Map a Supabase Auth updateUser() error to a user-facing message. */
export function describePasswordUpdateError(err: { code?: string; message?: string; status?: number }): string {
  const code = err.code ?? '';
  if (code === 'same_password') return '新密码不能与当前密码相同。';
  if (code === 'weak_password') return '新密码强度不够，请使用更长且包含字母和数字的密码。';
  if (code === 'reauthentication_needed') return '为了安全，请重新登录后再修改密码。';
  if (err.status === 429) return '操作过于频繁，请稍后再试。';
  return '修改密码失败，请稍后再试。';
}
