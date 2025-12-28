export type PlatformType = 'claude' | 'chatgpt' | 'gemini' | 'copilot' | 'unknown';

export class PlatformDetector {
  static detect(): PlatformType {
    const hostname = window.location.hostname;
    
    if (hostname === 'claude.ai') {
      return 'claude';
    }
    
    if (hostname === 'chatgpt.com' || hostname === 'chat.openai.com') {
      return 'chatgpt';
    }
    
    if (hostname === 'gemini.google.com') {
      return 'gemini';
    }

     if (hostname === 'copilot.microsoft.com') {
      return 'copilot';
    }
    
    return 'unknown';
  }
  
  static getConversationUrl(): string {
    return window.location.href;
  }
}