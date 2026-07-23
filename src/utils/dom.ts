export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
