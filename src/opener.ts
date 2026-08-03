import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Open a note in Obsidian via the obsidian:// URL scheme, cross-platform.
export async function openInObsidian(filePath: string): Promise<void> {
  const uri = `obsidian://open?path=${encodeURIComponent(filePath)}`;
  switch (process.platform) {
    case "darwin":
      await run("open", [uri]);
      break;
    case "win32":
      await run("cmd", ["/c", "start", "", uri]);
      break;
    default:
      await run("xdg-open", [uri]);
      break;
  }
}
