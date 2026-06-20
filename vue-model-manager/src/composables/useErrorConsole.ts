import { ref, type Ref } from 'vue';

export interface CapturedError {
  id: number;
  time: string;
  message: string;
  source: string;
  line: string | number;
  col: string | number;
  stack: string;
}

const errors: Ref<CapturedError[]> = ref([]);
const isOpen: Ref<boolean> = ref(false);
let nextId = 0;

export function useErrorConsole() {
  function capture(payload: {
    message: string;
    source?: string;
    line?: string | number;
    col?: string | number;
    stack?: string;
  }) {
    const item: CapturedError = {
      id: nextId++,
      time: new Date().toLocaleTimeString(),
      message: payload.message || 'Unknown error',
      source: payload.source || '',
      line: payload.line ?? '',
      col: payload.col ?? '',
      stack: payload.stack || payload.message || '',
    };
    errors.value.unshift(item);
    // Keep last 50 errors max
    if (errors.value.length > 50) {
      errors.value = errors.value.slice(0, 50);
    }
    isOpen.value = true;
    return item;
  }

  function clear() {
    errors.value = [];
  }

  function close() {
    isOpen.value = false;
  }

  function open() {
    if (errors.value.length > 0) {
      isOpen.value = true;
    }
  }

  function formatLocation(e: CapturedError): string {
    const source = e.source || 'inline/runtime';
    if (e.line || e.col) {
      const parts = [source];
      if (e.line) parts.push(`line ${e.line}`);
      if (e.col) parts.push(`col ${e.col}`);
      return parts.join(', ');
    }
    return source;
  }

  async function copyToClipboard(): Promise<string> {
    const text = errors.value
      .map(
        (e, i) =>
          `#${i + 1} ${e.time}\n${e.message}\n${formatLocation(e)}\n${e.stack}`,
      )
      .join('\n\n');
    const content = text || 'No captured errors.';
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = content;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    return content;
  }

  /**
   * Install global error handlers. Call once at app init.
   */
  function install() {
    window.addEventListener('error', (event: ErrorEvent) => {
      capture({
        message: event.message || String(event.error || 'Unknown error'),
        source: event.filename || '',
        line: event.lineno ?? '',
        col: event.colno ?? '',
        stack: event.error?.stack || '',
      });
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      capture({
        message: reason?.message || String(reason),
        source: '',
        line: '',
        col: '',
        stack: reason?.stack || String(reason),
      });
    });
  }

  return { errors, isOpen, capture, clear, close, open, copyToClipboard, install };
}
