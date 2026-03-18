/**
 * communityEngine.js
 * Simulated community logic for the HEARD Community Hub.
 * Handles live feed, trending drops, and NPC trade desks.
 */

const CommunityHub = {
  tokens: 100,
  score: 0,
  activityFeed: [],
  
  init() {
    console.log("Community Hub Initialized");
    this.loadState();
    this.startActivityFeed();
    this.refreshTrending();
    this.updateDashboard();
  },

  loadState() {
    const savedTokens = localStorage.getItem('heard_tokens');
    if (savedTokens) this.tokens = parseInt(savedTokens);
    this.score = allCards.length * 10; // Simple score based on collection
  },

  saveState() {
    localStorage.setItem('heard_tokens', this.tokens);
  },

  updateDashboard() {
    const scoreEl = document.getElementById('hubScore');
    const tokensEl = document.getElementById('hubTokens');
    const handleEl = document.getElementById('hubHandle');
    const avatarEl = document.getElementById('hubAvatar');
    
    const handle = (settings && settings.handle) || '@collector';
    if (scoreEl) scoreEl.textContent = (allCards.length * 10).toLocaleString();
    if (tokensEl) tokensEl.textContent = this.tokens.toLocaleString();
    if (handleEl) handleEl.textContent = handle;
    if (avatarEl) {
      const initial = handle.replace(/^@/, '')[0] || 'H';
      avatarEl.textContent = initial.toUpperCase();
    }
  },

  startActivityFeed() {
    // Initial items
    for(let i=0; i<3; i++) this.addFeedItem();
    
    // Periodic updates
    setInterval(() => {
      if (currentTab === 'hub') {
        this.addFeedItem();
      }
    }, 15000); // Every 15s
  },

  addFeedItem() {
    const users = ['vibe_check', 'neo_soul', 'crate_digger', 'echo_chamber', 'vinyl_eyes'];
    const actions = ['just claimed', 'added to deck', 'is hunting for', 'flipped'];
    const user = users[Math.floor(Math.random() * users.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    
    const feedList = document.getElementById('communityFeedList');
    if (!feedList) return;

    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
      <div class="feed-avatar">${user[0].toUpperCase()}</div>
      <div class="feed-content">
        <div class="feed-user">${user}</div>
        <div class="feed-copy">${action} a rare find.</div>
        <div class="feed-meta">just now</div>
      </div>
    `;
    
    feedList.prepend(item);
    if (feedList.children.length > 5) feedList.lastElementChild.remove();
  },

  async refreshTrending() {
    const container = document.getElementById('trendingCrate');
    if (!container) return;
    
    // Mock trending data - In real app, this could be from iTunes or a scraping skill
    const trending = [
      { id: 't1', title: 'Starboy', artist: 'The Weeknd', art: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/91/91/91/91919191-9191-9191-9191-919191919191/886446187212.jpg/200x200bb.jpg' },
      { id: 't2', title: 'Self Control', artist: 'Frank Ocean', art: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/92/92/92/92929292-9292-9292-9292-929292929292/886446187212.jpg/200x200bb.jpg' },
      { id: 't3', title: 'After Hours', artist: 'The Weeknd', art: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/93/93/93/93939393-9393-9393-9393-939393939393/886446187212.jpg/200x200bb.jpg' }
    ];

    container.innerHTML = trending.map(item => `
      <div class="trending-card" onclick="previewTrending('${item.id}')">
        <img src="${item.art}" alt="${item.title}">
        <div class="trending-card-info">
          <div class="trending-card-title">${item.title}</div>
          <div class="trending-card-artist">${item.artist}</div>
        </div>
      </div>
    `).join('');
  }
};

/** Global wrappers for HTML event listeners **/
window.refreshTrending = () => CommunityHub.refreshTrending();
window.previewTrending = (id) => {
  haptic('light');
  showToast("Previewing drop...");
  // Logic to show a card preview from ITunes API based on ID
};

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // We need to wait for the main app to load cards first
  setTimeout(() => CommunityHub.init(), 1000);
});
