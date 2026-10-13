import { describe, expect, it, vi } from 'vitest';
import { hasFiles, objectToFormData } from './formData.js';

const fakeFileList = (...files: File[]) =>
  Object.create(FileList.prototype, {
    length: { value: files.length },
    [Symbol.iterator]: { value: () => files[Symbol.iterator]() },
    ...Object.fromEntries(files.map((file, i) => [i, { value: file }])),
  }) as FileList;

describe('objectToFormData', () => {
  it('serializes nested objects and arrays with bracket keys', () => {
    const form = objectToFormData({ user: { name: 'a', tags: ['x'] } });

    expect([...form.entries()]).toEqual([
      ['user[name]', 'a'],
      ['user[tags][0]', 'x'],
    ]);
  });

  it('appends each file of a FileList as key[i]', () => {
    const a = new File(['a'], 'a.txt');
    const b = new File(['b'], 'b.txt');

    const form = objectToFormData({ docs: fakeFileList(a, b) });

    expect(form.get('docs[0]')).toBeInstanceOf(File);
    expect((form.get('docs[0]') as File).name).toBe('a.txt');
    expect((form.get('docs[1]') as File).name).toBe('b.txt');
  });
});

describe('hasFiles', () => {
  it('finds files, blobs and file lists nested in objects and arrays', () => {
    const file = new File(['a'], 'a.txt');

    expect(hasFiles({ name: 'a', tags: ['x'], at: new Date() })).toBe(false);
    expect(hasFiles({ a: { b: [file] } })).toBe(true);
    expect(hasFiles({ a: [new Blob(['x'])] })).toBe(true);
    expect(hasFiles({ a: fakeFileList(file) })).toBe(true);
    expect(hasFiles({ a: fakeFileList() })).toBe(false);
  });

  it('works where File and FileList are not defined (React Native)', () => {
    vi.stubGlobal('File', undefined);
    vi.stubGlobal('FileList', undefined);
    try {
      expect(hasFiles({ name: 'a', tags: ['x'] })).toBe(false);
      expect(hasFiles({ a: new Blob(['x']) })).toBe(true);
      expect([...objectToFormData({ name: 'a' }).entries()]).toEqual([
        ['name', 'a'],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
