"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AssetOption {
  id: string;
  name: string;
  ticker: string | null;
  /** Extra context shown after the name, e.g. shares held when selling. */
  hint?: string;
}

const optionLabel = (o: AssetOption) => (o.ticker ? `${o.name} (${o.ticker})` : o.name);

/**
 * Asset picker you can type into: the list narrows to assets whose name or
 * ticker contains the text (case- and accent-insensitive), instead of
 * scrolling a long select.
 */
export function AssetCombobox({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  className,
}: {
  options: AssetOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  emptyText: string;
  className?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(o: AssetOption | null) => {
        if (o) onChange(o.id);
      }}
      itemToStringLabel={optionLabel}
      isItemEqualToValue={(a: AssetOption, b: AssetOption) => a.id === b.id}
    >
      <div className={cn("relative", className)}>
        <Combobox.Input
          placeholder={placeholder}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
        <Combobox.Trigger
          aria-label={placeholder}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon className="size-4" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) min-w-36 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:hidden">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List>
              {(o: AssetOption) => (
                <Combobox.Item
                  key={o.id}
                  value={o}
                  className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {o.name}
                    {o.ticker && <span className="ml-1.5 text-xs text-muted-foreground">{o.ticker}</span>}
                    {o.hint && <span className="ml-1.5 text-xs text-muted-foreground">— {o.hint}</span>}
                  </span>
                  <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
