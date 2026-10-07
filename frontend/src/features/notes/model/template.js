// Variable names may use any non-brace, non-whitespace text (including Chinese).
const placeholderPattern = /\{([^{}\s]{1,100})\}/g;

export function templateVariables(content) {
  return [...new Set(Array.from(content.matchAll(placeholderPattern), (match) => match[1]))];
}

export function renderTemplate(content, variables = {}) {
  return content.replace(placeholderPattern, (placeholder, name) =>
    Object.hasOwn(variables, name) && variables[name] !== '' ? variables[name] : placeholder
  );
}
