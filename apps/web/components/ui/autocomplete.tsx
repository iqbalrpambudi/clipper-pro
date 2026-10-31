"use client";

import * as React from "react";
import { ChevronDown, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---
export interface AutocompleteItemOption {
  value: string;
  label?: string;
  [key: string]: unknown;
}

interface AutocompleteContextValue<T = unknown> {
  value: string;
  onValueChange: (val: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  items?: T[];
  filteredItems: T[];
  filterFn?: (item: T, query: string) => boolean;
  getItemValue: (item: T) => string;
  getItemLabel: (item: T) => string;
  highlightedIndex: number;
  setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectItem: (itemValue: string) => void;
  listId: string;
  disabled?: boolean;
}

const AutocompleteContext = React.createContext<AutocompleteContextValue<unknown> | null>(null);

export function useAutocomplete<T = unknown>() {
  const context = React.useContext(
    AutocompleteContext as unknown as React.Context<AutocompleteContextValue<T> | null>
  );
  if (!context) {
    throw new Error("useAutocomplete must be used within an <Autocomplete /> component.");
  }
  return context;
}

// --- Root Component ---
export interface AutocompleteProps<T = unknown> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  items?: T[];
  filter?: (item: T, query: string) => boolean;
  getItemValue?: (item: T) => string;
  getItemLabel?: (item: T) => string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Autocomplete<T = unknown>({
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  items,
  filter,
  getItemValue = (item: unknown) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      return String(rec.value ?? rec.id ?? item);
    }
    return String(item);
  },
  getItemLabel = (item: unknown) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      return String(rec.label ?? rec.name ?? rec.id ?? item);
    }
    return String(item);
  },
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  children,
}: AutocompleteProps<T>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [highlightedIndex, setHighlightedIndex] = React.useState<number>(-1);
  const listId = React.useId();

  const isControlledValue = controlledValue !== undefined;
  const isControlledOpen = controlledOpen !== undefined;

  const value = isControlledValue ? controlledValue : uncontrolledValue;
  const open = isControlledOpen ? controlledOpen : uncontrolledOpen;

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (!isControlledValue) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [isControlledValue, onValueChange]
  );

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!isControlledOpen) {
        setUncontrolledOpen(newOpen);
      }
      onOpenChange?.(newOpen);
      if (!newOpen) {
        setHighlightedIndex(-1);
      }
    },
    [isControlledOpen, onOpenChange]
  );

  const setOpen = React.useCallback(
    (action: React.SetStateAction<boolean>) => {
      const nextOpen = typeof action === "function" ? action(open) : action;
      handleOpenChange(nextOpen);
    },
    [handleOpenChange, open]
  );

  // Default filtering logic using the input value as the search query
  const defaultFilter = React.useCallback(
    (item: T, query: string): boolean => {
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      if (typeof item === "string") {
        return item.toLowerCase().includes(q);
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        return Object.values(obj).some(
          (val) => typeof val === "string" && val.toLowerCase().includes(q)
        );
      }
      return false;
    },
    []
  );

  const activeFilter = filter ?? defaultFilter;

  const filteredItems = React.useMemo(() => {
    if (!items) return [];
    return items.filter((item) => activeFilter(item, value));
  }, [items, activeFilter, value]);

  const selectItem = React.useCallback(
    (itemValue: string) => {
      handleValueChange(itemValue);
      handleOpenChange(false);
      inputRef.current?.focus();
    },
    [handleValueChange, handleOpenChange]
  );

  // Close on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        handleOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, handleOpenChange]);

  const contextValue = React.useMemo(
    () => ({
      value,
      onValueChange: handleValueChange,
      open,
      setOpen,
      items,
      filteredItems,
      filterFn: filter,
      getItemValue,
      getItemLabel,
      highlightedIndex,
      setHighlightedIndex,
      inputRef,
      containerRef,
      selectItem,
      listId,
      disabled,
    }),
    [
      value,
      handleValueChange,
      open,
      setOpen,
      items,
      filteredItems,
      filter,
      getItemValue,
      getItemLabel,
      highlightedIndex,
      selectItem,
      listId,
      disabled,
    ]
  );

  return (
    <AutocompleteContext.Provider
      value={contextValue as unknown as AutocompleteContextValue<unknown>}
    >
      <div
        ref={containerRef}
        className={cn("relative w-full", className)}
      >
        {children}
      </div>
    </AutocompleteContext.Provider>
  );
}

// --- Autocomplete Input ---
export interface AutocompleteInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  showTrigger?: boolean;
  showClear?: boolean;
  isLoading?: boolean;
  triggerTitle?: string;
  clearTitle?: string;
}

