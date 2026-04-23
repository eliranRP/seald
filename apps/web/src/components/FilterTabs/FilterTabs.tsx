import { forwardRef } from 'react';
import type { FilterTabsProps } from './FilterTabs.types';
import { TabButton, TabCount, TabList } from './FilterTabs.styles';

/**
 * L2 domain component — filter-style tablist where exactly one tab is active
 * at a time. Clicking a tab fires `onSelect(id)`. Items may expose a `count`
 * that renders as a pill badge after the label.
 */
export const FilterTabs = forwardRef<HTMLDivElement, FilterTabsProps>((props, ref) => {
  const { items, activeId, onSelect, ...rest } = props;
  return (
    <TabList ref={ref} role="tablist" {...rest}>
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <TabButton
            key={item.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            $active={isActive}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <TabCount aria-label={`${item.count} items`}>{item.count}</TabCount>
            ) : null}
          </TabButton>
        );
      })}
    </TabList>
  );
});
FilterTabs.displayName = 'FilterTabs';
