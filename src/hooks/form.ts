import { useState, useRef, useEffect } from 'react';
import axios, {
  type AxiosRequestConfig,
  type AxiosProgressEvent,
  type AxiosError,
  type AxiosResponse,
} from 'axios';
import { hasFiles, objectToFormData } from './formData.js';

export interface DataResponse<T> {
  data: T;
}

export interface RequestConfig<T, TForm extends FormDataType>
  extends AxiosRequestConfig {
  withFormData?: boolean;
  onBefore?: () => boolean | void;
  onStart?: () => void;
  onProgress?: (progress: Progress) => void;
  onFinish?: () => void;
  onValidationError?: (
    message: string,
    validation: {
      message?: string;
      errors: Partial<Record<keyof TForm, string>>;
    },
  ) => void;
  onHttpException?: (response: AxiosResponse) => void;
  onNetworkError?: (error: AxiosError) => void;
  onSuccess?: (data: T, response: AxiosResponse<T>) => void;
  onCancel?: () => void;
  onError?: (error?: {
    errors?: Partial<Record<keyof TForm, string>>;
    requestError?: AxiosError;
    message?: string;
  }) => void;
}

export type Progress = AxiosProgressEvent & { percentage: number | undefined };
export type FormDataType = object;
export interface FormProps<TForm extends FormDataType> {
  data: TForm;
  isDirty: boolean;
  errors: Partial<Record<keyof TForm, string>>;
  hasErrors: boolean;
  processing: boolean;
  progress: Progress | null;
  wasSuccessful: boolean;
  recentlySuccessful: boolean;
  setData: setDataByObject<TForm> &
    setDataByMethod<TForm> &
    setDataByKeyValuePair<TForm>;
  transform: (callback: (data: TForm) => object) => void;
  setDefaults(): void;
  setDefaults(field: keyof TForm, value: FormDataConvertible): void;
  setDefaults(fields: Partial<TForm>): void;
  reset: (...fields: (keyof TForm)[]) => void;
  clearErrors: (...fields: (keyof TForm)[]) => void;
  resetAndClearErrors: (...fields: (keyof TForm)[]) => void;
  setError(field: keyof TForm, value: string): void;
  setError(errors: Partial<Record<keyof TForm, string>>): void;
  get: <TRequest>(
    url: string,
    options?: Omit<RequestConfig<TRequest, TForm>, 'withFormData'>,
  ) => Promise<TRequest | undefined>;
  patch: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<TRequest | undefined>;
  post: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<TRequest | undefined>;
  put: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<TRequest | undefined>;
  delete: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<TRequest | undefined>;
  cancel: () => void;
}

type setDataByObject<TForm> = (data: TForm) => void;
type setDataByMethod<TForm> = (data: (previousData: TForm) => TForm) => void;
type setDataByKeyValuePair<TForm> = <K extends keyof TForm>(
  key: K,
  value: TForm[K],
) => void;

type FormDataEntryValue = File | string;

export type FormDataConvertible =
  | FormDataConvertible[]
  | {
      [key: string]: FormDataConvertible;
    }
  | Blob
  | FormDataEntryValue
  | Date
  | boolean
  | number
  | null
  | undefined;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Plain objects and arrays compare by value, dates by time, anything else
// (File, Blob, FileList, class instances) by identity.
const isEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => isEqual(value, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          isEqual(a[key], b[key]),
      )
    );
  }
  return false;
};

