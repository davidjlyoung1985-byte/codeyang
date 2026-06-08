export function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    switch (ch) {
      case '*':
        if (pattern[i + 1] === '*') {
          i += 2;
          if (i < pattern.length && pattern[i] === '/') {
            i++;
          }
          regexStr += i < pattern.length ? '(.*/)?' : '.*';
        } else {
          i++;
          regexStr += '[^/]*';
        }
        break;

      case '?':
        i++;
        regexStr += '[^/]';
        break;

      case '[': {
        const end = pattern.indexOf(']', i);
        if (end === -1) {
          regexStr += '\\[';
          i++;
        } else {
          let classContent = pattern.slice(i + 1, end);
          let negate = false;
          if (classContent.startsWith('!') || classContent.startsWith('^')) {
            negate = true;
            classContent = classContent.slice(1);
          }
          if (!classContent) {
            regexStr += '\\[' + pattern.slice(i + 1, end) + '\\]';
            i = end + 1;
            break;
          }
          const escaped = classContent.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\^/g, '\\^');
          regexStr += negate ? `[^${escaped}]` : `[${escaped}]`;
          i = end + 1;
        }
        break;
      }

      case '.':
      case '^':
      case '$':
      case '+':
      case '{':
      case '}':
      case '(':
      case ')':
      case '|':
      case '\\':
        regexStr += '\\' + ch;
        i++;
        break;

      default:
        regexStr += ch;
        i++;
    }
  }

  if (regexStr.endsWith('/')) {
    regexStr = regexStr.slice(0, -1) + '(/.*)?';
  }

  return new RegExp(`^${regexStr}$`);
}
