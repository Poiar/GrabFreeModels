---
name: virtual-scroller-optimization
description: Virtual scroller using DynamicScroller with variable item heights may cause scroll jank
metadata:
  type: issue
---

## Virtual Scroller Optimization

**Issue**: DynamicScroller with variable item heights
**Impact**: Potential scroll jank and incorrect positioning
**Location**: `vue-model-manager/src/views/All.vue` line 136-144
**Severity**: 🟡 Warning

### Current Implementation
```vue
<DynamicScroller
  v-if="sortedItems.length > 0"
  ref="scrollerRef"
  :key="'scroller-' + isMobile"
  :items="sortedItems"
  :min-item-size="56"
  key-field="id"
  class="vscroll-body"
>
```

### Issues
1. **Variable Heights**: Models have different context lengths, status badges, and tags
2. **Fixed Min Size**: 56px may be too small for some items
3. **No Size Tracking**: No measurement of actual item heights

### Optimization Options

#### Option 1: Use RecycleScroller for Fixed Height
```vue
<RecycleScroller
  v-if="sortedItems.length > 0"
  :items="sortedItems"
  :item-size="80" // Fixed height
  key-field="id"
  class="vscroll-body"
>
```

#### Option 2: Dynamic Size with Item Resizing
```vue
<DynamicScroller
  :items="sortedItems"
  :item-size="getItemSize"
  key-field="id"
>
```

```javascript
// In script setup
function getItemSize(item) {
  // Calculate based on content
  let height = 56; // Base height
  if (item.best_for.length > 3) height += 20;
  if (item.status.detail) height += 20;
  if (item.supports_tools) height += 16;
  return height;
}
```

#### Option 3: CSS Grid Alternative
```vue
<div class="model-grid">
  <div 
    v-for="item in visibleItems" 
    :key="item.id"
    class="model-card"
  >
    <!-- Content -->
  </div>
</div>
```

```css
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
```

### Best Practice: Hybrid Approach
1. **Use RecycleScroller** for most cases (better performance)
2. **Implement item size estimation** for DynamicScroller
3. **Add resize observer** for dynamic content
4. **Consider placeholder loading** for smooth scrolling

### Expected Impact
- Smoother scrolling experience
- Better performance with large lists
- More accurate scroll positioning

### Verification
1. Test with large datasets (1000+ items)
2. Measure scroll performance with Chrome DevTools
3. Check for visual artifacts during scrolling