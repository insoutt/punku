import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosProgressEvent,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import { useForm } from './form.js';

interface PendingRequest {
  config: InternalAxiosRequestConfig;
  resolve: (data?: unknown) => void;
  reject: (status: number, data: unknown) => void;
  networkError: () => void;
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
        networkError: () =>
          reject(new AxiosError('Network Error', 'ERR_NETWORK', config)),
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
const start = <T>(send: () => Promise<T>) => {
  let promise!: Promise<T>;
  act(() => {
    promise = send();
  });
  return promise;
};

/** Settles a request, waits for the hook to finish handling it and returns what it resolved. */
const settle = async <T>(promise: Promise<T>, settleFn: () => void) => {
  let value!: T;
  await act(async () => {
    settleFn();
    value = await promise;
  });
  return value;
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
        onBefore: () => {},
        onProgress: () => {},
        onHttpException: () => {},
        onNetworkError: () => {},
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
      'onBefore',
      'onProgress',
      'onHttpException',
      'onNetworkError',
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
    expect(onValidationError).toHaveBeenCalledWith('bad', expect.anything());
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

/** Request callbacks that record their name into `calls`, in call order. */
const track = (calls: string[]) => {
  const record = (name: string) =>
    vi.fn(() => {
      calls.push(name);
    });
  return {
    onBefore: record('onBefore'),
    onStart: record('onStart'),
    onHttpException: record('onHttpException'),
    onNetworkError: record('onNetworkError'),
    onValidationError: record('onValidationError'),
    onError: record('onError'),
    onCancel: record('onCancel'),
    onSuccess: record('onSuccess'),
    onFinish: record('onFinish'),
  };
};

/**
 * Holds every response in a response interceptor, which runs after axios's
 * own abort check, until its release function is called.
 */
const holdResponses = () => {
  const releases: (() => void)[] = [];
  const id = axios.interceptors.response.use(
    (response) =>
      new Promise<AxiosResponse>((resolve) =>
        releases.push(() => resolve(response)),
      ),
  );
  onTestFinished(() => axios.interceptors.response.eject(id));
  return releases;
};

describe('F1: request methods resolve the response data', () => {
  it.each(['get', 'post', 'put', 'patch', 'delete'] as const)(
    '%s resolves response.data on success',
    async (method) => {
      const { result } = renderHook(() => useForm({ name: 'a' }));

      const promise = start(() => result.current[method]('/u'));
      const value = await settle(promise, () =>
        lastRequest().resolve({ id: 1 }),
      );

      expect(value).toEqual({ id: 1 });
    },
  );
});

describe('F5: callback matrix', () => {
  it('onBefore returning false: only onBefore, nothing sent, resolves undefined', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const onBefore = vi.fn(() => {
      calls.push('onBefore');
      return false;
    });

    const promise = start(() =>
      result.current.post('/u', { ...track(calls), onBefore }),
    );

    await expect(promise).resolves.toBeUndefined();
    expect(calls).toEqual(['onBefore']);
    expect(requests).toHaveLength(0);
  });

  it('success: onBefore, onStart, onSuccess, onFinish; resolves the data', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);

    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () => lastRequest().resolve({ id: 1 }));

    expect(calls).toEqual(['onBefore', 'onStart', 'onSuccess', 'onFinish']);
    expect(callbacks.onSuccess).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ status: 200 }),
    );
    expect(value).toEqual({ id: 1 });
  });

  it("422 with errors and onValidationError: first message plus Laravel's { message, errors }; no onError", async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);

    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () =>
      lastRequest().reject(422, {
        message: 'The name is invalid.',
        errors: { name: ['bad', 'worse'] },
      }),
    );

    expect(calls).toEqual([
      'onBefore',
      'onStart',
      'onValidationError',
      'onFinish',
    ]);
    expect(callbacks.onValidationError).toHaveBeenCalledWith('bad', {
      message: 'The name is invalid.',
      errors: { name: 'bad' },
    });
    expect(result.current.errors).toEqual({ name: 'bad' });
    expect(value).toBeUndefined();
  });

  it('422 with errors, no onValidationError: onError gets { errors, requestError, message }', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const { onValidationError: _, ...callbacks } = track(calls);

    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () =>
      lastRequest().reject(422, {
        message: 'The name is invalid.',
        errors: { name: ['bad'] },
      }),
    );

    expect(calls).toEqual(['onBefore', 'onStart', 'onError', 'onFinish']);
    expect(callbacks.onError).toHaveBeenCalledWith({
      errors: { name: 'bad' },
      requestError: expect.any(AxiosError),
      message: 'The name is invalid.',
    });
    expect(value).toBeUndefined();
  });

  it('422 with empty errors: validation path without a first message, so onError; no onHttpException', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);

    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () =>
      lastRequest().reject(422, { message: 'Invalid.', errors: {} }),
    );

    expect(calls).toEqual(['onBefore', 'onStart', 'onError', 'onFinish']);
    expect(callbacks.onError).toHaveBeenCalledWith({
      errors: {},
      requestError: expect.any(AxiosError),
      message: 'Invalid.',
    });
    expect(value).toBeUndefined();
  });

  it('other HTTP status: onHttpException(response), then onError({ requestError })', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);

    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () =>
      lastRequest().reject(500, { message: 'Server Error' }),
    );

    expect(calls).toEqual([
      'onBefore',
      'onStart',
      'onHttpException',
      'onError',
      'onFinish',
    ]);
    expect(callbacks.onHttpException).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        data: { message: 'Server Error' },
      }),
    );
    expect(callbacks.onError).toHaveBeenCalledWith({
      requestError: expect.any(AxiosError),
    });
    expect(value).toBeUndefined();
  });

  it('422 with a message only: an HTTP exception, errors cleared', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);

    act(() => {
      result.current.setError('name', 'old');
    });
    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () =>
      lastRequest().reject(422, { message: 'Invalid.' }),
    );

    expect(calls).toEqual([
      'onBefore',
      'onStart',
      'onHttpException',
      'onError',
      'onFinish',
    ]);
    expect(callbacks.onHttpException).toHaveBeenCalledWith(
      expect.objectContaining({ status: 422, data: { message: 'Invalid.' } }),
    );
    expect(callbacks.onError).toHaveBeenCalledWith({
      requestError: expect.any(AxiosError),
    });
    expect(result.current.errors).toEqual({});
    expect(value).toBeUndefined();
  });

  it('network error: onNetworkError(error), then onError({ requestError })', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);

    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () => lastRequest().networkError());

    expect(calls).toEqual([
      'onBefore',
      'onStart',
      'onNetworkError',
      'onError',
      'onFinish',
    ]);
    const [error] = callbacks.onNetworkError.mock.calls[0] as unknown[];
    expect(error).toBeInstanceOf(AxiosError);
    expect((error as AxiosError).response).toBeUndefined();
    expect(callbacks.onError).toHaveBeenCalledWith({ requestError: error });
    expect(value).toBeUndefined();
  });

  it('other error (throwing transform): onError() without arguments', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);

    act(() => {
      result.current.transform(() => {
        throw new Error('bad transform');
      });
    });
    const promise = start(() => result.current.post('/u', callbacks));
    const value = await settle(promise, () => {});

    expect(calls).toEqual(['onBefore', 'onStart', 'onError', 'onFinish']);
    expect(callbacks.onError).toHaveBeenCalledWith();
    expect(value).toBeUndefined();
  });

  it('onSuccess throwing: onSuccess, then onError() without arguments; resolves undefined', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];
    const callbacks = track(calls);
    const onSuccess = vi.fn(() => {
      calls.push('onSuccess');
      throw new Error('bad onSuccess');
    });

    const promise = start(() =>
      result.current.post('/u', { ...callbacks, onSuccess }),
    );
    const value = await settle(promise, () => lastRequest().resolve({ id: 1 }));

    expect(calls).toEqual([
      'onBefore',
      'onStart',
      'onSuccess',
      'onError',
      'onFinish',
    ]);
    expect(callbacks.onError).toHaveBeenCalledWith();
    expect(value).toBeUndefined();
  });

  it('cancel(): onCancel, then onFinish; resolves undefined', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];

    const promise = start(() => result.current.post('/u', track(calls)));
    const value = await settle(promise, () => result.current.cancel());

    expect(calls).toEqual(['onBefore', 'onStart', 'onCancel', 'onFinish']);
    expect(value).toBeUndefined();
  });

  it('aborted by a newer request: onCancel, then onFinish; resolves undefined', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];

    const first = start(() => result.current.post('/u', track(calls)));
    const second = start(() => result.current.post('/u'));
    const value = await settle(first, () => {});

    expect(calls).toEqual(['onBefore', 'onStart', 'onCancel', 'onFinish']);
    expect(value).toBeUndefined();

    await settle(second, () => lastRequest().resolve());
  });

  it('aborted, then fulfilled (response held by an interceptor): onCancel, not onSuccess; resolves undefined', async () => {
    const releases = holdResponses();
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];

    const promise = start(() => result.current.post('/u', track(calls)));
    lastRequest().resolve({ id: 1 });
    await vi.waitFor(() => expect(releases).toHaveLength(1));

    act(() => {
      result.current.cancel();
    });
    const value = await settle(promise, () => releases[0]!());

    expect(calls).toEqual(['onBefore', 'onStart', 'onCancel', 'onFinish']);
    expect(value).toBeUndefined();
    expect(result.current.wasSuccessful).toBe(false);
    expect(result.current.processing).toBe(false);
  });

  it('transformResponse calling cancel(): onCancel, not onSuccess; resolves undefined', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const calls: string[] = [];

    const promise = start(() =>
      result.current.post('/u', {
        ...track(calls),
        transformResponse: (data) => {
          result.current.cancel();
          return data;
        },
      }),
    );
    const value = await settle(promise, () => lastRequest().resolve({ id: 1 }));

    expect(calls).toEqual(['onBefore', 'onStart', 'onCancel', 'onFinish']);
    expect(value).toBeUndefined();
    expect(result.current.wasSuccessful).toBe(false);
  });
});

