import type { Config, CalendarSchedule, IntervalSchedule, TimeSpec } from "./types";

class ConfigError extends Error {
  constructor(path: string, msg: string) {
    super(`config ${path}: ${msg}`);
  }
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
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError(path, "must be an object with hour and minute");
  }
  const s = raw as Record<string, unknown>;

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
  if (typeof parsed !== "object" || parsed === null) {
    throw new ConfigError("", "config must be an object");
  }
  const root = parsed as Record<string, unknown>;

  // ── Meta ────────────────────────────────────────────────────────
  if (typeof root.meta !== "object" || root.meta === null) {
    throw new ConfigError("meta", "missing or invalid");
  }
  const metaRaw = root.meta as Record<string, unknown>;
  const defaultTimeout = metaRaw.default_timeout;
  if (defaultTimeout !== undefined) {
    if (typeof defaultTimeout !== "number" || !Number.isInteger(defaultTimeout) || defaultTimeout < 1) {
      throw new ConfigError("meta", "'default_timeout' must be a positive integer (seconds)");
    }
  }

  const meta = {
    label_prefix: requireString(metaRaw, "label_prefix", "meta"),
    log_dir: requireString(metaRaw, "log_dir", "meta"),
    plist_dir: requireString(metaRaw, "plist_dir", "meta"),
    state_dir: requireString(metaRaw, "state_dir", "meta"),
    default_timeout: defaultTimeout as number | undefined,
  };

  // ── Workflows ───────────────────────────────────────────────────
  if (typeof root.workflows !== "object" || root.workflows === null) {
    throw new ConfigError("workflows", "missing or invalid");
  }
  const wfsRaw = root.workflows as Record<string, unknown>;
  const workflows: Config["workflows"] = {};

  for (const [name, raw] of Object.entries(wfsRaw)) {
    if (typeof raw !== "object" || raw === null) {
      throw new ConfigError(`workflows.${name}`, "must be an object");
    }
    const w = raw as Record<string, unknown>;
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
      type: type as "agent" | "script",
      prompt: type === "agent" ? (w.prompt as string) : undefined,
      script: type === "script" ? (w.script as string) : undefined,
      model,
      description,
      timeout,
      cadence_days,
    };
  }

  // ── Schedules ──────────────────────────────────────────────────
  if (typeof root.schedules !== "object" || root.schedules === null) {
    throw new ConfigError("schedules", "missing or invalid");
  }
  const schedRaw = root.schedules as Record<string, unknown>;
  const schedules: Config["schedules"] = {};

  for (const [name, raw] of Object.entries(schedRaw)) {
    if (typeof raw !== "object" || raw === null) {
      throw new ConfigError(`schedules.${name}`, "must be an object");
    }
    const s = raw as Record<string, unknown>;
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

    if (hasInterval) {
      const interval = s.interval;
      if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 60) {
        throw new ConfigError(path, "'interval' must be an integer >= 60 (seconds)");
      }
      if (s.watchdog !== undefined) {
        throw new ConfigError(path, "interval schedules do not support 'watchdog'");
      }
      schedules[name] = { kind: "interval", interval, enabled, workflows: wfNames } satisfies IntervalSchedule;
    } else {
      const time = validateTimeSpec(s.time, `${path}.time`);
      let watchdog: TimeSpec | undefined;
      if (s.watchdog !== undefined) {
        watchdog = validateTimeSpec(s.watchdog, `${path}.watchdog`);
      }
      schedules[name] = { kind: "calendar", time, watchdog, enabled, workflows: wfNames } satisfies CalendarSchedule;
    }
  }

  return { meta, workflows, schedules };
}
