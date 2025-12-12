/**
 * Sanitize user input to prevent XSS attacks
 */
export class InputSanitizer {
  /**
   * Sanitize text input by escaping HTML special characters
   */
  static sanitizeText(input: string, maxLength: number = 500): string {
    if (!input) return '';
    
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/`/g, '&#x60;')
      .trim()
      .substring(0, maxLength);
  }
  
  /**
   * Sanitize for display (converts back to readable text)
   */
  static sanitizeForDisplay(input: string): string {
    if (!input) return '';
    
    return input
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#x60;/g, '`');
  }
  
  /**
   * Remove all HTML tags
   */
  static stripHtml(input: string): string {
    if (!input) return '';
    
    return input.replace(/<[^>]*>/g, '');
  }
}