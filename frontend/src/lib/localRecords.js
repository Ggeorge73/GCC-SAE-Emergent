import { useCallback, useEffect, useRef, useState } from "react";

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function matchesShape(value, sample) {
  if (Array.isArray(sample))
    return (
      Array.isArray(value) &&
      value.every((v) =>
        sample.length
          ? matchesShape(v, sample[0])
          : object(v) && typeof v.id === "string",
      )
    );
  if (object(sample))
    return (
      object(value) &&
      Object.entries(sample).every(([k, v]) => matchesShape(value[k], v))
    );
  return typeof value === typeof sample;
}
export function validateFeature(key, value, sample) {
  if (!matchesShape(value, sample)) return false;
  if (Array.isArray(value) && value.some((v) => object(v) && "id" in v)) {
    if (new Set(value.map((v) => v.id)).size !== value.length) return false;
  }
  if (key === "calendar")
    return value.every(
      (v) =>
        validDate(v.date) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) &&
        v.title.trim(),
    );
  if (key.startsWith("intake-"))
    return Object.values(value).every((v) => typeof v === "string");
  if (key === "proposals")
    return value.every(
      (v) =>
        [
          "id",
          "name",
          "practice",
          "lead",
          "scope",
          "materials",
          "fee",
          "status",
        ].every((k) => typeof v[k] === "string") &&
        Number.isFinite(Number(v.fee)) &&
        Number(v.fee) >= 0,
    );
  if (key === "project-checklist")
    return Object.values(value).every((v) => typeof v === "boolean");
  return true;
}

// Three-way merge retains independent records. Legal matter records are atomic:
// merging a decision with another editor's source revision could resurrect approval.
export function mergeRecords(base, next, saved, path = "") {
  if (equal(base, next)) return saved;
  if (equal(base, saved) || equal(next, saved)) return next;
  if (/^matters\/[^/]+$/.test(path))
    throw new Error(`Competing edits to ${path}`);
  if (
    [base, next, saved].every(Array.isArray) &&
    [...base, ...next, ...saved].every(
      (v) => object(v) && typeof v.id === "string",
    )
  ) {
    const map = (a) => Object.fromEntries(a.map((v) => [v.id, v]));
    return Object.values(mergeRecords(map(base), map(next), map(saved), path));
  }
  if ([base, next, saved].every(object)) {
    const result = Object.create(null);
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(next),
      ...Object.keys(saved),
    ])) {
      const merged = mergeRecords(
        base[key],
        next[key],
        saved[key],
        path ? `${path}/${key}` : key,
      );
      if (merged !== undefined) result[key] = merged;
    }
    return result;
  }
  throw new Error(`Competing edits to ${path || "record"}`);
}

// Persist the small edit intent synchronously before waiting for the cross-tab
// lock. A refresh cannot cancel the last save while its lock is still queued.
export function editProjection(base, next, path = "") {
  if (/^matters\/[^/]+$/.test(path)) return [base, next];
  if (
    [base, next].every(Array.isArray) &&
    [...base, ...next].every((r) => object(r) && typeof r.id === "string")
  ) {
    const ids = new Set([...base, ...next].map((r) => r.id));
    const changed = [...ids].filter(
      (id) =>
        !equal(
          base.find((r) => r.id === id),
          next.find((r) => r.id === id),
        ),
    );
    return [
      base.filter((r) => changed.includes(r.id)),
      next.filter((r) => changed.includes(r.id)),
    ];
  }
  if ([base, next].every(object)) {
    const before = {},
      after = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
      if (equal(base[key], next[key])) continue;
      const [b, n] = editProjection(
        base[key],
        next[key],
        path ? `${path}/${key}` : key,
      );
      if (b !== undefined) before[key] = b;
      if (n !== undefined) after[key] = n;
    }
    return [before, after];
  }
  return [base, next];
}
export function replayPending(storageKey, saved, validate = () => true) {
  const entries = Object.keys(localStorage)
    .filter((key) => key.startsWith(`${storageKey}-pending-`))
    .map((key) => {
      try {
        return { ...JSON.parse(localStorage.getItem(key)), key };
      } catch {
        return { key, invalid: true };
      }
    })
    .sort((a, b) => a.at - b.at);
  const applied = [],
    conflicts = [];
  for (const entry of entries) {
    try {
      if (entry.invalid || entry.schema !== 1)
        throw new Error("Invalid pending edit");
      const next = mergeRecords(entry.before, entry.after, saved);
      if (!validate(next)) throw new Error("Invalid pending record");
      saved = next;
      applied.push(entry.key);
    } catch {
      conflicts.push(entry.key);
    }
  }
  return { saved, applied, conflicts };
}

