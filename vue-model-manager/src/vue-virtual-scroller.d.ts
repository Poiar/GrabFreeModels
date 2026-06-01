declare module 'vue-virtual-scroller' {
  import type { DefineComponent } from 'vue'
  export const RecycleScroller: DefineComponent<{
    items: unknown[]
    itemSize?: number
    keyField?: string
    emitUpdate?: boolean
  }>
  export const DynamicScroller: DefineComponent<Record<string, unknown>>
  export const DynamicScrollerItem: DefineComponent<Record<string, unknown>>
}
