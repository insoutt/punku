import { act, renderHook } from '@testing-library/react';
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosProgressEvent,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useForm } from './form.js';

interface PendingRequest {
  config: InternalAxiosRequestConfig;
  resolve: (data?: unknown) => void;
  reject: (status: number, data: unknown) => void;
}

let requests: PendingRequest[];
const originalAdapter = axios.defaults.adapter;

beforeEach(() => {
  requests = [];
  axios.defaults.adapter = (config) =>
    new Promise((resolve, reject) => {
      config.signal?.addEventListener?.('abort', () =>
        reject(new axios.CanceledError(undefined, undefined, config)),
      );
      requests.push({
        config,
        resolve: (data = {}) =>
          resolve({ data, status: 200, statusText: 'OK', headers: {}, config }),
        reject: (status, data) =>
          reject(
            new AxiosError('failed', undefined, config, undefined, {
              data,
              status,
              statusText: '',
              headers: {},
              config,
            }),
          ),
      });
    });
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  vi.useRealTimers();
});

const lastRequest = () => requests[requests.length - 1]!;

const headersOf = (config: InternalAxiosRequestConfig) =>
  AxiosHeaders.from(config.headers).toJSON();

/** Starts a request inside act and returns its promise. */
const start = (send: () => Promise<void>) => {
  let promise!: Promise<void>;
  act(() => {
    promise = send();
  });
  return promise;
};

/** Settles a request and waits for the hook to finish handling it. */
const settle = async (promise: Promise<void>, settleFn: () => void) => {
  await act(async () => {
    settleFn();
    await promise;
  });
};

describe('fix 2: Laravel method spoofing', () => {
  it.each(['put', 'patch', 'delete'] as const)(
    'sends %s FormData requests as POST with _method',
    async (method) => {
      const { result } = renderHook(() => useForm({ name: 'a' }));

      const promise = start(() =>
        result.current[method]('/users/1', { withFormData: true }),
      );
      const { config } = lastRequest();

      expect(config.method).toBe('post');
      expect(config.data).toBeInstanceOf(FormData);
      expect((config.data as FormData).get('_method')).toBe(
        method.toUpperCase(),
      );
      expect((config.data as FormData).get('name')).toBe('a');

      await settle(promise, () => lastRequest().resolve());
    },
  );

  it('does not spoof POST or JSON requests', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    let promise = start(() =>
      result.current.post('/u', { withFormData: true }),
    );
    expect(lastRequest().config.method).toBe('post');
    expect((lastRequest().config.data as FormData).has('_method')).toBe(false);
    await settle(promise, () => lastRequest().resolve());

    promise = start(() => result.current.put('/u'));
    expect(lastRequest().config.method).toBe('put');
    expect(JSON.parse(lastRequest().config.data)).toEqual({ name: 'a' });
    await settle(promise, () => lastRequest().resolve());
  });
});

describe('fix 3: automatic FormData when files are present', () => {
  it('sends FormData without withFormData when a nested File is present', async () => {
    const file = new File(['x'], 'avatar.png');
    const { result } = renderHook(() =>
      useForm({ name: 'a', profile: { photos: [file] } }),
    );

    const promise = start(() => result.current.post('/u'));
    const data = lastRequest().config.data as FormData;

    expect(data).toBeInstanceOf(FormData);
    expect(data.get('name')).toBe('a');
    expect((data.get('profile[photos][0]') as File).name).toBe('avatar.png');

    await settle(promise, () => lastRequest().resolve());
  });
});

describe('fix 4: transform', () => {
  it('transforms the payload at submit time without changing data', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    act(() => {
      result.current.transform((data) => ({ ...data, name: data.name + '!' }));
    });
    expect(result.current.data).toEqual({ name: 'a' });

    act(() => {
      result.current.setData('name', 'b');
    });

    const promise = start(() => result.current.post('/u'));
    expect(JSON.parse(lastRequest().config.data)).toEqual({ name: 'b!' });
    await settle(promise, () => lastRequest().resolve());

    expect(result.current.data).toEqual({ name: 'b' });
  });
});

