import type { AxiosError } from 'axios';
import { describe, expectTypeOf, test } from 'vitest';
import {
  useForm,
  type FormDataType,
  type FormProps,
  type RequestConfig,
} from './form.js';

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

describe('F4: allErrors', () => {
  test('literal true gives string[] errors', () => {
    const form = useForm({ name: '' }, { allErrors: true });

    expectTypeOf(form.errors).toEqualTypeOf<
      Partial<Record<'name', string[]>>
    >();
  });

  test('omitted or false gives string errors', () => {
    expectTypeOf(useForm({ name: '' }).errors).toEqualTypeOf<
      Partial<Record<'name', string>>
    >();
    expectTypeOf(useForm({ name: '' }, {}).errors).toEqualTypeOf<
      Partial<Record<'name', string>>
    >();
    expectTypeOf(
      useForm({ name: '' }, { allErrors: false }).errors,
    ).toEqualTypeOf<Partial<Record<'name', string>>>();
  });

  test('a plain boolean is rejected', () => {
    const allErrors = Math.random() > 0.5;
    // @ts-expect-error a dynamic flag can't pick the errors shape
    useForm({ name: '' }, { allErrors });
  });

  test('a widened options object is rejected; as const is accepted', () => {
    const widened = { allErrors: true };
    // @ts-expect-error widened to { allErrors: boolean }
    useForm({ name: '' }, widened);

    const narrowed = { allErrors: true } as const;
    expectTypeOf(useForm({ name: '' }, narrowed).errors).toEqualTypeOf<
      Partial<Record<'name', string[]>>
    >();
  });

  test('ReturnType<typeof useForm> is the string form', () => {
    expectTypeOf<ReturnType<typeof useForm>>().toEqualTypeOf<
      FormProps<FormDataType>
    >();
  });

  test('FormProps<TForm> and RequestConfig<T, TForm> default to string', () => {
    expectTypeOf<FormProps<{ name: string }>['errors']>().toEqualTypeOf<
      Partial<Record<'name', string>>
    >();
    expectTypeOf<
      NonNullable<RequestConfig<unknown, { name: string }>['onError']>
    >()
      .parameter(0)
      .toEqualTypeOf<
        | {
            errors?: Partial<Record<'name', string>>;
            requestError?: AxiosError;
            message?: string;
          }
        | undefined
      >();
  });

  test('setError accepts the matching shape and rejects the other', () => {
    const all = useForm({ name: '' }, { allErrors: true });
    all.setError('name', ['a', 'b']);
    all.setError({ name: ['a'] });
    // @ts-expect-error string in allErrors mode
    all.setError('name', 'a');
    // @ts-expect-error string in allErrors mode
    all.setError({ name: 'a' });

    const first = useForm({ name: '' });
    first.setError('name', 'a');
    first.setError({ name: 'a' });
    // @ts-expect-error array in first-message mode
    first.setError('name', ['a']);
    // @ts-expect-error array in first-message mode
    first.setError({ name: ['a'] });
  });

  test('onError and onValidationError errors follow the mode', () => {
    const all = useForm({ name: '' }, { allErrors: true });
    all.post('/u', {
      onError: (error) => {
        expectTypeOf(error?.errors).toEqualTypeOf<
          Partial<Record<'name', string[]>> | undefined
        >();
      },
      onValidationError: (message, { errors }) => {
        expectTypeOf(message).toEqualTypeOf<string>();
        expectTypeOf(errors).toEqualTypeOf<Partial<Record<'name', string[]>>>();
      },
    });
    all.get('/u', {
      onError: (error) => {
        expectTypeOf(error?.errors).toEqualTypeOf<
          Partial<Record<'name', string[]>> | undefined
        >();
      },
    });
    all.put('/u', {
      onError: (error) => {
        expectTypeOf(error?.errors).toEqualTypeOf<
          Partial<Record<'name', string[]>> | undefined
        >();
      },
    });
    all.patch('/u', {
      onError: (error) => {
        expectTypeOf(error?.errors).toEqualTypeOf<
          Partial<Record<'name', string[]>> | undefined
        >();
      },
    });
    all.delete('/u', {
      onError: (error) => {
        expectTypeOf(error?.errors).toEqualTypeOf<
          Partial<Record<'name', string[]>> | undefined
        >();
      },
    });

    const first = useForm({ name: '' });
    first.put('/u', {
      onError: (error) => {
        expectTypeOf(error?.errors).toEqualTypeOf<
          Partial<Record<'name', string>> | undefined
        >();
      },
      onValidationError: (message, { errors }) => {
        expectTypeOf(message).toEqualTypeOf<string>();
        expectTypeOf(errors).toEqualTypeOf<Partial<Record<'name', string>>>();
      },
    });
  });
});
