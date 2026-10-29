import { act, renderHook } from '@testing-library/react';
import axios, { type AxiosResponse } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { useForm } from './form.js';

// React 18+ ignores state updates after unmount and the hook result freezes,
// so the hook's state setters are wrapped to record the values written.
const writes = vi.hoisted(() => [] as unknown[]);

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const [state, setState] = react.useState(initial);
      return [
        state,
        (value: unknown) => {
          writes.push(value);
          setState(value);
        },
      ];
    },
  };
});

const originalAdapter = axios.defaults.adapter;

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
});

it('unmounting during a request skips the success-state writes', async () => {
  let resolve!: () => void;
  axios.defaults.adapter = (config) =>
    new Promise<AxiosResponse>((r) => {
      resolve = () =>
        r({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    });
  const { result, unmount } = renderHook(() => useForm({ name: 'a' }));

  let promise!: Promise<unknown>;
  act(() => {
    promise = result.current.post('/u');
  });
  // The wrapper sees the hook's writes: setProcessing(true) on start.
  expect(writes).toContain(true);

  unmount();
  writes.length = 0;
  await act(async () => {
    resolve();
    await promise;
  });

  // setWasSuccessful(true), setRecentlySuccessful(true), setErrors({}).
  expect(writes).not.toContain(true);
  expect(writes).not.toContainEqual({});
});
