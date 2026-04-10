const BANNER = [
  "    ____            ______      ____  ",
  "   / __ \\____  ____/_  __/___ _/ / /__ ",
  "  / / / / __ \\/ ___// / / __ `/ / //_/",
  " / /_/ / /_/ (__  )/ / / /_/ / / ,<   ",
  " \\____/ .___/____//_/  \\__,_/_/_/|_|  ",
  "      /_/                              ",
].join("\n");

export function getBanner(version: string): string {
  return `\x1B[36m${BANNER}\x1B[0m  \x1B[2mv${version}\x1B[0m`;
}