describe('request ownership and lifecycle', () => {
  it('a response held past a newer request is a cancel and writes no success state', async () => {
    const releases = holdResponses();
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const first = { onSuccess: vi.fn(), onCancel: vi.fn() };

    const firstPromise = start(() => result.current.post('/u', first));
    lastRequest().resolve({ id: 1 });
    await vi.waitFor(() => expect(releases).toHaveLength(1));

    const secondPromise = start(() => result.current.post('/u'));
    act(() => {
      result.current.setError('name', 'kept');
    });
    const value = await settle(firstPromise, () => releases[0]!());

    expect(value).toBeUndefined();
    expect(first.onSuccess).not.toHaveBeenCalled();
    expect(first.onCancel).toHaveBeenCalledOnce();
    expect(result.current.wasSuccessful).toBe(false);
    expect(result.current.recentlySuccessful).toBe(false);
    expect(result.current.errors).toEqual({ name: 'kept' });
    expect(result.current.processing).toBe(true);

    lastRequest().resolve({ id: 2 });
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(await settle(secondPromise, () => releases[1]!())).toEqual({
      id: 2,
    });
    expect(result.current.wasSuccessful).toBe(true);
    expect(result.current.processing).toBe(false);
  });

  it('a request started by an abort listener and replaced without being aborted writes no success state', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const adapter = axios.defaults.adapter as AxiosAdapter;
    let third: Promise<unknown> | undefined;
    // The abort listener on the first request's signal starts a third request
    // while the second one is starting, before it takes ownership.
    axios.defaults.adapter = (config) => {
      if (config.url === '/first') {
        config.signal?.addEventListener?.('abort', () => {
          third = result.current.post('/third');
        });
      }
      return adapter(config);
    };
    act(() => {
      result.current.setError('name', 'kept');
    });

    const first = start(() => result.current.post('/first'));
    const second = start(() => result.current.post('/second'));
    await settle(first, () => {});

    const thirdRequest = requests.find((r) => r.config.url === '/third')!;
    expect(thirdRequest.config.signal?.aborted).toBe(false);
    expect(await settle(third!, () => thirdRequest.resolve({ id: 3 }))).toEqual(
      { id: 3 },
    );
    expect(result.current.wasSuccessful).toBe(false);
    expect(result.current.recentlySuccessful).toBe(false);
    expect(result.current.errors).toEqual({ name: 'kept' });

    await settle(second, () => lastRequest().resolve());
  });

  it('unmounting during a request skips success-path writes (no timer scheduled)', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useForm({ name: 'a' }));
    const onSuccess = vi.fn();

    const promise = start(() => result.current.post('/u', { onSuccess }));
    unmount();
    const value = await settle(promise, () => lastRequest().resolve({ id: 1 }));

    expect(vi.getTimerCount()).toBe(0);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(value).toEqual({ id: 1 });
  });

  it('success-path writes still happen under StrictMode', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }), {
      wrapper: StrictMode,
    });

    const promise = start(() => result.current.post('/u'));
    await settle(promise, () => lastRequest().resolve());

    expect(result.current.wasSuccessful).toBe(true);
    expect(result.current.recentlySuccessful).toBe(true);
  });
});

