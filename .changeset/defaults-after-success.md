---
'@insoutt/punku': minor
---

`useForm(initialData, { setDefaultsOnSuccess: true })` makes the form data the new defaults after a successful request, so `isDirty` becomes `false` and a later `reset()` restores the saved values. Off by default: without the option, behavior is unchanged. It works alongside `allErrors`.

- The new defaults are the form data right after `onSuccess` returns, including changes `onSuccess` made with `setData` or `reset`. An edit made while the request was in flight becomes part of the defaults too, so `isDirty` is `false` even though that edit was never sent.
- To choose other defaults, call `setDefaults(...)` in `onSuccess`: the update is then skipped.
- Only the synchronous part of an async `onSuccess` counts: a `reset()` after an `await` resets to the new defaults, so call `reset()` before the first `await`.
- Failed, cancelled and aborted requests, requests that finish after the component unmounted, and an `onSuccess` that throws leave the defaults unchanged.
- The option is read once at mount; changing it later has no effect.
