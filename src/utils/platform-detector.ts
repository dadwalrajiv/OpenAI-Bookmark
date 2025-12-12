export type PlatformType = 'claude' | 'chatgpt' | 'unknown';

export class PlatformDetector {
  static detect(): PlatformType {
    const hostname = window.location.hostname;
    
    if (hostname === 'claude.ai') {
      return 'claude';
    }
    
    if (hostname === 'chatgpt.com' || hostname === 'chat.openai.com') {
      return 'chatgpt';
    }
    
    return 'unknown';
  }
  
  static getConversationUrl(): string {
    return window.location.href;
  }
}