describe('F5: onBefore', () => {
  it('returning false does not abort the in-flight request', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const onSuccess = vi.fn();

    const first = start(() => result.current.post('/u', { onSuccess }));
    const second = start(() =>
      result.current.post('/u', { onBefore: () => false }),
    );

    expect(requests).toHaveLength(1);
    expect(lastRequest().config.signal?.aborted).toBe(false);
    await expect(second).resolves.toBeUndefined();
    expect(result.current.processing).toBe(true);

    await settle(first, () => lastRequest().resolve({ id: 1 }));
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('returning false changes no state', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const first = start(() => result.current.post('/u'));
    await settle(first, () => lastRequest().resolve());
    act(() => {
      result.current.setError('name', 'kept');
    });

    const second = start(() =>
      result.current.post('/u', { onBefore: () => false }),
    );
    await act(async () => {
      await second;
    });

    expect(result.current.processing).toBe(false);
    expect(result.current.wasSuccessful).toBe(true);
    expect(result.current.recentlySuccessful).toBe(true);
    expect(result.current.errors).toEqual({ name: 'kept' });
  });

  it("returning false leaves an in-flight upload's progress unchanged", async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const first = start(() => result.current.post('/u'));
    act(() => {
      lastRequest().config.onUploadProgress!({
        loaded: 1,
        total: 2,
        progress: 0.5,
      } as AxiosProgressEvent);
    });
    const progress = result.current.progress;
    expect(progress).not.toBeNull();

    const second = start(() =>
      result.current.post('/u', { onBefore: () => false }),
    );
    await act(async () => {
      await second;
    });

    expect(result.current.progress).toBe(progress);
    expect(lastRequest().config.signal?.aborted).toBe(false);
    await settle(first, () => lastRequest().resolve());
  });

  it('runs before the in-flight request is aborted', async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));

    const first = start(() => result.current.post('/u'));
    const { signal } = lastRequest().config;
    let abortedInOnBefore: boolean | undefined;
    const second = start(() =>
      result.current.post('/u', {
        onBefore: () => {
          abortedInOnBefore = signal?.aborted;
        },
      }),
    );

    expect(abortedInOnBefore).toBe(false);
    expect(signal?.aborted).toBe(true);
    await settle(first, () => {});
    await settle(second, () => lastRequest().resolve());
  });
});

