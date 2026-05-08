type ParsedLine = {
  indent: number;
  text: string;
  row: number;
};

function stripComment(line: string) {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === '#' && !quote) {
      return line.slice(0, index);
    }
  }
  return line;
}

function splitKeyValue(text: string) {
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if ((char === '"' || char === "'") && text[index - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === ':' && !quote) {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()] as const;
    }
  }
  return undefined;
}

function parseScalar(value: string): unknown {
  if (value === '{}') {
    return {};
  }
  if (value === '[]') {
    return [];
  }
  if (value === 'null' || value === '~') {
    return null;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1).replace(/''/g, "'");
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(',').map((item) => parseScalar(item.trim())) : [];
  }

  return value;
}

function parseBlock(lines: ParsedLine[], start: number, indent: number): { value: unknown; next: number } {
  const first = lines[start];
  if (!first || first.indent < indent) {
    return { value: {}, next: start };
  }

  if (first.text.startsWith('- ')) {
    const result: unknown[] = [];
    let index = start;
    while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith('- ')) {
      const itemText = lines[index].text.slice(2).trim();
      if (!itemText) {
        const nested = parseBlock(lines, index + 1, indent + 2);
        result.push(nested.value);
        index = nested.next;
        continue;
      }

      const keyValue = splitKeyValue(itemText);
      if (keyValue) {
        const [key, valueText] = keyValue;
        const object: Record<string, unknown> = {};
        object[key] = valueText ? parseScalar(valueText) : parseBlock(lines, index + 1, indent + 2).value;
        index += 1;
        while (index < lines.length && lines[index].indent === indent + 2 && !lines[index].text.startsWith('- ')) {
          const child = splitKeyValue(lines[index].text);
          if (!child) {
            throw new Error(`Invalid YAML near line ${lines[index].row}`);
          }
          const [childKey, childValue] = child;
          if (childValue) {
            object[childKey] = parseScalar(childValue);
            index += 1;
          } else {
            const nested = parseBlock(lines, index + 1, lines[index].indent + 2);
            object[childKey] = nested.value;
            index = nested.next;
          }
        }
        result.push(object);
        continue;
      }

      result.push(parseScalar(itemText));
      index += 1;
    }
    return { value: result, next: index };
  }

  const result: Record<string, unknown> = {};
  let index = start;
  while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith('- ')) {
    const keyValue = splitKeyValue(lines[index].text);
    if (!keyValue) {
      throw new Error(`Invalid YAML near line ${lines[index].row}`);
    }

    const [key, valueText] = keyValue;
    if (!key) {
      throw new Error(`Invalid YAML key near line ${lines[index].row}`);
    }

    if (valueText) {
      result[key] = parseScalar(valueText);
      index += 1;
    } else {
      const nested = parseBlock(lines, index + 1, indent + 2);
      result[key] = nested.value;
      index = nested.next;
    }
  }

  return { value: result, next: index };
}

export function parseConfigYaml(input: string): unknown {
  const lines = input
    .split(/\r?\n/)
    .map((line, index) => ({ raw: stripComment(line), row: index + 1 }))
    .filter(({ raw }) => raw.trim().length > 0)
    .map(({ raw, row }) => ({
      indent: raw.match(/^ */)?.[0].length ?? 0,
      text: raw.trim(),
      row,
    }));

  if (lines.length === 0) {
    return {};
  }

  const parsed = parseBlock(lines, 0, lines[0].indent);
  if (parsed.next < lines.length) {
    throw new Error(`Invalid YAML near line ${lines[parsed.next].row}`);
  }

  return parsed.value;
}

function quoteKey(key: string) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function scalarToYaml(value: unknown) {
  if (value === null || typeof value === 'undefined') {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  const text = String(value);
  return text === '' || /[:#\n\r{}\[\],&*?|<>=!%@`]/.test(text) || /^\s|\s$/.test(text) ? JSON.stringify(text) : text;
}

export function dumpYaml(value: unknown, depth = 0): string {
  const indent = '  '.repeat(depth);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          return `${indent}-\n${dumpYaml(item, depth + 1)}`;
        }
        return `${indent}- ${scalarToYaml(item)}`;
      })
      .join('\n');
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return '{}';
    }

    return entries
      .map(([key, child]) => {
        if (child && typeof child === 'object') {
          return `${indent}${quoteKey(key)}:\n${dumpYaml(child, depth + 1)}`;
        }
        return `${indent}${quoteKey(key)}: ${scalarToYaml(child)}`;
      })
      .join('\n');
  }

  return `${indent}${scalarToYaml(value)}`;
}
