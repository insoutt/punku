# @insoutt/chawpi

## 1.2.0

### Minor Changes

- 5fa8fa5: Fix several `useForm` bugs and align behavior with the Inertia.js form helper.

  - Nested objects and arrays are now serialized into `FormData` (`user[name]`, `user[tags][0]`); previously they were dropped. `FileList` values are appended as `key[0]`, `key[1]`, ...
  - Data containing a `File`, `Blob` or `FileList` (at any depth) is sent as `FormData` automatically, without `withFormData`.
  - `put`, `patch` and `delete` requests sent as `FormData` are sent as `POST` with a `_method` field, so Laravel can read multipart bodies.
  - Only the latest request clears `processing`: a request aborted because a newer one started no longer resets `processing`/`progress` while the newer one is running.
  - punku-only options (`withFormData`, `onStart`, `onFinish`, `onSuccess`, `onError`, `onValidationError`, `onCancel`) are no longer passed to axios. Caller `headers` are merged with the default `Accept`/`X-Punku` headers, the computed `method`, `url`, `data`, `params` and `signal` can no longer be overridden, and a caller `onUploadProgress` is called alongside the internal progress tracking.
  - `progress` is a new object with `percentage` (the axios event is no longer mutated and the global `AxiosProgressEvent` augmentation is removed), is reset to `null` when the request finishes, and no longer logs to the console. `wasSuccessful`/`recentlySuccessful` reset when a request starts, and the `recentlySuccessful` timer is re-armed on each success and cleared on unmount.
  - `setError(errors)` accepts a partial errors object.
  - `react` is now a peer dependency, and the `FormProps`, `RequestConfig`, `Progress`, `FormDataConvertible` and `FormDataType` types are exported.

  Behavior changes:

  - `transform(callback)` no longer changes `data`. The callback is stored and applied to the payload when the request is sent.
  - `setDefaults()` now makes the current data the new defaults (it used to reset data to the initial values). `setDefaults(field, value)` and `setDefaults({ ... })` now update the defaults without changing `data`. `reset()` restores from these defaults, and `isDirty` compares against them instead of the `initialData` argument.

## 1.1.0

### Minor Changes

- 177759c: Implement uploads

## 1.0.2

### Patch Changes

- b418d36: - Add headers
  - Add onCancel event
  - Update Readme.md

## 1.0.1

### Patch Changes

- 0d67bc9: Update docs

## 1.1.0

### Minor Changes

- 3ada199: Initial Release