describe('fix 5: defaults', () => {
  it('setDefaults(field, value) changes defaults but not data', () => {
    const { result } = renderHook(() => useForm({ name: 'a', email: 'e' }));

    act(() => {
      result.current.setDefaults('name', 'z');
    });
    expect(result.current.data).toEqual({ name: 'a', email: 'e' });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toEqual({ name: 'z', email: 'e' });
    expect(result.current.isDirty).toBe(false);
  });

  it('setDefaults({...}) merges into defaults but not data', () => {
    const { result } = renderHook(() => useForm({ name: 'a', email: 'e' }));

    act(() => {
      result.current.setDefaults({ email: 'f' });
    });
    expect(result.current.data).toEqual({ name: 'a', email: 'e' });

    act(() => {
      result.current.reset('email');
    });
    expect(result.current.data).toEqual({ name: 'a', email: 'f' });
  });

  it('setDefaults() makes the current data the defaults', () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    act(() => {
      result.current.setData('name', 'b');
    });
    act(() => {
      result.current.setDefaults();
    });
    expect(result.current.data).toEqual({ name: 'b' });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setData('name', 'c');
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toEqual({ name: 'b' });
  });

  it('isDirty and reset use defaults captured once, not the initialData prop', () => {
    const { result, rerender } = renderHook(({ initial }) => useForm(initial), {
      initialProps: { initial: { name: 'a' } },
    });

    rerender({ initial: { name: 'other' } });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setData('name', 'b');
    });
    act(() => {
      result.current.reset('name');
    });
    expect(result.current.data).toEqual({ name: 'a' });
  });
});

describe('fix 6: cancel race', () => {
  it('an aborted request does not clear processing while a newer one runs', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const first = { onCancel: vi.fn(), onFinish: vi.fn() };

    const firstPromise = start(() => result.current.post('/u', first));
    const secondPromise = start(() => result.current.post('/u'));

    await act(async () => {
      await firstPromise;
    });
    expect(first.onCancel).toHaveBeenCalledOnce();
    expect(first.onFinish).toHaveBeenCalledOnce();
    expect(result.current.processing).toBe(true);

    await settle(secondPromise, () => lastRequest().resolve());
    expect(result.current.processing).toBe(false);
  });

  it('cancel() clears processing', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const promise = start(() => result.current.post('/u'));

    await settle(promise, () => result.current.cancel());
    expect(result.current.processing).toBe(false);
  });
});

describe('fix 7: request options', () => {
  it('does not pass punku-only options to axios', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const promise = start(() =>
      result.current.post('/u', {
        withFormData: false,
        onStart: () => {},
        onFinish: () => {},
        onSuccess: () => {},
        onError: () => {},
        onValidationError: () => {},
        onCancel: () => {},
      }),
    );
    const config = lastRequest().config as unknown as Record<string, unknown>;

    for (const key of [
      'withFormData',
      'onStart',
      'onFinish',
      'onSuccess',
      'onError',
      'onValidationError',
      'onCancel',
    ]) {
      expect(config).not.toHaveProperty(key);
    }

    await settle(promise, () => lastRequest().resolve());
  });

  it('merges caller headers with the default headers', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const promise = start(() =>
      result.current.post('/u', {
        headers: { Authorization: 'Bearer t', 'X-Punku': 'custom' },
      }),
    );
    const headers = headersOf(lastRequest().config);

    expect(headers['Accept']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer t');
    expect(headers['X-Punku']).toBe('custom');

    await settle(promise, () => lastRequest().resolve());
  });

  it('computed method, url, data and signal win over caller options', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const callerSignal = new AbortController().signal;

    const promise = start(() =>
      result.current.post('/u', {
        method: 'get',
        url: '/other',
        data: { name: 'x' },
        signal: callerSignal,
      }),
    );
    const { config } = lastRequest();

    expect(config.method).toBe('post');
    expect(config.url).toBe('/u');
    expect(JSON.parse(config.data)).toEqual({ name: 'a' });
    expect(config.signal).not.toBe(callerSignal);

    await settle(promise, () => lastRequest().resolve());
  });

  it("calls the caller's onUploadProgress in addition to tracking progress", async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const onUploadProgress = vi.fn();

    const promise = start(() =>
      result.current.post('/u', { onUploadProgress }),
    );
    const event = { loaded: 1, total: 4, progress: 0.25, bytes: 1 };
    act(() => {
      lastRequest().config.onUploadProgress!(event as AxiosProgressEvent);
    });

    expect(onUploadProgress).toHaveBeenCalledWith(event);
    expect(result.current.progress?.percentage).toBe(25);

    await settle(promise, () => lastRequest().resolve());
  });
});