export function useForm<TForm extends FormDataType>(
  initialData?: TForm,
): FormProps<TForm> {
  const [data, setDataState] = useState<TForm>(initialData || ({} as TForm));
  const [defaults, setDefaultsState] = useState<TForm>(
    initialData || ({} as TForm),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof TForm, string>>>(
    {},
  );
  // Mirror data and defaults so calls in the same handler see each other's writes.
  const dataRef = useRef(data);
  const defaultsRef = useRef(defaults);
  const [processing, setProcessing] = useState<boolean>(false);
  const [wasSuccessful, setWasSuccessful] = useState<boolean>(false);
  const [recentlySuccessful, setRecentlySuccessful] = useState<boolean>(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const transformRef = useRef<(data: TForm) => object>((data) => data);
  const recentlySuccessfulTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(recentlySuccessfulTimeoutRef.current);
    };
  }, []);

  const isDirty = !isEqual(data, defaults);
  const hasErrors = Object.keys(errors).length > 0;

  const transformErrors = (
    errors: Record<keyof TForm, string[]>,
  ): Partial<Record<keyof TForm, string>> => {
    const formattedErrors: Partial<Record<keyof TForm, string>> = {};

    Object.entries(errors).forEach(([key, value]) => {
      formattedErrors[key as keyof TForm] = Array.isArray(value)
        ? value[0]
        : value;
    });

    return formattedErrors;
  };

  const commitData = (next: TForm) => {
    dataRef.current = next;
    setDataState(next);
  };

  const commitDefaults = (next: TForm) => {
    defaultsRef.current = next;
    setDefaultsState(next);
  };

  const setData: FormProps<TForm>['setData'] = (
    keyOrData: any,
    value?: TForm[keyof TForm],
  ) => {
    if (typeof keyOrData === 'function') {
      commitData(keyOrData(dataRef.current));
    } else if (typeof keyOrData === 'object') {
      commitData(keyOrData);
    } else {
      commitData({ ...dataRef.current, [keyOrData]: value });
    }
  };

  const setDefaults = (
    fieldOrFields?: keyof TForm | Partial<TForm>,
    value?: FormDataConvertible,
  ) => {
    if (typeof fieldOrFields === 'object') {
      commitDefaults({ ...defaultsRef.current, ...fieldOrFields });
    } else if (typeof fieldOrFields !== 'undefined') {
      commitDefaults({ ...defaultsRef.current, [fieldOrFields]: value });
    } else {
      commitDefaults(dataRef.current);
    }
  };

  const reset = (...fields: (keyof TForm)[]) => {
    if (fields.length === 0) {
      commitData(defaultsRef.current);
    } else {
      const newState = { ...dataRef.current };
      fields.forEach((field) => {
        newState[field] = defaultsRef.current[field];
      });
      commitData(newState);
    }
  };

  const clearErrors = (...fields: (keyof TForm)[]) => {
    if (fields.length === 0) {
      setErrors({});
    } else {
      setErrors((prev) => {
        const newErrors = { ...prev };
        fields.forEach((field) => delete newErrors[field]);
        return newErrors;
      });
    }
  };

  const resetAndClearErrors = (...fields: (keyof TForm)[]) => {
    reset(...fields);
    clearErrors(...fields);
  };

  const setError = (
    fieldOrErrors: keyof TForm | Partial<Record<keyof TForm, string>>,
    value?: string,
  ) => {
    if (typeof fieldOrErrors === 'object') {
      setErrors((prev) => ({ ...prev, ...fieldOrErrors }));
    } else {
      setErrors((prev) => ({ ...prev, [fieldOrErrors]: value }));
    }
  };

  const sendRequest = async <TRequest>(
    method: 'get' | 'patch' | 'post' | 'put' | 'delete',
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ): Promise<TRequest | undefined> => {
    const {
      withFormData,
      onBefore,
      onStart,
      onProgress,
      onFinish,
      onSuccess,
      onError,
      onValidationError,
      onHttpException,
      onNetworkError,
      onCancel,
      ...axiosOptions
    } = options ?? {};

    if (onBefore?.() === false) return;

    setProcessing(true);
    setWasSuccessful(false);
    setRecentlySuccessful(false);
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    onStart?.();

    try {
      const payload = transformRef.current(dataRef.current);
      const getParams = method === 'get' ? payload : axiosOptions.params;
      let requestMethod = method;
      let requestData: object | undefined =
        method !== 'get' ? payload : undefined;

      if (method !== 'get' && (withFormData || hasFiles(payload))) {
        const formData = objectToFormData(payload);
        if (method !== 'post') {
          formData.append('_method', method.toUpperCase());
          requestMethod = 'post';
        }
        requestData = formData;
      }

      const response = await axios({
        ...axiosOptions,
        method: requestMethod,
        url,
        data: requestData,
        params: getParams,
        signal: abortController.signal,
        headers: {
          Accept: 'application/json',
          'X-Punku': true,
          ...axiosOptions.headers,
        },
        onUploadProgress: (progressEvent) => {
          const progress = {
            ...progressEvent,
            percentage: progressEvent.progress
              ? Math.round(progressEvent.progress * 100)
              : 0,
          };
          setProgress(progress);
          onProgress?.(progress);
          axiosOptions.onUploadProgress?.(progressEvent);
        },
      });
      // A response held past an abort (e.g. by an interceptor) is a cancel.
      if (abortController.signal.aborted) {
        onCancel?.();
        return;
      }
      if (
        abortControllerRef.current === abortController &&
        mountedRef.current
      ) {
        setErrors({});
        setWasSuccessful(true);
        setRecentlySuccessful(true);
        clearTimeout(recentlySuccessfulTimeoutRef.current);
        recentlySuccessfulTimeoutRef.current = setTimeout(
          () => setRecentlySuccessful(false),
          2000,
        );
      }
      onSuccess?.(response.data, response);
      return response.data;
    } catch (error: unknown) {
      if (axios.isCancel(error)) {
        onCancel?.();
        return;
      } else if (axios.isAxiosError(error)) {
        if (error.response?.status === 422 && error.response.data?.errors) {
          const errors = transformErrors(error.response?.data?.errors);
          const message = error.response.data.message;
          setErrors(errors);

          if (typeof onValidationError === 'function') {
            const validationMessage = Object.values(errors)[0];
            if (typeof validationMessage === 'string') {
              onValidationError(validationMessage, { message, errors });
              return;
            }
          }

          onError?.({
            errors,
            requestError: error,
            message,
          });
          return;
        }
        setErrors({});
        if (error.response) {
          onHttpException?.(error.response);
        } else {
          onNetworkError?.(error);
        }
        onError?.({
          requestError: error,
        });
        return;
      }

      onError?.();
    } finally {
      if (abortControllerRef.current === abortController) {
        setProcessing(false);
        setProgress(null);
      }
      onFinish?.();
    }
  };

  return {
    data,
    isDirty,
    errors,
    hasErrors,
    processing,
    progress,
    wasSuccessful,
    recentlySuccessful,
    setData,
    transform: (callback) => {
      transformRef.current = callback;
    },
    setDefaults,
    reset,
    clearErrors,
    resetAndClearErrors,
    setError,
    get: (url, options) => sendRequest('get', url, options),
    patch: (url, options) => sendRequest('patch', url, options),
    post: (url, options) => sendRequest('post', url, options),
    put: (url, options) => sendRequest('put', url, options),
    delete: (url, options) => sendRequest('delete', url, options),
    cancel: () => abortControllerRef.current?.abort(),
  };
}
