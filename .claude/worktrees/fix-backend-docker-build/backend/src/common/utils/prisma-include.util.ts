export function parseInclude(includeStr?: string): Record<string, any> | undefined {
  if (!includeStr) return undefined;
  
  const includes = includeStr.split(',').map(s => s.trim());
  const result: Record<string, any> = {};

  for (const path of includes) {
    const parts = path.split('.');
    let current = result;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = current[part] || true;
      } else {
        current[part] = current[part] || { include: {} };
        if (current[part] === true) {
           current[part] = { include: {} };
        }
        current = current[part].include;
      }
    }
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
}
