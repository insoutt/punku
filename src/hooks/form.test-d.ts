import { expectTypeOf, test } from 'vitest';
import type { FormProps } from './form.js';

test('fix 9: setError accepts a partial errors object', () => {
  type Form = FormProps<{ name: string; email: string }>;

  expectTypeOf<Form['setError']>().toBeCallableWith({ name: 'Required' });
});

test('F1: request methods resolve TResponse | undefined', () => {
  type Form = FormProps<{ name: string }>;
  const form = {} as Form;

  expectTypeOf(form.post<{ id: number }>('/u')).toEqualTypeOf<
    Promise<{ id: number } | undefined>
  >();
  expectTypeOf(form.get<{ id: number }>('/u')).toEqualTypeOf<
    Promise<{ id: number } | undefined>
  >();
  expectTypeOf(form.put<{ id: number }>('/u')).toEqualTypeOf<
    Promise<{ id: number } | undefined>
  >();
  expectTypeOf(form.patch<{ id: number }>('/u')).toEqualTypeOf<
    Promise<{ id: number } | undefined>
  >();
  expectTypeOf(form.delete<{ id: number }>('/u')).toEqualTypeOf<
    Promise<{ id: number } | undefined>
  >();
  expectTypeOf(
    form.post('/u', { onSuccess: (_data: { id: number }) => {} }),
  ).toEqualTypeOf<Promise<{ id: number } | undefined>>();
});
