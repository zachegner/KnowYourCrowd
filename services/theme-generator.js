/**
 * ThemeGenerator - Dynamically generates themes by combining templates and variants
 * Provides 100+ unique theme combinations without hardcoding them all
 */
class ThemeGenerator {
  constructor() {
    // Theme templates with placeholders
    this.templates = [
      // Question formats
      "Favorite {category}",
      "Worst {category}",
      "Best {category}",
      "Most embarrassing {category}",
      "Dream {category}",
      "Guilty pleasure {category}",
      "Go-to {category}",
      "Secret {category}",
      "Biggest {category}",
      "Last {category}",
      "First {category}",
      "Weirdest {category}",
      "Most overrated {category}",
      "Most underrated {category}",
      "Unpopular {category} opinion",
      
      // Action/Experience formats
      "Last time you {action}",
      "First time you {action}",
      "Best place to {action}",
      "Worst experience {action}",
      
      // Possession/Trait formats
      "Your most {adjective} possession",
      "Your most {adjective} habit",
      "Your most {adjective} talent",
      "Your most {adjective} fear",
      
      // If/Would formats
      "If you could {hypothetical}",
      "What you'd {hypothetical}",
      
      // Simple prompts
      "{standalone}"
    ];

    this.categories = [
      "song", "movie", "book", "TV show", "food", "snack", "drink",
      "vacation spot", "childhood memory", "app", "celebrity", "hobby",
      "ice cream flavor", "pizza topping", "emoji", "meme", "TikTok",
      "fashion choice", "purchase", "restaurant", "late night snack",
      "weekend activity", "conspiracy theory", "superpower", "decade"
    ];

    this.actions = [
      "cried in public", "stayed up all night", "lied to get out of plans",
      "stalked someone online", "pretended to know a song", "faked being sick",
      "laughed at the wrong moment", "texted the wrong person", "got starstruck",
      "embarrassed yourself", "impulse bought something", "broke something valuable",
      "met someone famous", "went viral", "got lost"
    ];

    this.adjectives = [
      "prized", "embarrassing", "useless", "expensive", "weird", "random",
      "nostalgic", "controversial", "hidden", "bizarre", "irrational", "specific"
    ];

    this.hypotheticals = [
      "have dinner with any celebrity", "live in any era", "have any superpower",
      "be famous for something", "master any skill instantly", "relive one day",
      "change one thing about yourself", "meet your future self", "talk to animals",
      "never age", "read minds", "teleport anywhere", "become invisible",
      "change your name to anything", "have unlimited money for one thing"
    ];

    this.standalones = [
      "Childhood nickname", "Celebrity look-alike", "Hidden talent",
      "Biggest ick", "Red flag you ignore", "Green flag you love",
      "Toxic trait", "Love language", "Zodiac sign excuse",
      "Main character energy moment", "Side character you relate to",
      "Comfort show", "Comfort food", "Karaoke song", "Walk-up song",
      "Hype song", "Cry song", "Spirit animal", "Roman empire",
      "Last thing you Googled", "Recent search history gem",
      "Screenshot you'd be embarrassed to share", "Most used emoji",
      "Most embarrassing playlist", "Spotify wrapped surprise",
      "Netflix shame watch", "YouTube rabbit hole", "TikTok obsession",
      "Instagram lurk confession", "Twitter hot take", "Reddit guilty pleasure",
      "Group chat nickname", "Contact name for yourself", "WiFi password choice",
      "Phone wallpaper meaning", "Lock screen story", "Most recent photo",
      "Camera roll gem", "Deleted photo regret", "Screenshot collection theme",
      "Alarm sound choice", "Ringtone explanation", "Notification sound",
      "Battery percentage anxiety level", "Unread messages count",
      "Open browser tabs situation", "Last app used", "Screen time offender",
      "Autocorrect fail", "Typo you always make", "Word you can't spell",
      "Phrase you overuse", "Conversation ender", "Small talk topic",
      "Icebreaker question", "Fun fact about yourself", "Party trick",
      "Useless skill", "Weird flex", "Humble brag", "Unpopular opinion"
    ];

    // Pre-generate the pool for consistent performance
    this.themePool = this.generateThemePool();
  }

