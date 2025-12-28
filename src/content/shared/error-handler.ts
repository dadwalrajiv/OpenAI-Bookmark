/**
 * Safe error handler - logs errors without breaking the page
 */
export function safeExecute<T>(
  fn: () => T,
  errorContext: string,
  fallbackValue?: T
): T | undefined {
  try {
    return fn();
  } catch (error) {
    console.error(`❌ AI Chat Bookmarks Error [${errorContext}]:`, error);
    // Don't throw - just log and continue
    return fallbackValue;
  }
}

/**
 * Safe async error handler
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  errorContext: string,
  fallbackValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.error(`❌ AI Chat Bookmarks Error [${errorContext}]:`, error);
    return fallbackValue;
  }
}

/**
 * Global error handler - catches any unhandled errors from extension
 * Prevents extension errors from breaking the AI platform
 */
export function setupGlobalErrorHandler(platformName: string): void {
  // Catch synchronous errors
  const originalErrorHandler = window.onerror;
  
  window.addEventListener('error', (event) => {
    // Check if error is from our extension
    const isOurError = event.filename?.includes('-content.js') || 
                      event.error?.stack?.includes('content.js');
    
    if (isOurError) {
      console.error(`❌ AI Chat Bookmarks [${platformName}] - Unhandled Error:`, event.error);
      // Stop propagation to prevent breaking the page
      event.stopPropagation();
      // Don't preventDefault - let page continue normally
      return false;
    }
  }, true);
  
  // Catch async errors (promises)
  window.addEventListener('unhandledrejection', (event) => {
    const isOurError = event.reason?.stack?.includes('content.js');
    
    if (isOurError) {
      console.error(`❌ AI Chat Bookmarks [${platformName}] - Unhandled Promise Rejection:`, event.reason);
      event.stopPropagation();
      // Don't call preventDefault - allow page to continue
    }
  });
  
  console.log(`🛡️  [${platformName}] Error handlers active - extension isolated from page`);
}

/**
 * Safe wrapper for DOM operations
 */
export function safeDOMOperation<T>(
  fn: () => T,
  errorContext: string,
  fallbackValue?: T
): T | undefined {
  try {
    return fn();
  } catch (error) {
    // DOM errors are common and expected, log at lower priority
    console.warn(`⚠️  AI Chat Bookmarks DOM operation failed [${errorContext}]:`, error);
    return fallbackValue;
  }
}

/**
 * Safe wrapper for MutationObserver callback
 */
export function safeMutationCallback(
  callback: () => void,
  errorContext: string
): () => void {
  return () => {
    try {
      callback();
    } catch (error) {
      console.warn(`⚠️  MutationObserver error [${errorContext}]:`, error);
      // Don't throw - observer should continue working
    }
  };
}