import type { Config } from "./types";

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

function intInRange(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  path: string,
): number | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== "number" || !Number.isInteger(val) || val < min || val > max) {
    throw new ConfigError(path, `'${key}' must be an integer ${min}-${max}`);
  }
  return val;
}

function validateSchedule(raw: unknown, path: string) {
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError(path, "schedule must be an object");
  }
  const s = raw as Record<string, unknown>;
  const hour = intInRange(s, "Hour", 0, 23, path);
  const minute = intInRange(s, "Minute", 0, 59, path);
  const month = intInRange(s, "Month", 1, 12, path);
  const day = intInRange(s, "Day", 1, 31, path);

  let weekday: number | number[] | undefined;
  if (s.Weekday !== undefined) {
    if (typeof s.Weekday === "number") {
      if (!Number.isInteger(s.Weekday) || s.Weekday < 0 || s.Weekday > 6) {
        throw new ConfigError(path, "'Weekday' must be 0-6");
      }
      weekday = s.Weekday;
    } else if (Array.isArray(s.Weekday)) {
      for (const d of s.Weekday) {
        if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) {
          throw new ConfigError(path, "'Weekday' array values must be integers 0-6");
        }
      }
      weekday = s.Weekday as number[];
    } else {
      throw new ConfigError(path, "'Weekday' must be a number or array of numbers");
    }
  }

  return { Hour: hour, Minute: minute, Month: month, Day: day, Weekday: weekday };
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
    }

    const description = requireString(w, "description", path);
    const enabled = requireBool(w, "enabled", path);

    let timeout: number | undefined;
    if (w.timeout !== undefined) {
      if (typeof w.timeout !== "number" || !Number.isInteger(w.timeout) || w.timeout < 1) {
        throw new ConfigError(path, "'timeout' must be a positive integer (seconds)");
      }
      timeout = w.timeout;
    }

    if (w.schedule === undefined) {
      throw new ConfigError(path, "missing 'schedule'");
    }
    const schedule = validateSchedule(w.schedule, `${path}.schedule`);

    workflows[name] = {
      type: type as "agent" | "script",
      prompt: type === "agent" ? (w.prompt as string) : undefined,
      script: type === "script" ? (w.script as string) : undefined,
      description,
      enabled,
      timeout,
      schedule,
    };
  }

  return { meta, workflows };
}