describe('F5: onProgress', () => {
  it("receives punku's Progress; the axios onUploadProgress still fires", async () => {
    const { result } = renderHook(() => useForm({ name: 'a' }));
    const onProgress = vi.fn();
    const onUploadProgress = vi.fn();

    const promise = start(() =>
      result.current.post('/u', { onProgress, onUploadProgress }),
    );
    const event = { loaded: 1, total: 4, progress: 0.25, bytes: 1 };
    act(() => {
      lastRequest().config.onUploadProgress!(event as AxiosProgressEvent);
    });

    expect(onProgress).toHaveBeenCalledWith({ ...event, percentage: 25 });
    expect(onUploadProgress).toHaveBeenCalledWith(event);

    await settle(promise, () => lastRequest().resolve());
  });
});

describe('F3: resetAndClearErrors', () => {
  it('resets and clears only the given fields', () => {
    const { result } = renderHook(() => useForm({ name: 'a', email: 'e' }));

    act(() => {
      result.current.setData({ name: 'b', email: 'f' });
      result.current.setError({ name: 'n', email: 'm' });
    });
    act(() => {
      result.current.resetAndClearErrors('name');
    });

    expect(result.current.data).toEqual({ name: 'a', email: 'f' });
    expect(result.current.errors).toEqual({ email: 'm' });
  });

  it('with no fields, resets all data and clears all errors', () => {
    const { result } = renderHook(() => useForm({ name: 'a', email: 'e' }));

    act(() => {
      result.current.setData({ name: 'b', email: 'f' });
      result.current.setError({ name: 'n', email: 'm' });
    });
    act(() => {
      result.current.resetAndClearErrors();
    });

    expect(result.current.data).toEqual({ name: 'a', email: 'e' });
    expect(result.current.errors).toEqual({});
  });
});