// localStorage is not read-after-write consistent across tabs: Chromium keeps a
// per-process copy, so a tab can take the save lock before another tab's last
// write has reached it, and would merge against stale data. Each commit also
// records its revision in IndexedDB, which is consistent across tabs, and a
// writer waits until its localStorage view has caught up before merging.
const REVISION_DB = "law-suite-revisions";
const SYNC_WAIT_MS = 3000;

function revisionStore(mode, operate) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return resolve(undefined);
    const open = indexedDB.open(REVISION_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("revisions");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("revisions", mode);
      const request = operate(tx.objectStore("revisions"));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

function localRevision(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(`${storageKey}-metadata`))?.revision;
  } catch {
    return undefined;
  }
}

// Resolves once this tab sees the latest committed revision. Rejects with a
// competing-edit error if it still sees an older revision after the wait, so the
// caller preserves its edit for recovery instead of overwriting newer work.
export async function awaitLatestRevision(storageKey) {
  let expected;
  try {
    expected = await revisionStore("readonly", (s) => s.get(storageKey));
  } catch {
    return; // No IndexedDB: fall back to the lock alone.
  }
  if (expected === undefined) return;
  const deadline = Date.now() + SYNC_WAIT_MS;
  while (localRevision(storageKey) !== expected) {
    // Missing metadata means storage was cleared outside the app; nothing to protect.
    if (localRevision(storageKey) === undefined && Date.now() > deadline) return;
    if (Date.now() > deadline)
      throw new Error(`Competing edits to ${storageKey}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// Writes the canonical record with a fresh revision and waits until the revision
// is durable in IndexedDB, so the lock is released only after it is visible.
export async function publishRecord(storageKey, value) {
  const revision = crypto.randomUUID();
  localStorage.setItem(storageKey, JSON.stringify(value));
  localStorage.setItem(
    `${storageKey}-metadata`,
    JSON.stringify({ schema: 1, revision, savedAt: new Date().toISOString() }),
  );
  try {
    await revisionStore("readwrite", (s) => s.put(revision, storageKey));
  } catch {
    /* Without IndexedDB the lock alone orders writes. */
  }
}

export function useRecords(storageKey, initial, validator) {
  const config = useRef({ initial, validator });
  config.current = { initial, validator };
  const [error, setError] = useState("");
  const recovery = useRef(null);
  const preservedRecovery = useRef(null);
  const read = useCallback(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return config.current.initial;
    try {
      let parsed = JSON.parse(raw);
      if (
        storageKey === "law-suite-vision-service" &&
        object(parsed) &&
        !parsed.id
      )
        parsed = { ...config.current.initial, ...parsed };
      if (
        Array.isArray(parsed) &&
        Array.isArray(config.current.initial) &&
        !config.current.validator(parsed)
      ) {
        recovery.current = raw;
        return parsed.filter(
          (item, index) =>
            config.current.validator([item]) &&
            parsed.findIndex((other) => other?.id === item?.id) === index,
        );
      }
      if (!config.current.validator(parsed))
        throw new Error("Incompatible saved data");
      return parsed;
    } catch {
      recovery.current = raw;
      return config.current.initial;
    }
  }, [storageKey]);
  const [value, setValue] = useState(() => {
    try {
      return replayPending(storageKey, read(), config.current.validator).saved;
    } catch {
      return initial;
    }
  });
  const current = useRef(value);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  useEffect(() => {
    // Recover intents left by a page that closed before its save lock ran.
    if (navigator.locks)
      queue.current = navigator.locks.request(storageKey, async () => {
        try {
          await awaitLatestRevision(storageKey);
          const result = replayPending(
            storageKey,
            read(),
            config.current.validator,
          );
          if (
            result.applied.length ||
            localStorage.getItem(storageKey) === null
          ) {
            await publishRecord(storageKey, result.saved);
            result.applied.forEach((key) => localStorage.removeItem(key));
          }
          if (result.conflicts.length) {
            recovery.current = JSON.stringify(
              result.conflicts.map((key) => localStorage.getItem(key)),
            );
            setError(
              "Competing or invalid pending edits were preserved. Download the recovery copy before reconciling.",
            );
          }
        } catch {
          /* Read-only opening remains possible when storage is denied. */
        }
      });
    if (recovery.current !== null)
      setError(
        "Saved data has an incompatible schema. A recovery copy is available; unrelated records are unchanged.",
      );
    const sync = (event) => {
      if (event.key !== storageKey || pending.current) return;
      try {
        const saved = read();
        // The selected matter and preview actor belong to this tab's navigation.
        const next =
          storageKey === "law-suite-workspace-v2"
            ? {
                ...saved,
                selectedId: current.current.selectedId,
                actor: current.current.actor,
              }
            : saved;
        current.current = next;
        setValue(next);
      } catch {
        setError(
          "Browser storage unavailable. Changes last for this session only.",
        );
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener("law-suite-records", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("law-suite-records", sync);
    };
    // Each hook instance is mounted with one stable storage key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const update = useCallback(
    (action) => {
      const base = current.current;
      const next = typeof action === "function" ? action(base) : action;
      if (!config.current.validator(next)) {
        setError("Invalid record. Check the fields before saving.");
        return;
      }
      current.current = next;
      setValue(next);
      const intentKey = `${storageKey}-pending-${crypto.randomUUID()}`;
      try {
        const [before, after] = editProjection(base, next);
        localStorage.setItem(
          intentKey,
          JSON.stringify({
            schema: 1,
            at: performance.timeOrigin + performance.now(),
            before,
            after,
          }),
        );
      } catch {
        setError(
          "Browser storage unavailable. Changes last for this session only.",
        );
      }
      pending.current += 1;
      const commit = async () => {
        try {
          // Another mounted consumer may already have recovered this intent.
          // Do not replay an older edit over a later recovered version.
          if (localStorage.getItem(intentKey) === null) return;
          await awaitLatestRevision(storageKey);
          if (localStorage.getItem(intentKey) === null) return;
          let saved = read();
          if (
            recovery.current !== null &&
            preservedRecovery.current !== recovery.current
          ) {
            localStorage.setItem(
              `${storageKey}-recovery-${crypto.randomUUID()}`,
              recovery.current,
            );
            preservedRecovery.current = recovery.current;
          }
          if (storageKey === "law-suite-workspace-v2")
            saved = {
              ...saved,
              selectedId: base.selectedId,
              actor: base.actor,
            };
          const merged = mergeRecords(base, next, saved);
          await publishRecord(storageKey, merged);
          localStorage.removeItem(intentKey);
          if (pending.current === 1) {
            current.current = merged;
            setValue(merged);
          }
          window.dispatchEvent(
            Object.assign(new Event("law-suite-records"), { key: storageKey }),
          );
        } catch (failure) {
          if (failure.message.startsWith("Competing edits")) {
            recovery.current = JSON.stringify(next);
            try {
              localStorage.setItem(
                `${storageKey}-recovery-${crypto.randomUUID()}`,
                recovery.current,
              );
              localStorage.removeItem(intentKey);
            } catch {
              /* download remains available */
            }
            setError(
              `${failure.message}. Newer saved work was kept. Download your recovery copy before reconciling.`,
            );
          } else
            setError(
              "Browser storage unavailable. Changes last for this session only.",
            );
        } finally {
          pending.current -= 1;
        }
      };
      // Web Locks serialize canonical writes. Without it, the recoverable intent
      // remains available but the canonical record is not overwritten unsafely.
      if (!navigator.locks) {
        pending.current -= 1;
        setError(
          "This browser cannot safely coordinate saves. Changes last for this session only; export before leaving.",
        );
        return;
      }
      queue.current = queue.current.then(() =>
        navigator.locks.request(storageKey, commit),
      );
    },
    [storageKey, read],
  );
  const downloadRecovery = () => {
    const blob = new Blob(
      [recovery.current ?? JSON.stringify(current.current)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "law-suite-recovery.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return [value, update, error, downloadRecovery];
}
