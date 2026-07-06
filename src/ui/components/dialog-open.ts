const openDialogIds = new Set<string>();

export function setDialogOpen(id: string, open: boolean): void {
  if (open) {
    openDialogIds.add(id);
    return;
  }
  openDialogIds.delete(id);
}

export function isAnyDialogOpen(): boolean {
  return openDialogIds.size > 0;
}
