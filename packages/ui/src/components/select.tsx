import { Check, ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils.js';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
}

const MENU_GAP = 8;
const MENU_MAX = 240;

function computeMenuPosition(trigger: DOMRect): MenuPosition {
  const viewportPadding = 12;
  const spaceBelow = window.innerHeight - trigger.bottom - viewportPadding;
  const spaceAbove = trigger.top - viewportPadding;
  const preferBottom = spaceBelow >= Math.min(MENU_MAX, 160) || spaceBelow >= spaceAbove;
  const available = preferBottom ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(120, Math.min(MENU_MAX, available - MENU_GAP));
  const width = trigger.width;
  const left = Math.min(
    Math.max(viewportPadding, trigger.left),
    window.innerWidth - width - viewportPadding,
  );

  if (preferBottom) {
    return {
      top: trigger.bottom + MENU_GAP,
      left,
      width,
      maxHeight,
      placement: 'bottom',
    };
  }

  return {
    top: trigger.top - MENU_GAP - maxHeight,
    left,
    width,
    maxHeight,
    placement: 'top',
  };
}

export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  className,
  disabled = false,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: SelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selected = options.find((option) => option.value === value);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setPosition(computeMenuPosition(rect));
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const onReposition = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const menuStyle: CSSProperties | undefined = position
    ? {
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        zIndex: 200,
      }
    : undefined;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={ariaInvalid || undefined}
        className={cn(
          'vs-form-control flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 transition-[border-color,background-color] duration-200 outline-none hover:border-slate-300 focus:border-slate-900 focus:outline-none focus-visible:border-slate-900 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60',
          open && 'border-slate-900',
          ariaInvalid && 'border-red-500 bg-red-50/30',
        )}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={cn('truncate', !selected && 'text-slate-400')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ease-out',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && position && typeof document !== 'undefined'
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-labelledby={id}
              style={menuStyle}
              className={cn(
                'vs-menu-enter custom-scrollbar overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl',
                position.placement === 'top' ? 'origin-bottom' : 'origin-top',
              )}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <li key={option.value || '__empty'}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150',
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                      )}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected ? (
                        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
