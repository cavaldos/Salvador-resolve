#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { compileToFfmpeg, parseProject, diffTimeline, type Project } from "@salvador/core";

function usage(): never {
  console.error(`salvador <command>

  probe <file>                 run ffprobe and print JSON
  validate <project.json>      validate a Salvador Resolve project
  render <project.json> <out>  render with ffmpeg
  diff <a.json> <b.json>       show timeline changes
`);
  process.exit(1);
}

function readProject(path: string): Project {
  return parseProject(JSON.parse(readFileSync(path, "utf8")));
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "probe": {
    const file = args[0];
    if (!file) usage();
    const r = spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error(r.stderr);
      process.exit(1);
    }
    console.log(r.stdout);
    break;
  }
  case "validate": {
    const file = args[0];
    if (!file) usage();
    const p = readProject(file);
    console.log(`ok: ${p.name} (schema v${p.schemaVersion}, ${p.assets.length} assets, ${p.tracks.length} tracks)`);
    break;
  }
  case "render": {
    const [file, out] = args;
    if (!file || !out) usage();
    const p = readProject(file);
    const ffArgs = compileToFfmpeg(p);
    ffArgs.push(out);
    const r = spawnSync("ffmpeg", ffArgs, { stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
  case "diff": {
    const [a, b] = args;
    if (!a || !b) usage();
    const changes = diffTimeline(readProject(a), readProject(b));
    for (const c of changes) console.log(`${c.kind}\t${c.path}\t${c.summary}`);
    break;
  }
  default:
    usage();
}
