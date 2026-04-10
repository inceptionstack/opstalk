export function wrapText(input: string, width: number): string[] {
  if (width <= 0) {
    return [input];
  }

  const lines = input.split("\n");
  const wrapped: string[] = [];

  for (const line of lines) {
    if (line.length <= width) {
      wrapped.push(line);
      continue;
    }

    let rest = line;
    while (rest.length > width) {
      const slice = rest.slice(0, width);
      const lastSpace = slice.lastIndexOf(" ");
      const cut = lastSpace > width / 3 ? lastSpace : width;
      wrapped.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }

    wrapped.push(rest);
  }

  return wrapped;
}