  /**
   * Generate the full pool of unique themes (100+)
   */
  generateThemePool() {
    const themes = new Set();

    // Add all standalones
    this.standalones.forEach(standalone => {
      themes.add(this.fillTemplate("{standalone}", { standalone }));
    });

    // Generate from templates
    this.templates.forEach(template => {
      if (template.includes("{category}")) {
        // Sample categories to avoid too many combinations
        const sampleSize = Math.ceil(this.categories.length / 3);
        const sampledCategories = this.getRandomSample(this.categories, sampleSize);
        
        sampledCategories.forEach(category => {
          themes.add(this.fillTemplate(template, { category }));
        });
      } else if (template.includes("{action}")) {
        const sampleSize = Math.ceil(this.actions.length / 3);
        const sampledActions = this.getRandomSample(this.actions, sampleSize);
        
        sampledActions.forEach(action => {
          themes.add(this.fillTemplate(template, { action }));
        });
      } else if (template.includes("{adjective}")) {
        const sampleSize = Math.ceil(this.adjectives.length / 2);
        const sampledAdjectives = this.getRandomSample(this.adjectives, sampleSize);
        
        sampledAdjectives.forEach(adjective => {
          themes.add(this.fillTemplate(template, { adjective }));
        });
      } else if (template.includes("{hypothetical}")) {
        const sampleSize = Math.ceil(this.hypotheticals.length / 3);
        const sampledHypotheticals = this.getRandomSample(this.hypotheticals, sampleSize);
        
        sampledHypotheticals.forEach(hypothetical => {
          themes.add(this.fillTemplate(template, { hypothetical }));
        });
      }
    });

    return Array.from(themes);
  }

  /**
   * Fill a template with values
   */
  fillTemplate(template, values) {
    let result = template;
    Object.keys(values).forEach(key => {
      result = result.replace(`{${key}}`, values[key]);
    });
    return result;
  }

  /**
   * Get random sample from array
   */
  getRandomSample(arr, size) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(size, arr.length));
  }

  /**
   * Get random themes from the pool
   * @param {number} count - Number of themes to return
   * @returns {Array<string>} Array of theme strings
   */
  getRandomThemes(count = 3) {
    const shuffled = [...this.themePool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Get total number of unique themes available
   */
  getTotalThemeCount() {
    return this.themePool.length;
  }

  /**
   * Generate a completely fresh theme on the fly (not from pool)
   * Useful for ensuring uniqueness in a session
   */
  generateFreshTheme() {
    const templateIndex = Math.floor(Math.random() * this.templates.length);
    const template = this.templates[templateIndex];

    if (template.includes("{category}")) {
      const category = this.categories[Math.floor(Math.random() * this.categories.length)];
      return this.fillTemplate(template, { category });
    } else if (template.includes("{action}")) {
      const action = this.actions[Math.floor(Math.random() * this.actions.length)];
      return this.fillTemplate(template, { action });
    } else if (template.includes("{adjective}")) {
      const adjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
      return this.fillTemplate(template, { adjective });
    } else if (template.includes("{hypothetical}")) {
      const hypothetical = this.hypotheticals[Math.floor(Math.random() * this.hypotheticals.length)];
      return this.fillTemplate(template, { hypothetical });
    } else if (template.includes("{standalone}")) {
      const standalone = this.standalones[Math.floor(Math.random() * this.standalones.length)];
      return this.fillTemplate(template, { standalone });
    }

    return this.themePool[Math.floor(Math.random() * this.themePool.length)];
  }

  /**
   * Get a session-unique set of themes
   * Tracks used themes within a session to avoid repetition
   */
  createSessionManager() {
    const usedThemes = new Set();
    const availableThemes = [...this.themePool];

    return {
      getThemes: (count = 3) => {
        // Filter out used themes
        const available = availableThemes.filter(theme => !usedThemes.has(theme));
        
        // If we're running low, reset
        if (available.length < count) {
          usedThemes.clear();
          available.length = 0;
          available.push(...this.themePool);
        }

        // Get random themes
        const shuffled = available.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, count);

        // Mark as used
        selected.forEach(theme => usedThemes.add(theme));

        return selected;
      },
      reset: () => {
        usedThemes.clear();
      },
      getUsedCount: () => usedThemes.size,
      getTotalCount: () => this.themePool.length
    };
  }
}

module.exports = ThemeGenerator;
