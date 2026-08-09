export const MIN_PASSWORD_LENGTH = 12;

export function passwordLengthError(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
}
