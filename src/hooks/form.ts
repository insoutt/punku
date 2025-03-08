import { useState, useRef } from 'react';
import axios, {
  type AxiosRequestConfig,
  type AxiosProgressEvent,
  type AxiosError,
} from 'axios';

export interface DataResponse<T> {
  data: T;
}

export interface RequestConfig<T, TForm extends FormDataType>
  extends AxiosRequestConfig {
  onStart?: () => void;
  onFinish?: () => void;
  onSuccess?: (data: T) => void;
  onError?: (error?: {
    errors?: Partial<Record<keyof TForm, string>>;
    error: AxiosError;
  }) => void;
}

export type Progress = AxiosProgressEvent;
type FormDataType = object;

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
  setError(field: keyof TForm, value: string): void;
  setError(errors: Record<keyof TForm, string>): void;
  get: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<void>;
  patch: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<void>;
  post: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<void>;
  put: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<void>;
  delete: <TRequest>(
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => Promise<void>;
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

export function useForm<TForm extends FormDataType>(
  initialData?: TForm,
): FormProps<TForm> {
  const [data, setDataState] = useState<TForm>(initialData || ({} as TForm));
  const [errors, setErrors] = useState<Partial<Record<keyof TForm, string>>>(
    {},
  );
  const [processing, setProcessing] = useState<boolean>(false);
  const [wasSuccessful, setWasSuccessful] = useState<boolean>(false);
  const [recentlySuccessful, setRecentlySuccessful] = useState<boolean>(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isDirty = JSON.stringify(data) !== JSON.stringify(initialData || {});
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

  const setData: FormProps<TForm>['setData'] = (
    keyOrData: any,
    value?: TForm[keyof TForm],
  ) => {
    if (typeof keyOrData === 'function') {
      setDataState((prev) => keyOrData(prev));
    } else if (typeof keyOrData === 'object') {
      setDataState(keyOrData);
    } else {
      setDataState((prev) => ({ ...prev, [keyOrData]: value }));
    }
  };

  const setDefaults = (
    fieldOrFields?: keyof TForm | Partial<TForm>,
    value?: FormDataConvertible,
  ) => {
    if (typeof fieldOrFields === 'object') {
      setDataState((prev) => ({ ...prev, ...fieldOrFields }));
    } else if (typeof fieldOrFields !== 'undefined') {
      setData(fieldOrFields as keyof TForm, value as TForm[keyof TForm]);
    } else {
      setDataState(initialData || ({} as TForm));
    }
  };

  const reset = (...fields: (keyof TForm)[]) => {
    if (fields.length === 0) {
      setDataState(initialData || ({} as TForm));
    } else {
      setDataState((prev) => {
        const newState = { ...prev };
        fields.forEach((field) => {
          newState[field] = initialData
            ? initialData[field]
            : (undefined as TForm[keyof TForm]);
        });
        return newState;
      });
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

  const setError = (
    fieldOrErrors: keyof TForm | Record<keyof TForm, string>,
    value?: string,
  ) => {
    if (typeof fieldOrErrors === 'object') {
      setErrors(fieldOrErrors);
    } else {
      setErrors((prev) => ({ ...prev, [fieldOrErrors]: value }));
    }
  };

  const sendRequest = async <TRequest>(
    method: 'get' | 'patch' | 'post' | 'put' | 'delete',
    url: string,
    options?: RequestConfig<TRequest, TForm>,
  ) => {
    setProcessing(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    options?.onStart?.();

    try {
      const response = await axios({
        method,
        url,
        data,
        signal: abortControllerRef.current.signal,
        onUploadProgress: (event) => setProgress(event),
        ...options,
      });
      setErrors({});
      setWasSuccessful(true);
      setRecentlySuccessful(true);
      setTimeout(() => setRecentlySuccessful(false), 2000);
      options?.onSuccess?.(response.data);
    } catch (error: unknown) {
      if (axios.isCancel(error)) {
        console.log('Request was canceled', error.message);
      } else if (axios.isAxiosError(error)) {
        if (error.response?.data?.errors) {
          const errors = transformErrors(error.response?.data?.errors);
          setErrors(errors);
          options?.onError?.({
            errors,
            error,
          });
          return;
        }
        setErrors({});
        options?.onError?.({
          error,
        });
        return;
      }

      console.error('Unexpected error:', error);
      options?.onError?.();
    } finally {
      setProcessing(false);
      options?.onFinish?.();
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
    transform: (callback) => setDataState(callback(data) as TForm),
    setDefaults,
    reset,
    clearErrors,
    setError,
    get: (url, options) => sendRequest('get', url, options),
    patch: (url, options) => sendRequest('patch', url, options),
    post: (url, options) => sendRequest('post', url, options),
    put: (url, options) => sendRequest('put', url, options),
    delete: (url, options) => sendRequest('delete', url, options),
    cancel: () => abortControllerRef.current?.abort(),
  };
}
