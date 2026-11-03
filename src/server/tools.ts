/**
 * Locates the ingestion tools on this PC and runs them without a shell.
 *
 * The dev server may have been started before the tools were installed, so its
 * PATH can be stale: besides PATH we look in the per-user install locations
 * (pip --user Scripts, npm global, winget links). Each tool can also be pinned
 * with an env var (BF_YTDLP, BF_SPOTDL, BF_FREYR, BF_FFMPEG, BF_FFPROBE,
 * BF_ATOMICPARSLEY).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export type ToolId = "yt-dlp" | "spotdl" | "freyr" | "ffmpeg" | "ffprobe" | "atomicparsley";

const isWin = process.platform === "win32";
const exe = (n: string) => (isWin ? `${n}.exe` : n);

const ENV_KEY: Record<ToolId, string> = {
  "yt-dlp": "BF_YTDLP",
  spotdl: "BF_SPOTDL",
  freyr: "BF_FREYR",
  ffmpeg: "BF_FFMPEG",
  ffprobe: "BF_FFPROBE",
  atomicparsley: "BF_ATOMICPARSLEY",
};

const FILE: Record<ToolId, string[]> = {
  "yt-dlp": [exe("yt-dlp")],
  spotdl: [exe("spotdl")],
  freyr: ["cli.js"],
  ffmpeg: [exe("ffmpeg")],
  ffprobe: [exe("ffprobe")],
  atomicparsley: [exe("AtomicParsley"), exe("atomicparsley")],
};

function extraDirs(): string[] {
  const dirs: string[] = [];
  const appData = process.env.APPDATA;
  const local = process.env.LOCALAPPDATA;
  if (appData) {
    const py = path.join(appData, "Python");
    if (existsSync(py)) for (const d of readdirSync(py)) dirs.push(path.join(py, d, "Scripts"));
    dirs.push(path.join(appData, "npm"));
  }
  if (local) dirs.push(path.join(local, "Microsoft", "WinGet", "Links"));
  return dirs;
}

/** PATH for child processes: the server's PATH plus the user install dirs, so engines find FFmpeg/AtomicParsley. */
export function childPath() {
  const sep = isWin ? ";" : ":";
  return [process.env.PATH ?? "", ...extraDirs()].filter(Boolean).join(sep);
}

const cache = new Map<ToolId, string | null>();

export function resolveTool(id: ToolId): string | null {
  if (cache.has(id)) return cache.get(id)!;
  let found: string | null = null;
  const pinned = process.env[ENV_KEY[id]];
  if (pinned && existsSync(pinned)) found = pinned;
  if (!found && id === "freyr") {
    // npm global package: run its cli.js with this Node, never the .cmd shim (no shell).
    const roots = [process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules"), "/usr/local/lib/node_modules", "/usr/lib/node_modules"].filter(Boolean) as string[];
    for (const r of roots) {
      const p = path.join(r, "freyr", "cli.js");
      if (existsSync(p)) {
        found = p;
        break;
      }
    }
  }
  if (!found) {
    const dirs = childPath().split(isWin ? ";" : ":");
    outer: for (const d of dirs) {
      for (const f of FILE[id]) {
        const p = path.join(d, f);
        if (id !== "freyr" && existsSync(p)) {
          found = p;
          break outer;
        }
      }
    }
  }
  if (found) cache.set(id, found); // a missing tool is looked up again next time (it may be installed meanwhile)
  return found;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  onSpawn?: (child: ChildProcess) => void;
}

/** Spawns a tool with an argument array (no shell, so URLs are never interpreted). */
export function runTool(id: ToolId, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const bin = resolveTool(id);
  if (!bin) return Promise.resolve({ code: -1, stdout: "", stderr: `${id} is not installed on this PC`, timedOut: false });
  const [cmd, argv] = id === "freyr" ? [process.execPath, [bin, ...args]] : [bin, args];
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, {
      cwd: opts.cwd,
      env: { ...process.env, PATH: childPath(), Path: childPath(), PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb" },
      windowsHide: true,
    });
    opts.onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    let outBuf = "";
    let errBuf = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, opts.timeoutMs)
      : undefined;
    const lines = (chunk: string, buf: string, cb?: (l: string) => void) => {
      const all = buf + chunk;
      const parts = all.split(/\r?\n|\r/);
      const rest = parts.pop() ?? "";
      if (cb) for (const p of parts) if (p.trim()) cb(p);
      return rest;
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      stdout += c;
      outBuf = lines(c, outBuf, opts.onStdoutLine);
    });
    child.stderr?.on("data", (c: string) => {
      stderr += c;
      errBuf = lines(c, errBuf, opts.onStderrLine);
    });
    child.on("error", (e) => {
      stderr += `\n${e.message}`;
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (outBuf.trim()) opts.onStdoutLine?.(outBuf);
      if (errBuf.trim()) opts.onStderrLine?.(errBuf);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Kills a child and, on Windows, its whole process tree (engines spawn FFmpeg). */
export function killTree(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return;
  if (isWin) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => undefined);
  else child.kill("SIGKILL");
}

const versionCache = new Map<ToolId, { at: number; version: string | null }>();

/** Version string of a tool, or null when it is not installed (cached for 60 s). */
export async function toolVersion(id: ToolId): Promise<string | null> {
  const hit = versionCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.version;
  if (!resolveTool(id)) {
    versionCache.set(id, { at: Date.now(), version: null });
    return null;
  }
  const args = id === "ffmpeg" || id === "ffprobe" ? ["-version"] : id === "atomicparsley" ? ["--version"] : id === "freyr" ? ["--version"] : ["--version"];
  const r = await runTool(id, args, { timeoutMs: 30_000 });
  const text = `${r.stdout}\n${r.stderr}`;
  let v: string | null = null;
  if (id === "ffmpeg" || id === "ffprobe") v = /version\s+(\S+)/i.exec(text)?.[1] ?? null;
  else if (id === "freyr") v = /v?(\d+\.\d+\.\d+)/.exec(text)?.[1] ?? null;
  else v = /(\d+[.\d]*\d)/.exec(text)?.[1] ?? null;
  versionCache.set(id, { at: Date.now(), version: v });
  return v;
}
