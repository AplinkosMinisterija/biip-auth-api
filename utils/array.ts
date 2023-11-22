export function toggleItemInArray(items: Array<any>, item: any, add: Boolean = true) {
  const defaultResult: any = {
    changed: false,
    items: [],
  };

  if (!items || !Array.isArray(items)) return defaultResult;

  const hasItem = items.includes(item);
  if (add && !hasItem) {
    return {
      changed: true,
      items: [...items, item],
    };
  } else if (!add && hasItem) {
    return {
      changed: true,
      items: items.filter((i) => i !== item),
    };
  }
  defaultResult.items = items;
  return defaultResult;
}
