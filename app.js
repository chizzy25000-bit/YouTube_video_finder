const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const LONG_FORM_MINUTES = 8;
const IDEAL_DEPTH_MINUTES = 18;

const form = document.querySelector('#search-form');
const statusMessage = document.querySelector('#status-message');
const results = document.querySelector('#results');
const template = document.querySelector('#video-card-template');
const submitButton = document.querySelector('.primary-button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const query = formData.get('query').trim();
  const apiKey = formData.get('apiKey').trim();
  const resultCount = Number(formData.get('resultCount'));

  if (!query || !apiKey) {
    setStatus('Please enter both a topic and a YouTube Data API key.');
    return;
  }

  setLoading(true);
  clearResults();
  setStatus(`Searching YouTube for “${query}” and ranking information-rich videos...`);

  try {
    const videos = await findVideos(query, apiKey, resultCount);

    if (videos.length === 0) {
      setStatus('No embeddable videos were found. Try a broader search phrase.');
      return;
    }

    renderVideos(videos, query);
    setStatus(`Found ${videos.length} strong matches for “${query}”, sorted by usefulness score.`);
  } catch (error) {
    setStatus(getFriendlyError(error));
  } finally {
    setLoading(false);
  }
});

async function findVideos(query, apiKey, maxResults) {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    videoEmbeddable: 'true',
    relevanceLanguage: 'en',
    safeSearch: 'moderate',
    maxResults: String(maxResults),
    key: apiKey,
  });

  const searchData = await getJson(`${YOUTUBE_API_BASE}/search?${searchParams}`);
  const videoIds = searchData.items.map((item) => item.id.videoId).filter(Boolean);

  if (videoIds.length === 0) {
    return [];
  }

  const videoParams = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: videoIds.join(','),
    key: apiKey,
  });

  const videoData = await getJson(`${YOUTUBE_API_BASE}/videos?${videoParams}`);

  return videoData.items
    .map((video) => enrichVideo(video, query, videoIds.indexOf(video.id)))
    .sort((left, right) => right.score - left.score);
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || 'YouTube returned an error.';
    throw new Error(message);
  }

  return data;
}

function enrichVideo(video, query, searchPosition) {
  const durationSeconds = parseIsoDuration(video.contentDetails.duration);
  const viewCount = Number(video.statistics.viewCount || 0);
  const likeCount = Number(video.statistics.likeCount || 0);
  const description = video.snippet.description || '';
  const title = video.snippet.title || '';
  const relevance = calculateTextMatch(`${title} ${description}`, query);
  const score = calculateScore({
    relevance,
    searchPosition,
    durationSeconds,
    viewCount,
    likeCount,
    descriptionLength: description.length,
  });

  return {
    id: video.id,
    title,
    channel: video.snippet.channelTitle,
    description,
    thumbnail: getBestThumbnail(video.snippet.thumbnails),
    publishedAt: video.snippet.publishedAt,
    durationSeconds,
    viewCount,
    likeCount,
    relevance,
    score,
  };
}

function calculateScore({ relevance, searchPosition, durationSeconds, viewCount, likeCount, descriptionLength }) {
  const minutes = durationSeconds / 60;
  const relevanceScore = relevance * 38;
  const searchRankScore = Math.max(0, 18 - searchPosition * 1.4);
  const depthScore = Math.min(20, minutes >= LONG_FORM_MINUTES ? minutes / IDEAL_DEPTH_MINUTES * 20 : minutes);
  const descriptionScore = Math.min(12, descriptionLength / 90);
  const viewsScore = Math.min(8, Math.log10(viewCount + 1));
  const engagementScore = Math.min(4, Math.log10(likeCount + 1));

  return Math.round((relevanceScore + searchRankScore + depthScore + descriptionScore + viewsScore + engagementScore) * 10) / 10;
}

function calculateTextMatch(text, query) {
  const searchable = normalizeWords(text);
  const queryWords = normalizeWords(query);

  if (queryWords.length === 0) {
    return 0;
  }

  const matchedWords = queryWords.filter((word) => searchable.includes(word));
  return matchedWords.length / queryWords.length;
}

function normalizeWords(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function parseIsoDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) {
    return 0;
  }

  const [, hours = 0, minutes = 0, seconds = 0] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function getBestThumbnail(thumbnails = {}) {
  return thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '';
}

function renderVideos(videos, query) {
  const fragment = document.createDocumentFragment();

  videos.forEach((video, index) => {
    const card = template.content.cloneNode(true);
    const url = `https://www.youtube.com/watch?v=${video.id}`;

    card.querySelector('.thumbnail-link').href = url;
    card.querySelector('.thumbnail').src = video.thumbnail;
    card.querySelector('.thumbnail').alt = `Thumbnail for ${video.title}`;
    card.querySelector('.duration').textContent = formatDuration(video.durationSeconds);
    card.querySelector('.rank-badge').textContent = `#${index + 1}`;
    card.querySelector('.score-pill').textContent = `${video.score}/100 usefulness`;
    card.querySelector('.video-title').href = url;
    card.querySelector('.video-title').textContent = video.title;
    card.querySelector('.channel').textContent = video.channel;
    card.querySelector('.description').textContent = summarize(video.description);
    card.querySelector('.views').textContent = formatNumber(video.viewCount);
    card.querySelector('.likes').textContent = formatNumber(video.likeCount);
    card.querySelector('.published').textContent = formatDate(video.publishedAt);
    card.querySelector('.why').textContent = explainRanking(video, query);

    fragment.append(card);
  });

  results.append(fragment);
}

function explainRanking(video, query) {
  const minutes = Math.round(video.durationSeconds / 60);
  const matchPercent = Math.round(video.relevance * 100);
  const details = [
    `${matchPercent}% keyword overlap with “${query}”`,
    `${minutes} minute runtime`,
    `${formatNumber(video.viewCount)} views`,
  ];

  if (video.description.length > 250) {
    details.push('detailed description');
  }

  return `Why this ranks well: ${details.join(', ')}.`;
}

function summarize(text) {
  if (!text) {
    return 'No description was provided for this video.';
  }

  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date));
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function clearResults() {
  results.replaceChildren();
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? 'Searching...' : 'Find best videos';
}

function getFriendlyError(error) {
  const message = error.message.toLowerCase();

  if (message.includes('key') || message.includes('quota')) {
    return `YouTube API problem: ${error.message}`;
  }

  return `Search failed: ${error.message}`;
}
