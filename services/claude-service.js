const Anthropic = require('@anthropic-ai/sdk');
const ThemeGenerator = require('./theme-generator');

/**
 * ClaudeService - Handles AI theme generation using Claude Haiku
 * Uses ThemeGenerator for session tracking and dynamic prompt seeding
 */
class ClaudeService {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.client = null;
    this.themeCache = [];
    this.model = 'claude-haiku-4-5-20251001';
    this.themeGenerator = new ThemeGenerator();
    
    // Session manager tracks used themes to prevent repeats within a game
    this.sessionManager = this.themeGenerator.createSessionManager();
    // Also track AI-generated themes to avoid duplicates
    this.usedAIThemes = new Set();
    
    // Prompt style variations for diversity
    this.promptStyles = [
      { vibe: 'funny and lighthearted', examples: 'guilty pleasure, embarrassing moment, weird habit' },
      { vibe: 'nostalgic and reflective', examples: 'childhood memory, first crush, dream vacation' },
      { vibe: 'spicy and revealing', examples: 'unpopular opinion, secret talent, biggest fear' },
      { vibe: 'creative and hypothetical', examples: 'superpower choice, time travel destination, dream dinner guest' },
      { vibe: 'pop culture and modern', examples: 'binge-worthy show, TikTok obsession, most-used emoji' },
      { vibe: 'random and unexpected', examples: 'last thing googled, phone wallpaper story, autocorrect fail' }
    ];
    
    if (this.apiKey && this.apiKey !== 'YOUR_ANTHROPIC_API_KEY_HERE') {
      this.initializeClient();
    }
  }

  /**
   * Reset session for a new game - clears all used theme tracking
   */
  resetSession() {
    this.sessionManager = this.themeGenerator.createSessionManager();
    this.usedAIThemes.clear();
    this.themeCache = [];
    console.log('[ClaudeService] Session reset - theme tracking cleared');
  }

  initializeClient() {
    try {
      this.client = new Anthropic({
        apiKey: this.apiKey
      });
    } catch (err) {
      console.error('Failed to initialize Anthropic client:', err);
      this.client = null;
    }
  }

  updateApiKey(newKey) {
    this.apiKey = newKey;
    if (newKey && newKey !== 'YOUR_ANTHROPIC_API_KEY_HERE') {
      this.initializeClient();
    }
  }

  /**
   * Build a dynamic prompt using random seeds from ThemeGenerator
   * This ensures every API call gets a different prompt for variety
   */
  buildDynamicPrompt() {
    // Get random seed themes from the generator (different each time)
    const seedThemes = this.themeGenerator.getRandomThemes(5);
    
    // Pick a random style/vibe for this round
    const style = this.promptStyles[Math.floor(Math.random() * this.promptStyles.length)];
    
    // Build exclusion list from already-used AI themes (limit to last 20)
    const recentUsed = Array.from(this.usedAIThemes).slice(-20);
    const avoidClause = recentUsed.length > 0 
      ? `\nAVOID these (already used): ${recentUsed.slice(0, 10).join(', ')}`
      : '';
    
    return `Generate 3 unique party game themes for a group to answer.

Vibe for this round: ${style.vibe}
Style inspiration: ${seedThemes.join(', ')}

Each theme should be:
- A single question or prompt (2-5 words ideal)
- Personal but fun and appropriate for friends
- Answerable in 1-3 words
- Different from the style examples above${avoidClause}

Return ONLY the 3 themes, one per line, no numbering, bullets, or quotes.`;
  }

  /**
   * Generate 3 unique themes for the current round
   * Uses dynamic prompts seeded by ThemeGenerator for guaranteed variety
   */
  async generateThemes() {
    // Try to use cached themes first (these are already unique)
    if (this.themeCache.length >= 3) {
      const themes = this.themeCache.splice(0, 3);
      // Track as used
      themes.forEach(t => this.usedAIThemes.add(t));
      this.refillCache(); // Async refill
      return themes;
    }

    // If no API client, use fallback with session tracking
    if (!this.client) {
      return this.getFallbackThemes();
    }

    try {
      // Build a dynamic prompt with random seeds each time
      const dynamicPrompt = this.buildDynamicPrompt();
      
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 200,
        temperature: 0.95, // Higher temperature for more creative/varied outputs
        messages: [
          {
            role: 'user',
            content: dynamicPrompt
          }
        ]
      });

      const content = response.content[0].text;
      let themes = content
        .split('\n')
        .map(line => line.trim().replace(/^["']|["']$/g, '')) // Remove quotes
        .filter(line => line.length > 0 && line.length < 100)
        .filter(line => !this.usedAIThemes.has(line)) // Filter out already-used themes
        .slice(0, 3);

      // Track these themes as used
      themes.forEach(t => this.usedAIThemes.add(t));

      if (themes.length < 3) {
        // Supplement with fallback themes from session manager (guaranteed unique)
        const fallbacks = this.getFallbackThemes();
        while (themes.length < 3 && fallbacks.length > 0) {
          const fallback = fallbacks.shift();
          if (!themes.includes(fallback)) {
            themes.push(fallback);
          }
        }
      }

      return themes;
    } catch (err) {
      console.error('Error generating themes from Claude:', err);
      return this.getFallbackThemes();
    }
  }

  /**
   * Refill the theme cache in the background with varied themes
   */
  async refillCache() {
    if (!this.client || this.themeCache.length >= 27) return;

    try {
      // Get random seeds for variety
      const seedThemes = this.themeGenerator.getRandomThemes(8);
      const style = this.promptStyles[Math.floor(Math.random() * this.promptStyles.length)];
      
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 600,
        temperature: 0.95,
        messages: [
          {
            role: 'user',
            content: `Generate 10 unique party game themes for a group to answer.

Vibe: ${style.vibe}
Inspiration: ${seedThemes.join(', ')}

Each theme should be:
- A single question or prompt (2-5 words ideal)
- Personal but fun and appropriate for friends
- Answerable in 1-3 words
- Creative and DIFFERENT from the inspiration examples

Return ONLY the 10 themes, one per line, no numbering, bullets, or quotes.`
          }
        ]
      });

      const content = response.content[0].text;
      const themes = content
        .split('\n')
        .map(line => line.trim().replace(/^["']|["']$/g, ''))
        .filter(line => line.length > 0 && line.length < 100)
        .filter(line => !this.usedAIThemes.has(line) && !this.themeCache.includes(line));

      // Add to cache
      themes.forEach(theme => {
        this.themeCache.push(theme);
      });
    } catch (err) {
      console.error('Error refilling theme cache:', err);
    }
  }

  /**
   * Get fallback themes when API is unavailable
   * Uses session manager to guarantee no repeats within a game
   */
  getFallbackThemes() {
    // Session manager tracks used themes and guarantees uniqueness
    return this.sessionManager.getThemes(3);
  }

  /**
   * Test API connection
   */
  async testConnection() {
    if (!this.client) {
      return { success: false, error: 'No API client configured' };
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [
          { role: 'user', content: 'Say "OK" and nothing else.' }
        ]
      });

      return { success: true, response: response.content[0].text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = ClaudeService;