describe('fix 8: progress and success state', () => {
  it('exposes percentage on a new object without mutating the event or logging', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const promise = start(() => result.current.post('/u'));
    const event = { loaded: 1, total: 2, progress: 0.5, bytes: 1 };
    act(() => {
      lastRequest().config.onUploadProgress!(event as AxiosProgressEvent);
    });

    expect(result.current.progress).toMatchObject({
      loaded: 1,
      percentage: 50,
    });
    expect(event).not.toHaveProperty('percentage');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();

    await settle(promise, () => lastRequest().resolve());
  });

  it('resets progress to null when the request finishes', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const promise = start(() => result.current.post('/u'));
    act(() => {
      lastRequest().config.onUploadProgress!({
        loaded: 1,
        progress: 1,
        bytes: 1,
      } as AxiosProgressEvent);
    });
    expect(result.current.progress).not.toBeNull();

    await settle(promise, () => lastRequest().resolve());
    expect(result.current.progress).toBeNull();
  });

  it('resets wasSuccessful and recentlySuccessful when a request starts', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    let promise = start(() => result.current.post('/u'));
    await settle(promise, () => lastRequest().resolve());
    expect(result.current.wasSuccessful).toBe(true);
    expect(result.current.recentlySuccessful).toBe(true);

    promise = start(() => result.current.post('/u'));
    expect(result.current.wasSuccessful).toBe(false);
    expect(result.current.recentlySuccessful).toBe(false);

    await settle(promise, () => lastRequest().reject(500, {}));
  });

  it('re-arms the recentlySuccessful timeout on each success', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useForm({ name: 'a' }));

    let promise = start(() => result.current.post('/u'));
    await settle(promise, () => lastRequest().resolve());

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    promise = start(() => result.current.post('/u'));
    await settle(promise, () => lastRequest().resolve());

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.recentlySuccessful).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.recentlySuccessful).toBe(false);
  });

  it('clears the recentlySuccessful timeout on unmount', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useForm({ name: 'a' }));

    const promise = start(() => result.current.post('/u'));
    await settle(promise, () => lastRequest().resolve());
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fix 9: data written in the same handler as submit', () => {
  it('post sends data set in the same handler', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const promise = start(() => {
      result.current.setData('name', 'b');
      return result.current.post('/u');
    });
    expect(JSON.parse(lastRequest().config.data)).toEqual({ name: 'b' });

    await settle(promise, () => lastRequest().resolve());
  });

  it('consecutive functional setData calls compose and are sent', async () => {
    const { result } = renderHook(() => useForm({ count: 0 }));

    const promise = start(() => {
      result.current.setData('count', 5);
      result.current.setData((prev) => ({ ...prev, count: prev.count + 1 }));
      result.current.setData((prev) => ({ ...prev, count: prev.count + 1 }));
      return result.current.post('/u');
    });
    expect(JSON.parse(lastRequest().config.data)).toEqual({ count: 7 });
    expect(result.current.data).toEqual({ count: 7 });

    await settle(promise, () => lastRequest().resolve());
  });

  it('setData(object) and reset(field) in the same handler are sent', async () => {
    const { result } = renderHook(() => useForm({ name: 'a', email: 'e' }));

    const promise = start(() => {
      result.current.setData({ name: 'b', email: 'f' });
      result.current.reset('email');
      return result.current.post('/u');
    });
    expect(JSON.parse(lastRequest().config.data)).toEqual({
      name: 'b',
      email: 'e',
    });

    await settle(promise, () => lastRequest().resolve());
  });

  it('reset() in the same handler is sent', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    act(() => {
      result.current.setData('name', 'b');
    });
    const promise = start(() => {
      result.current.reset();
      return result.current.post('/u');
    });
    expect(JSON.parse(lastRequest().config.data)).toEqual({ name: 'a' });

    await settle(promise, () => lastRequest().resolve());
  });

  it('transform receives data set in the same handler', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const promise = start(() => {
      result.current.transform((data) => ({ name: data.name + '!' }));
      result.current.setData('name', 'b');
      return result.current.get('/u');
    });
    expect(lastRequest().config.params).toEqual({ name: 'b!' });

    await settle(promise, () => lastRequest().resolve());
  });
});