describe('F4: allErrors', () => {
  const rejectWithTwoMessages = () =>
    lastRequest().reject(422, {
      message: 'The name is invalid.',
      errors: { name: ['a', 'b'] },
    });

  it('keeps every message per field with allErrors: true, the first without', async () => {
    const all = renderHook(() =>
      useForm({ name: '' }, { allErrors: true }),
    ).result;
    const first = renderHook(() => useForm({ name: '' })).result;

    await settle(
      start(() => all.current.post('/u')),
      rejectWithTwoMessages,
    );
    await settle(
      start(() => first.current.post('/u')),
      rejectWithTwoMessages,
    );

    expect(all.current.errors).toEqual({ name: ['a', 'b'] });
    expect(first.current.errors).toEqual({ name: 'a' });
  });

  it("onValidationError gets the first message and the mode's errors; no onError", async () => {
    const all = renderHook(() =>
      useForm({ name: '' }, { allErrors: true }),
    ).result;
    const first = renderHook(() => useForm({ name: '' })).result;
    const allCallbacks = { onValidationError: vi.fn(), onError: vi.fn() };
    const firstCallbacks = { onValidationError: vi.fn(), onError: vi.fn() };

    await settle(
      start(() => all.current.post('/u', allCallbacks)),
      rejectWithTwoMessages,
    );
    await settle(
      start(() => first.current.post('/u', firstCallbacks)),
      rejectWithTwoMessages,
    );

    expect(allCallbacks.onValidationError).toHaveBeenCalledWith('a', {
      message: 'The name is invalid.',
      errors: { name: ['a', 'b'] },
    });
    expect(allCallbacks.onError).not.toHaveBeenCalled();
    expect(firstCallbacks.onValidationError).toHaveBeenCalledWith('a', {
      message: 'The name is invalid.',
      errors: { name: 'a' },
    });
    expect(firstCallbacks.onError).not.toHaveBeenCalled();
  });

  it("onError gets the mode's errors", async () => {
    const all = renderHook(() =>
      useForm({ name: '' }, { allErrors: true }),
    ).result;
    const first = renderHook(() => useForm({ name: '' })).result;
    const allOnError = vi.fn();
    const firstOnError = vi.fn();

    await settle(
      start(() => all.current.post('/u', { onError: allOnError })),
      rejectWithTwoMessages,
    );
    await settle(
      start(() => first.current.post('/u', { onError: firstOnError })),
      rejectWithTwoMessages,
    );

    expect(allOnError).toHaveBeenCalledWith({
      errors: { name: ['a', 'b'] },
      requestError: expect.any(AxiosError),
      message: 'The name is invalid.',
    });
    expect(firstOnError).toHaveBeenCalledWith({
      errors: { name: 'a' },
      requestError: expect.any(AxiosError),
      message: 'The name is invalid.',
    });
  });

  it('setError, clearErrors, resetAndClearErrors and hasErrors work with arrays', async () => {
    const { result } = renderHook(() =>
      useForm({ name: '', email: '', age: '' }, { allErrors: true }),
    );

    await settle(
      start(() => result.current.post('/u')),
      rejectWithTwoMessages,
    );
    act(() => {
      result.current.setError('email', ['e1', 'e2']);
      result.current.setError({ age: ['g'] });
    });
    expect(result.current.errors).toEqual({
      name: ['a', 'b'],
      email: ['e1', 'e2'],
      age: ['g'],
    });
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      result.current.clearErrors('name');
    });
    expect(result.current.errors).toEqual({ email: ['e1', 'e2'], age: ['g'] });

    act(() => {
      result.current.resetAndClearErrors('email');
    });
    expect(result.current.errors).toEqual({ age: ['g'] });

    act(() => {
      result.current.clearErrors();
    });
    expect(result.current.errors).toEqual({});
    expect(result.current.hasErrors).toBe(false);
  });

  it('the mode is fixed at mount: changing allErrors on rerender has no effect', async () => {
    const all = renderHook(
      ({ allErrors }) =>
        useForm({ name: '' }, { allErrors } as { allErrors: true }),
      { initialProps: { allErrors: true } },
    );
    const first = renderHook(
      ({ allErrors }) =>
        useForm({ name: '' }, { allErrors } as { allErrors: true }),
      { initialProps: { allErrors: false } },
    );
    all.rerender({ allErrors: false });
    first.rerender({ allErrors: true });

    await settle(
      start(() => all.result.current.post('/u')),
      rejectWithTwoMessages,
    );
    await settle(
      start(() => first.result.current.post('/u')),
      rejectWithTwoMessages,
    );

    expect(all.result.current.errors).toEqual({ name: ['a', 'b'] });
    expect(first.result.current.errors).toEqual({ name: 'a' });
  });
});
