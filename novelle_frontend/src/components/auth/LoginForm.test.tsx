import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/http';
import { LoginForm } from '@/components/auth/LoginForm';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), dismiss: vi.fn() } }));

describe('LoginForm', () => {
  beforeEach(() => toastError.mockClear());

  it('toasts the first invalid field in order and focuses it, without calling the API', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Nhập tên đăng nhập hoặc email.', expect.anything()));
    expect(screen.getByLabelText('Tên đăng nhập hoặc email')).toHaveFocus();
    expect(screen.getByLabelText('Tên đăng nhập hoặc email')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
    // Errors are not written under the fields.
    expect(screen.queryByText('Nhập tên đăng nhập hoặc email.')).toBeNull();
  });

  it('maps INVALID_CREDENTIALS to the password field: toast, both fields red, focus on password', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'x' }));
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Tên đăng nhập hoặc email'), 'lananh');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'saimatkhau');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Tên đăng nhập hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.',
        expect.anything(),
      ),
    );
    expect(onSubmit).toHaveBeenCalledWith({ login: 'lananh', password: 'saimatkhau' });
    expect(screen.getByLabelText('Mật khẩu')).toHaveFocus();
    expect(screen.getByLabelText('Tên đăng nhập hoặc email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('locks the button with a countdown on RATE_LIMITED', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError({ status: 429, code: 'RATE_LIMITED', message: 'x', details: { retryAfterSeconds: 30 } }));
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Tên đăng nhập hoặc email'), 'lananh');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'matkhau2026');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    const locked = await screen.findByRole('button', { name: /Thử lại sau (29|30) giây/ });
    expect(locked).toBeDisabled();
    // A rate limit is not a field error: no field toast from the form.
    expect(toastError).not.toHaveBeenCalled();
  });
});
