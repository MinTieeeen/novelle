/*
 * AD2 / AD5 tables start at 1280px: with the 248px side nav, 1024px leaves ~740px, too narrow for 5–7
 * columns, so rows stay cards below xl. AD6 (3 columns) keeps lg.
 */
/** AD2 table columns (board AdminUsers); the header row and UserRow share them. */
export const USER_GRID = 'xl:grid xl:grid-cols-[minmax(0,1fr)_110px_120px_120px_150px] xl:items-center xl:gap-4 xl:px-5';
/** AD5 table columns (board AdminStories). */
export const STORY_GRID = 'xl:grid xl:grid-cols-[minmax(0,1fr)_150px_110px_84px_104px_80px_132px] xl:items-center xl:gap-4 xl:px-5';
/** Table card + its header row. */
export const TABLE = 'overflow-hidden rounded-lg border border-border bg-card';
export const TABLE_HEAD = 'bg-secondary py-3 text-small font-semibold text-muted-foreground max-lg:hidden';
/** header of the xl tables (AD2, AD5) */
export const TABLE_HEAD_XL = 'bg-secondary py-3 text-small font-semibold text-muted-foreground max-xl:hidden';
export const ROW_BTN =
  'inline-flex h-[34px] items-center rounded-md border border-input bg-card px-3 text-small font-medium transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid';
export const ICON_BTN =
  'grid size-[34px] flex-none place-items-center rounded-md transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid';
