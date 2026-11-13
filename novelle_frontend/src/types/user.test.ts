import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  loginSchema,
  MSG,
  normalizeUsername,
  profileSchema,
  registerSchema,
  utf8Bytes,
} from '@/types/user';

const validRegister = {
  displayName: 'Lan Anh',
  username: 'lan_anh01',
  email: 'lananh@gmail.com',
  password: 'matkhau2026',
  confirmPassword: 'matkhau2026',
};

/** Message of the first issue on `field`, or undefined when the field is valid. */
function issue(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) {
  return result.error?.issues.find((i) => i.path[0] === field)?.message;
}

describe('registerSchema (RegisterRequest)', () => {
  it('accepts a valid account', () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it.each([
    ['ab', false],
    ['abc', true],
    ['a'.repeat(50), true],
    ['a'.repeat(51), false],
    ['Lan Anh', false],
    ['lan-anh', false],
    ['lananh_2026', true],
    ['lânanh', false],
  ])('username %j → valid %s', (username, ok) => {
    const r = registerSchema.safeParse({ ...validRegister, username });
    expect(issue(r, 'username')).toBe(ok ? undefined : MSG.usernameInvalid);
  });

  it('checks password length 8–72 characters', () => {
    expect(issue(registerSchema.safeParse({ ...validRegister, password: '1234567', confirmPassword: '1234567' }), 'password')).toBe(
      MSG.passwordInvalid,
    );
    const p72 = 'a'.repeat(72);
    expect(registerSchema.safeParse({ ...validRegister, password: p72, confirmPassword: p72 }).success).toBe(true);
    const p73 = 'a'.repeat(73);
    expect(issue(registerSchema.safeParse({ ...validRegister, password: p73, confirmPassword: p73 }), 'password')).toBe(
      MSG.passwordTooLong,
    );
  });

  it('rejects a password over 72 UTF-8 bytes even under 72 characters (PasswordRules)', () => {
    const accented = 'ệ'.repeat(25); // 25 characters, 75 bytes
    expect(utf8Bytes(accented)).toBe(75);
    const r = registerSchema.safeParse({ ...validRegister, password: accented, confirmPassword: accented });
    expect(issue(r, 'password')).toBe(MSG.passwordTooLong);
  });

  it('requires both passwords to match', () => {
    const r = registerSchema.safeParse({ ...validRegister, confirmPassword: 'khac2026x' });
    expect(issue(r, 'confirmPassword')).toBe(MSG.passwordInvalid);
  });

  it.each(['lananh@gmail', 'lananh', '@gmail.com', 'a b@gmail.com'])('rejects email %j', (email) => {
    expect(issue(registerSchema.safeParse({ ...validRegister, email }), 'email')).toBe(MSG.emailInvalid);
  });

  it('trims the display name and limits it to 100 characters', () => {
    expect(issue(registerSchema.safeParse({ ...validRegister, displayName: '   ' }), 'displayName')).toBe(MSG.displayName);
    expect(issue(registerSchema.safeParse({ ...validRegister, displayName: 'x'.repeat(101) }), 'displayName')).toBe(
      MSG.displayName,
    );
    const r = registerSchema.safeParse({ ...validRegister, displayName: '  Lan Anh  ' });
    expect(r.success && r.data.displayName).toBe('Lan Anh');
  });
});

describe('other schemas', () => {
  it('loginSchema needs both fields', () => {
    const r = loginSchema.safeParse({ login: ' ', password: '' });
    expect(issue(r, 'login')).toBe(MSG.loginRequired);
    expect(issue(r, 'password')).toBe(MSG.passwordRequired);
    expect(loginSchema.safeParse({ login: 'lananh@gmail.com', password: 'x' }).success).toBe(true);
  });

  it('profileSchema limits bio to 1000 characters and allows an empty bio', () => {
    expect(profileSchema.safeParse({ displayName: 'Lan Anh', bio: '' }).success).toBe(true);
    expect(issue(profileSchema.safeParse({ displayName: 'Lan Anh', bio: 'x'.repeat(1001) }), 'bio')).toBe(MSG.bio);
  });

  it('changePasswordSchema checks the new password and the confirmation', () => {
    const base = { currentPassword: 'cu123456', newPassword: 'moi123456', confirmPassword: 'moi123456' };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(issue(changePasswordSchema.safeParse({ ...base, currentPassword: '' }), 'currentPassword')).toBe(
      MSG.currentPasswordRequired,
    );
    expect(issue(changePasswordSchema.safeParse({ ...base, confirmPassword: 'x' }), 'confirmPassword')).toBe(MSG.passwordInvalid);
  });

  it('normalizeUsername trims and lowercases', () => {
    expect(normalizeUsername('  Lan_Anh ')).toBe('lan_anh');
  });
});