describe('fix 10: defaults written in the same handler', () => {
  it('setDefaults() uses data set in the same handler', () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    act(() => {
      result.current.setData('name', 'b');
      result.current.setDefaults();
    });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setData('name', 'c');
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toEqual({ name: 'b' });
  });

  it('reset() uses defaults set in the same handler', () => {
    const { result } = renderHook(() => useForm({ name: 'a', email: 'e' }));

    act(() => {
      result.current.setDefaults('name', 'z');
      result.current.setDefaults({ email: 'f' });
      result.current.reset();
    });
    expect(result.current.data).toEqual({ name: 'z', email: 'f' });
  });

  it('reset() in onSuccess uses defaults set while the request was in flight', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const form = result.current;

    act(() => {
      form.setData('name', 'b');
    });
    const promise = start(() =>
      form.post('/u', { onSuccess: () => form.reset() }),
    );
    act(() => {
      result.current.setDefaults('name', 'z');
    });

    await settle(promise, () => lastRequest().resolve());
    expect(result.current.data).toEqual({ name: 'z' });
  });
});

describe('fix 11: isDirty', () => {
  it('detects a replaced file', () => {
    const first = new File(['a'], 'a.png');
    const { result } = renderHook(() =>
      useForm<{ avatar: File }>({ avatar: first }),
    );

    act(() => {
      result.current.setData('avatar', new File(['b'], 'b.png'));
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.setData('avatar', first);
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('compares plain objects, arrays and dates by value', () => {
    const { result } = renderHook(() =>
      useForm({ at: new Date(0), tags: ['x'], profile: { name: 'a' } }),
    );

    act(() => {
      result.current.setData({
        at: new Date(0),
        tags: ['x'],
        profile: { name: 'a' },
      });
    });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setData('at', new Date(1));
    });
    expect(result.current.isDirty).toBe(true);
  });
});

describe('fix 12: validation errors', () => {
  it('treats a 422 with errors as validation', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const onValidationError = vi.fn();

    const promise = start(() =>
      result.current.post('/u', { onValidationError }),
    );
    await settle(promise, () =>
      lastRequest().reject(422, { errors: { name: ['bad'] } }),
    );

    expect(result.current.errors).toEqual({ name: 'bad' });
    expect(onValidationError).toHaveBeenCalledWith('bad');
  });

  it('treats a non-422 with errors as a request error', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const onValidationError = vi.fn();
    const onError = vi.fn();

    act(() => {
      result.current.setError('name', 'old');
    });
    const promise = start(() =>
      result.current.post('/u', { onValidationError, onError }),
    );
    await settle(promise, () =>
      lastRequest().reject(500, { errors: { name: ['bad'] } }),
    );

    expect(result.current.errors).toEqual({});
    expect(onValidationError).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({
      requestError: expect.any(AxiosError),
    });
  });
});

describe('fix 13: setError', () => {
  it('setError(object) merges into existing errors', () => {
    const { result } = renderHook(() => useForm({ name: '', email: '' }));

    act(() => {
      result.current.setError('name', 'n');
      result.current.setError({ email: 'e' });
    });
    expect(result.current.errors).toEqual({ name: 'n', email: 'e' });
  });
});

describe('fix 14: throwing transform', () => {
  it('resolves, clears processing and calls onError and onFinish', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const onError = vi.fn();
    const onFinish = vi.fn();

    act(() => {
      result.current.transform(() => {
        throw new Error('bad transform');
      });
    });
    const promise = start(() =>
      result.current.post('/u', { onError, onFinish }),
    );

    await act(async () => {
      await expect(promise).resolves.toBeUndefined();
    });
    expect(result.current.processing).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(0);
  });
});