export const AutocompleteInput = React.forwardRef<HTMLInputElement, AutocompleteInputProps>(
  (
    {
      className,
      showTrigger = true,
      showClear = false,
      isLoading = false,
      placeholder = "Ketik atau pilih...",
      triggerTitle = "Buka daftar pilihan",
      clearTitle = "Hapus input",
      disabled: propsDisabled,
      onKeyDown,
      onFocus,
      ...props
    },
    forwardedRef
  ) => {
    const {
      value,
      onValueChange,
      open,
      setOpen,
      filteredItems,
      getItemValue,
      highlightedIndex,
      setHighlightedIndex,
      selectItem,
      inputRef,
      listId,
      disabled: contextDisabled,
    } = useAutocomplete();

    const disabled = propsDisabled || contextDisabled;

    // Combine refs
    React.useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (disabled) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlightedIndex(0);
        } else if (filteredItems.length > 0) {
          setHighlightedIndex((prev) =>
            prev < filteredItems.length - 1 ? prev + 1 : 0
          );
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlightedIndex(filteredItems.length - 1);
        } else if (filteredItems.length > 0) {
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredItems.length - 1
          );
        }
      } else if (e.key === "Enter") {
        if (open && highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
          e.preventDefault();
          const target = filteredItems[highlightedIndex];
          selectItem(getItemValue(target));
        }
      } else if (e.key === "Escape") {
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
      } else if (e.key === "Tab") {
        if (open) {
          setOpen(false);
        }
      }
    };

    const hasValue = Boolean(value && value.trim().length > 0);

    return (
      <div className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onValueChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={(e) => {
            onFocus?.(e);
            if (!disabled) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          className={cn(
            "flex h-9 w-full rounded-xl border border-border bg-[hsl(var(--control-background))] px-3.5 py-1.5 text-xs text-foreground shadow-xs transition-colors",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
            (showTrigger || showClear || isLoading) && "pr-10",
            className
          )}
          {...props}
        />

        {/* Action icons right within form input */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <div className="p-1 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </div>
          )}

          {showClear && hasValue && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onValueChange("");
                setOpen(true);
                inputRef.current?.focus();
              }}
              title={clearTitle}
              aria-label={clearTitle}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {showTrigger && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((prev) => !prev);
                inputRef.current?.focus();
              }}
              title={triggerTitle}
              aria-label={triggerTitle}
              tabIndex={-1}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition"
            >
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-muted-foreground opacity-70 transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </button>
          )}
        </div>
      </div>
    );
  }
);
AutocompleteInput.displayName = "AutocompleteInput";

// --- Autocomplete Content / Popup ---
export interface AutocompleteContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end" | "center";
}

export const AutocompleteContent = React.forwardRef<HTMLDivElement, AutocompleteContentProps>(
  ({ className, children, align = "start", ...props }, ref) => {
    const { open, listId } = useAutocomplete();

    if (!open) return null;

    return (
      <div
        ref={ref}
        id={listId}
        role="listbox"
        className={cn(
          "absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-xl animate-scale-pop",
          align === "end" && "right-0 left-auto",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AutocompleteContent.displayName = "AutocompleteContent";
export const AutocompletePopup = AutocompleteContent;

// --- Autocomplete List ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AutocompleteListProps<T = any>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children?: React.ReactNode | ((item: T, index: number) => React.ReactNode);
}

export const AutocompleteList = React.forwardRef<HTMLDivElement, AutocompleteListProps>(
  ({ className, children, ...props }, ref) => {
    const { filteredItems } = useAutocomplete();

    const isFunctionChild = typeof children === "function";

    return (
      <div
        ref={ref}
        className={cn("max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar", className)}
        {...props}
      >
        {isFunctionChild
          ? filteredItems.map((item, index) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (children as (item: any, index: number) => React.ReactNode)(item, index)
            )
          : children}
      </div>
    );
  }
);
AutocompleteList.displayName = "AutocompleteList";

// --- Autocomplete Item ---
export interface AutocompleteItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  label?: string;
  disabled?: boolean;
  showCheck?: boolean;
}

export const AutocompleteItem = React.forwardRef<HTMLDivElement, AutocompleteItemProps>(
  (
    {
      className,
      value: itemValue,
      label,
      disabled = false,
      showCheck = true,
      onClick,
      children,
      ...props
    },
    ref
  ) => {
    const { value, selectItem, highlightedIndex, filteredItems, getItemValue } =
      useAutocomplete();

    const isSelected = value === itemValue;
    const isHighlighted =
      highlightedIndex >= 0 &&
      highlightedIndex < filteredItems.length &&
      getItemValue(filteredItems[highlightedIndex]) === itemValue;

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled}
        data-highlighted={isHighlighted ? "true" : undefined}
        onClick={(e) => {
          if (disabled) return;
          onClick?.(e);
          selectItem(itemValue);
        }}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center justify-between rounded-lg px-3 py-2 text-xs text-foreground outline-none transition-colors",
          isSelected
            ? "bg-muted text-foreground font-normal"
            : isHighlighted
              ? "bg-muted/70 text-foreground"
              : "text-foreground hover:bg-muted/70 hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          className
        )}
        {...props}
      >
        <div className="flex-1 min-w-0 truncate">
          {children || label || itemValue}
        </div>
        {showCheck && isSelected && (
          <div className="ml-auto pl-2 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-foreground" />
          </div>
        )}
      </div>
    );
  }
);
AutocompleteItem.displayName = "AutocompleteItem";

// --- Autocomplete Empty ---
export type AutocompleteEmptyProps = React.HTMLAttributes<HTMLDivElement>;

export const AutocompleteEmpty = React.forwardRef<HTMLDivElement, AutocompleteEmptyProps>(
  ({ className, children = "Tidak ada hasil ditemukan.", ...props }, ref) => {
    const { filteredItems } = useAutocomplete();

    if (filteredItems.length > 0) return null;

    return (
      <div
        ref={ref}
        className={cn("py-5 text-center text-muted-foreground text-xs px-2", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AutocompleteEmpty.displayName = "AutocompleteEmpty";

// --- Autocomplete Group & Label ---
export type AutocompleteGroupProps = React.HTMLAttributes<HTMLDivElement>;

export const AutocompleteGroup = React.forwardRef<HTMLDivElement, AutocompleteGroupProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("space-y-1 pt-1", className)} {...props} />
  )
);
AutocompleteGroup.displayName = "AutocompleteGroup";

export type AutocompleteLabelProps = React.HTMLAttributes<HTMLDivElement>;

export const AutocompleteLabel = React.forwardRef<HTMLDivElement, AutocompleteLabelProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-2 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase", className)}
      {...props}
    />
  )
);
AutocompleteLabel.displayName = "AutocompleteLabel";
