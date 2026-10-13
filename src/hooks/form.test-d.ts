import { expectTypeOf, test } from 'vitest';
import type { FormProps } from './form.js';

test('fix 9: setError accepts a partial errors object', () => {
  type Form = FormProps<{ name: string; email: string }>;

  expectTypeOf<Form['setError']>().toBeCallableWith({ name: 'Required' });
});
