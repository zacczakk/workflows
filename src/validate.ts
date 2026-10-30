import type { Config, CalendarSchedule, IntervalSchedule, Service, TimeSpec } from "./types";

class ConfigError extends Error {
  constructor(path: string, msg: string) {
    super(`config ${path}: ${msg}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalStrings(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string" && item.length > 0)) {
    throw new ConfigError(path, "must be an array of non-empty strings");
  }
  return value;
}

function requireString(obj: Record<string, unknown>, key: string, path: string): string {
  const val = obj[key];
  if (typeof val !== "string" || val.length === 0) {
    throw new ConfigError(path, `'${key}' must be a non-empty string`);
  }
  return val;
}

function requireBool(obj: Record<string, unknown>, key: string, path: string): boolean {
  const val = obj[key];
  if (typeof val !== "boolean") {
    throw new ConfigError(path, `'${key}' must be a boolean`);
  }
  return val;
}

function validateTimeSpec(raw: unknown, path: string): TimeSpec {
  if (!isRecord(raw)) {
    throw new ConfigError(path, "must be an object with hour and minute");
  }
  const s = raw;

  const hour = s.hour;
  if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new ConfigError(path, "'hour' must be an integer 0-23");
  }

  const minute = s.minute;
  if (typeof minute !== "number" || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new ConfigError(path, "'minute' must be an integer 0-59");
  }

  return { hour, minute };
}

export function validateConfig(parsed: unknown): Config {
  if (!isRecord(parsed)) {
    throw new ConfigError("", "config must be an object");
  }
  const root = parsed;

  // ── Meta ────────────────────────────────────────────────────────
  if (!isRecord(root.meta)) {
    throw new ConfigError("meta", "missing or invalid");
  }
  const metaRaw = root.meta;
  const defaultTimeout = metaRaw.default_timeout;
  if (defaultTimeout !== undefined) {
    if (typeof defaultTimeout !== "number" || !Number.isInteger(defaultTimeout) || defaultTimeout < 1) {
      throw new ConfigError("meta", "'default_timeout' must be a positive integer (seconds)");
    }
  }

  const networkHost = metaRaw.network_host ?? "api.github.com";
  if (typeof networkHost !== "string" || networkHost === "") {
    throw new ConfigError("meta", "'network_host' must be a non-empty string");
  }
  const networkWait = metaRaw.network_wait ?? 600;
  if (typeof networkWait !== "number" || !Number.isInteger(networkWait) || networkWait < 0) {
    throw new ConfigError("meta", "'network_wait' must be a non-negative integer (seconds)");
  }

  const meta = {
    label_prefix: requireString(metaRaw, "label_prefix", "meta"),
    log_dir: requireString(metaRaw, "log_dir", "meta"),
    plist_dir: requireString(metaRaw, "plist_dir", "meta"),
    state_dir: requireString(metaRaw, "state_dir", "meta"),
    default_timeout: typeof defaultTimeout === "number" ? defaultTimeout : undefined,
    network_host: networkHost,
    network_wait: networkWait,
  };

  // ── Workflows ───────────────────────────────────────────────────
  if (!isRecord(root.workflows)) {
    throw new ConfigError("workflows", "missing or invalid");
  }
  const wfsRaw = root.workflows;
  const workflows: Config["workflows"] = {};

  for (const [name, raw] of Object.entries(wfsRaw)) {
    if (!isRecord(raw)) {
      throw new ConfigError(`workflows.${name}`, "must be an object");
    }
    const w = raw;
    const path = `workflows.${name}`;

    const type = requireString(w, "type", path);
    if (type !== "agent" && type !== "script") {
      throw new ConfigError(path, `'type' must be 'agent' or 'script', got '${type}'`);
    }

    if (type === "agent") {
      requireString(w, "prompt", path);
      if (w.script !== undefined) {
        throw new ConfigError(path, "agent-type workflow must not have 'script' field");
      }
    } else {
      requireString(w, "script", path);
      if (w.prompt !== undefined) {
        throw new ConfigError(path, "script-type workflow must not have 'prompt' field");
      }
      if (w.model !== undefined) {
        throw new ConfigError(path, "script-type workflow must not have 'model' field");
      }
    }

    let model: string | undefined;
    if (w.model !== undefined) {
      if (typeof w.model !== "string" || w.model.length === 0) {
        throw new ConfigError(path, "'model' must be a non-empty string (provider/model)");
      }
      model = w.model;
    }

    const description = requireString(w, "description", path);

    let timeout: number | undefined;
    if (w.timeout !== undefined) {
      if (typeof w.timeout !== "number" || !Number.isInteger(w.timeout) || w.timeout < 1) {
        throw new ConfigError(path, "'timeout' must be a positive integer (seconds)");
      }
      timeout = w.timeout;
    }

    let cadence_days: number | undefined;
    if (w.cadence_days !== undefined) {
      if (typeof w.cadence_days !== "number" || !Number.isInteger(w.cadence_days) || w.cadence_days < 1) {
        throw new ConfigError(path, "'cadence_days' must be a positive integer");
      }
      cadence_days = w.cadence_days;
    }

    workflows[name] = {
      type,
      prompt: type === "agent" ? requireString(w, "prompt", path) : undefined,
      script: type === "script" ? requireString(w, "script", path) : undefined,
      model,
      description,
      timeout,
      cadence_days,
      depends_on: optionalStrings(w.depends_on, `${path}.depends_on`),
      outputs: optionalStrings(w.outputs, `${path}.outputs`),
    };
  }
  for (const [name, workflow] of Object.entries(workflows)) {
    for (const dependency of workflow.depends_on ?? []) {
      if (!workflows[dependency] || dependency === name) throw new ConfigError(`workflows.${name}`, `invalid dependency ${dependency}`);
    }
  }

  // ── Schedules ──────────────────────────────────────────────────
  if (!isRecord(root.schedules)) {
    throw new ConfigError("schedules", "missing or invalid");
  }
  const schedRaw = root.schedules;
  const schedules: Config["schedules"] = {};

  for (const [name, raw] of Object.entries(schedRaw)) {
    if (!isRecord(raw)) {
      throw new ConfigError(`schedules.${name}`, "must be an object");
    }
    const s = raw;
    const path = `schedules.${name}`;

    const hasTime = s.time !== undefined;
    const hasInterval = s.interval !== undefined;

    if (hasTime && hasInterval) {
      throw new ConfigError(path, "cannot have both 'time' and 'interval'");
    }
    if (!hasTime && !hasInterval) {
      throw new ConfigError(path, "must have either 'time' (calendar) or 'interval' (seconds)");
    }

    const enabled = requireBool(s, "enabled", path);
    const prevent_sleep = s.prevent_sleep === undefined ? false : requireBool(s, "prevent_sleep", path);

    if (!Array.isArray(s.workflows) || s.workflows.length === 0) {
      throw new ConfigError(path, "'workflows' must be a non-empty array of workflow names");
    }
    const wfNames: string[] = [];
    for (const ref of s.workflows) {
      if (typeof ref !== "string" || ref.length === 0) {
        throw new ConfigError(path, "'workflows' entries must be non-empty strings");
      }
      if (!workflows[ref]) {
        throw new ConfigError(path, `references unknown workflow '${ref}'`);
      }
      wfNames.push(ref);
    }
    for (const [index, name] of wfNames.entries()) {
      for (const dependency of workflows[name].depends_on ?? []) {
        if (!wfNames.slice(0, index).includes(dependency)) {
          throw new ConfigError(path, `${name} depends on ${dependency}, which must precede it in the schedule`);
        }
      }
    }

    if (hasInterval) {
      const interval = s.interval;
      if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 60) {
        throw new ConfigError(path, "'interval' must be an integer >= 60 (seconds)");
      }
      if (s.watchdog !== undefined) {
        throw new ConfigError(path, "interval schedules do not support 'watchdog'");
      }
      if (prevent_sleep) throw new ConfigError(path, "interval schedules cannot own sleep");
      schedules[name] = { kind: "interval", interval, enabled, workflows: wfNames, prevent_sleep } satisfies IntervalSchedule;
    } else {
      const time = validateTimeSpec(s.time, `${path}.time`);
      let watchdog: TimeSpec | undefined;
      if (s.watchdog !== undefined) {
        if (!prevent_sleep) throw new ConfigError(path, "watchdog requires prevent_sleep = true");
        watchdog = validateTimeSpec(s.watchdog, `${path}.watchdog`);
        const budget = wfNames.reduce((total, name) => total + (workflows[name].timeout ?? meta.default_timeout ?? 3600), 0);
        const delay = ((watchdog.hour * 60 + watchdog.minute - time.hour * 60 - time.minute + 1440) % 1440) * 60;
        if (delay < budget + 900) throw new ConfigError(path, "watchdog must follow the timeout budget plus 15 minutes");
      }
      schedules[name] = { kind: "calendar", time, watchdog, enabled, workflows: wfNames, prevent_sleep } satisfies CalendarSchedule;
    }
  }
  if (Object.values(schedules).filter((schedule) => schedule.enabled && schedule.prevent_sleep).length > 1) {
    throw new ConfigError("schedules", "only one enabled schedule may own sleep");
  }

  // ── Services (optional) ──────────────────────────────────────────
  const services: Config["services"] = {};
  const svcRaw = root.services;

  if (isRecord(svcRaw)) {
    for (const [name, raw] of Object.entries(svcRaw)) {
      if (!isRecord(raw)) {
        throw new ConfigError(`services.${name}`, "must be an object");
      }
      const s = raw;
      const path = `services.${name}`;

      const command = requireString(s, "command", path);
      const description = requireString(s, "description", path);
      const enabled = requireBool(s, "enabled", path);

      services[name] = { command, description, enabled } satisfies Service;
    }
  }

  return { meta, workflows, schedules, services };
}
